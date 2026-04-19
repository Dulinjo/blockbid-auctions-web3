import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  MessageCircle,
  Send,
  Sparkles,
  X,
  ExternalLink,
  Wallet,
  Gavel,
  Plus,
  Github,
  Search,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWallet } from "@/contexts/WalletContext";
import { getAllAuctions, type OnChainAuction } from "@/lib/contract";
import { refreshAuctionMetadata, getAllAuctionMetadata } from "@/lib/auctionMetadata";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type Lang = "sr" | "en";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function makeId() {
  return Math.random().toString(36).slice(2);
}

/**
 * Light language detection from a string. Looks for Serbian-only diacritics
 * and a few common Serbian words (latinica). Defaults to Serbian when unsure.
 */
function detectLang(text: string): Lang {
  const t = text.toLowerCase();
  if (/[čćžšđ]/.test(t)) return "sr";
  if (
    /\b(kako|gde|šta|sta|aukcij|ponud|wallet|povež|pove[zž]|napravim|otvori|prikaž|prikaz|moja|moj|tvoj|aktivn|završ|zavrs|zdravo|ćao|cao)\b/.test(
      t,
    )
  )
    return "sr";
  if (
    /\b(the|how|what|where|connect|wallet|auction|bid|create|show|open|active|ending|hello|hi|hey)\b/.test(
      t,
    )
  )
    return "en";
  return "sr";
}

const QUICK_ACTIONS_SR = [
  { label: "Aukcije", icon: Search, prompt: "Koje su aktivne aukcije?" },
  { label: "Uskoro završavaju", icon: Clock, prompt: "Pokaži aukcije koje se uskoro završavaju" },
  { label: "Wallet", icon: Wallet, prompt: "Kako da povežem wallet?" },
  { label: "Bid", icon: Gavel, prompt: "Kako da dam ponudu?" },
  { label: "Kreiraj", icon: Plus, prompt: "Kako da napravim aukciju?" },
  { label: "Contract", icon: ExternalLink, prompt: "Gde mogu da vidim blockchain zapis?" },
  { label: "GitHub", icon: Github, prompt: "Gde je izvorni kod?" },
];

const QUICK_ACTIONS_EN = [
  { label: "Auctions", icon: Search, prompt: "Which auctions are active?" },
  { label: "Ending soon", icon: Clock, prompt: "Show auctions ending soon" },
  { label: "Wallet", icon: Wallet, prompt: "How do I connect my wallet?" },
  { label: "Bid", icon: Gavel, prompt: "How do I place a bid?" },
  { label: "Create", icon: Plus, prompt: "How do I create an auction?" },
  { label: "Contract", icon: ExternalLink, prompt: "Where can I see the blockchain record?" },
  { label: "GitHub", icon: Github, prompt: "Where is the source code?" },
];

function welcomeFor(route: string, connected: boolean, lang: Lang): string {
  const sr = lang === "sr";

  if (route.startsWith("/marketplace")) {
    return sr
      ? "Dobrodošli na **Marketplace** 👋\nAukcije koje se najpre završavaju su na vrhu. Mogu da vam pomognem da pronađete aktivne aukcije ili da objasnim kako da bidujete."
      : "Welcome to the **Marketplace** 👋\nAuctions ending soonest appear first. I can help you find active auctions or explain how bidding works.";
  }
  if (route.startsWith("/auction/")) {
    return sr
      ? connected
        ? "Pregledate aukciju. Možete kliknuti **Place Bid** da date ponudu — mora biti viša od trenutnog minimuma."
        : "Pregledate aukciju. Pregled je besplatan — povežite wallet (gore desno) da date ponudu."
      : connected
        ? "You're viewing an auction. Click **Place Bid** to bid — your amount must beat the current minimum."
        : "You're viewing an auction. Browsing is free — connect a wallet (top-right) to place a bid.";
  }
  if (route.startsWith("/create")) {
    return sr
      ? "Pravite aukciju. Potrebno je: naslov, početna cena (ETH), trajanje (minuti). Slika i opis su off-chain, ostalo ide on-chain."
      : "Creating an auction. Required: title, starting price (ETH), duration (minutes). Image & description are off-chain; the rest goes on-chain.";
  }
  if (route.startsWith("/dashboard")) {
    return sr
      ? "Ovo je vaš **Dashboard** — vaše aukcije, vaše ponude i sredstva za podizanje (withdraw)."
      : "This is your **Dashboard** — your auctions, your bids, and any refunds available to withdraw.";
  }

  // Home / default
  return sr
    ? `Dobrodošli u **BlockBid** 👋\nMožete pregledati aukcije bez wallet-a. Za **kreiranje aukcije** i **davanje ponuda** potrebno je povezati wallet na Sepolia mreži.\n\nPitajte me bilo šta — mogu da pronađem aktivne aukcije, objasnim funkcije i pošaljem direktne linkove.`
    : `Welcome to **BlockBid** 👋\nYou can browse auctions without a wallet. **Creating auctions** and **placing bids** requires a wallet on the Sepolia network.\n\nAsk me anything — I can find active auctions, explain features, and share direct links.`;
}

type AuctionSnapshot = {
  id: number;
  title: string;
  status: "active" | "ended";
  endsAtMs: number;
  highestBidEth: string;
  startingBidEth: string;
  hasImage: boolean;
  seller: string;
};

function snapshotFromOnchain(list: OnChainAuction[]): AuctionSnapshot[] {
  const meta = getAllAuctionMetadata();
  return list
    .map<AuctionSnapshot>((a) => ({
      id: a.id,
      title: a.title,
      status: a.active ? "active" : "ended",
      endsAtMs: a.endsAtMs,
      highestBidEth: a.highestBidEth,
      startingBidEth: a.startingBidEth,
      hasImage: !!meta[a.id]?.imageUrl,
      seller: a.seller,
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.endsAtMs - b.endsAtMs;
    });
}

export function AIAssistant() {
  const location = useLocation();
  const { wallet } = useWallet();
  const connected = !!wallet?.address;

  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lang, setLang] = useState<Lang>("sr");
  const [auctions, setAuctions] = useState<AuctionSnapshot[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load auction snapshot lazily on first open and refresh every 60s while open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const [list] = await Promise.all([getAllAuctions(), refreshAuctionMetadata().catch(() => null)]);
        if (!cancelled) setAuctions(snapshotFromOnchain(list));
      } catch (e) {
        console.warn("[AIAssistant] auction snapshot failed", e);
      }
    }
    void load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open]);

  // Seed welcome on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        { id: makeId(), role: "assistant", content: welcomeFor(location.pathname, connected, lang) },
      ]);
    }
  }, [open, messages.length, location.pathname, connected, lang]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const detected = detectLang(trimmed);
    setLang(detected);

    const userMsg: Message = { id: makeId(), role: "user", content: trimmed };
    const assistantId = makeId();
    setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON}`,
        },
        body: JSON.stringify({
          messages: history,
          context: {
            route: location.pathname,
            connected,
            walletAddress: wallet?.address ?? null,
            network: wallet?.network ?? null,
            auctions,
          },
        }),
      });

      if (!resp.ok || !resp.body) {
        let msg = detected === "sr" ? "Greška u komunikaciji sa asistentom." : "Assistant error.";
        if (resp.status === 429)
          msg =
            detected === "sr"
              ? "Previše zahteva. Pokušajte ponovo za nekoliko sekundi."
              : "Too many requests. Try again in a few seconds.";
        if (resp.status === 402)
          msg =
            detected === "sr"
              ? "Asistent je trenutno nedostupan (krediti potrošeni)."
              : "Assistant is temporarily unavailable (credits exhausted).";
        setMessages((m) =>
          m.map((x) => (x.id === assistantId ? { ...x, content: msg } : x)),
        );
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let done = false;

      while (!done) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              acc += delta;
              setMessages((m) =>
                m.map((x) => (x.id === assistantId ? { ...x, content: acc } : x)),
              );
            }
          } catch {
            // partial JSON — push back and wait
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // flush any leftover lines
      if (buffer.trim()) {
        for (let raw of buffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const payload = raw.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              acc += delta;
              setMessages((m) =>
                m.map((x) => (x.id === assistantId ? { ...x, content: acc } : x)),
              );
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      console.error("[AIAssistant] stream error", e);
      const errMsg =
        detected === "sr"
          ? "Došlo je do greške. Pokušajte ponovo."
          : "Something went wrong. Please try again.";
      setMessages((m) =>
        m.map((x) => (x.id === assistantId ? { ...x, content: errMsg } : x)),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setHasOpened(true);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setOpen(false);
  };

  const dotPulse = useMemo(
    () =>
      !hasOpened ? (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
        </span>
      ) : null,
    [hasOpened],
  );

  const quickActions = lang === "sr" ? QUICK_ACTIONS_SR : QUICK_ACTIONS_EN;
  const placeholder =
    lang === "sr" ? "Pitajte bilo šta o BlockBid-u..." : "Ask anything about BlockBid...";
  const subtitle =
    lang === "sr" ? "Online · Vodič kroz aukcije" : "Online · Auction guide";

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Open BlockBid assistant"
          className={cn(
            "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full",
            "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground",
            "shadow-[0_8px_32px_hsl(252_95%_65%/0.45)] hover:shadow-[0_12px_40px_hsl(252_95%_65%/0.6)]",
            "transition-transform duration-200 hover:scale-105 active:scale-95",
          )}
        >
          <MessageCircle className="h-6 w-6" />
          {dotPulse}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-card shadow-elevated",
            // Mobile: nearly full screen sheet
            "inset-x-3 bottom-3 top-16 rounded-2xl",
            // Desktop: corner panel
            "sm:inset-auto sm:bottom-5 sm:right-5 sm:top-auto sm:h-[620px] sm:w-[420px] sm:max-h-[calc(100vh-2.5rem)]",
          )}
          role="dialog"
          aria-label="BlockBid assistant"
        >
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-border/60 bg-gradient-to-br from-primary/15 via-primary-glow/10 to-accent/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow">
                <Bot className="h-5 w-5 text-primary-foreground" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  BlockBid Assistant
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                </p>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLang(lang === "sr" ? "en" : "sr")}
                className="rounded-full border border-border/70 bg-secondary/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Toggle language"
              >
                {lang === "sr" ? "SR" : "EN"}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                aria-label="Close assistant"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="flex flex-col gap-3 px-4 py-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} onClose={handleClose} />
              ))}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick actions */}
          <div className="border-t border-border/60 px-3 py-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => send(a.prompt)}
                  disabled={streaming}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  <a.icon className="h-3.5 w-3.5 text-accent" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-3 py-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              className="h-10 bg-secondary/60 text-sm"
              autoComplete="off"
              disabled={streaming}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground hover:opacity-90"
              disabled={!input.trim() || streaming}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg, onClose }: { msg: Message; onClose: () => void }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {renderMarkdown(msg.content, onClose)}
      </div>
    </div>
  );
}

const SITE_BASE = "https://blockbid-auctions-web3.lovable.app";

/**
 * Tiny markdown renderer — handles **bold**, [label](url), and bullet lines.
 * Internal links (matching SITE_BASE or starting with "/") become <Link> so
 * the SPA navigates without a full reload and the panel closes.
 */
function renderMarkdown(text: string, onClose: () => void) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    const isBullet = /^\s*[-*]\s+/.test(line);
    const cleaned = isBullet ? line.replace(/^\s*[-*]\s+/, "") : line;
    const inline = renderInline(cleaned, onClose);
    return (
      <div key={lineIdx} className={cn(isBullet && "flex gap-2")}>
        {isBullet && <span className="text-accent">•</span>}
        <span>{inline}</span>
      </div>
    );
  });
}

function renderInline(text: string, onClose: () => void) {
  // Tokenize: **bold**, [label](url), plain
  const tokens: Array<{ type: "bold" | "link" | "text"; value: string; href?: string }> = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: "bold", value: m[1] });
    else tokens.push({ type: "link", value: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });

  return tokens.map((tok, i) => {
    if (tok.type === "bold")
      return (
        <strong key={i} className="font-semibold">
          {tok.value}
        </strong>
      );
    if (tok.type === "link" && tok.href) {
      const internal =
        tok.href.startsWith("/") ||
        (tok.href.startsWith(SITE_BASE) && tok.href.length > SITE_BASE.length);
      const path = tok.href.startsWith(SITE_BASE)
        ? tok.href.slice(SITE_BASE.length) || "/"
        : tok.href;
      if (internal) {
        return (
          <Link
            key={i}
            to={path}
            onClick={onClose}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {tok.value}
          </Link>
        );
      }
      return (
        <a
          key={i}
          href={tok.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-accent underline-offset-2 hover:underline"
        >
          {tok.value}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return <span key={i}>{tok.value}</span>;
  });
}
