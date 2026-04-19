import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, MessageCircle, Send, Sparkles, X, ExternalLink, Wallet, Gavel, Plus, Github, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWallet } from "@/contexts/WalletContext";

type LinkRef = {
  label: string;
  href: string;
  external?: boolean;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  links?: LinkRef[];
  suggestions?: string[];
};

const LINKS = {
  marketplace: "/marketplace",
  create: "/create",
  dashboard: "/dashboard",
  contract: "/contract",
  etherscan: "https://sepolia.etherscan.io/address/0x32A5C515cbb766A6Df86CF2073ef755a45e8d746",
  github: "https://github.com/Dulinjo/blockbid-auctions-web3",
  marketplaceFull: "https://blockbid-auctions-web3.lovable.app/marketplace",
  sepoliaFaucet: "https://sepoliafaucet.com/",
};

const QUICK_PROMPTS = [
  "How do I connect my wallet?",
  "How do I place a bid?",
  "How do I create an auction?",
  "What is Sepolia?",
  "How do I test with two accounts?",
  "Can I browse without a wallet?",
];

function makeId() {
  return Math.random().toString(36).slice(2);
}

/** Rule-based intent matcher → returns an assistant Message. */
function answer(input: string, ctx: { route: string; connected: boolean }): Message {
  const q = input.toLowerCase().trim();
  const has = (...keys: string[]) => keys.some((k) => q.includes(k));

  // Greetings
  if (has("hi", "hey", "hello", "zdravo", "cao", "ćao")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Hey! 👋 I'm your BlockBid helper. Ask me anything about browsing, bidding, or creating auctions. Try a quick topic below:",
      suggestions: QUICK_PROMPTS.slice(0, 4),
    };
  }

  // Where are auctions / browse
  if (has("browse", "marketplace", "where", "find auction", "see auction", "list", "auctions")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Head to the Marketplace to browse all auctions. Active ones (ending soonest first) appear at the top, ended ones below. You don't need a wallet to browse.",
      links: [
        { label: "Open Marketplace", href: LINKS.marketplace },
        { label: "View on web", href: LINKS.marketplaceFull, external: true },
      ],
      suggestions: ["How do I place a bid?", "How do I connect my wallet?"],
    };
  }

  // Connect wallet
  if (has("connect", "wallet", "metamask", "rainbow", "coinbase")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Click the **Connect Wallet** button in the top-right. Pick MetaMask, Coinbase, WalletConnect or Rabby. After connecting, switch the network to **Sepolia** if prompted — that's the test network this app runs on.",
      suggestions: ["What is Sepolia?", "How do I switch accounts?"],
    };
  }

  // Place a bid
  if (has("bid", "bidding", "place a bid", "highest bid")) {
    if (!ctx.connected) {
      return {
        id: makeId(),
        role: "assistant",
        content:
          "To place a bid you need a connected wallet on Sepolia. Steps:\n\n1. Connect your wallet (top-right)\n2. Open any active auction from the Marketplace\n3. Click **Place Bid** and enter an amount above the current minimum\n4. Confirm the transaction in your wallet\n\nYou can't bid on your own auction (the contract blocks it).",
        links: [{ label: "Browse auctions", href: LINKS.marketplace }],
        suggestions: ["How do I connect my wallet?", "Why can't I bid on my own auction?"],
      };
    }
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Open an active auction, click **Place Bid**, enter an amount above the current minimum, and confirm in your wallet. If you get outbid later, your funds become available to **withdraw** from your dashboard.",
      links: [
        { label: "Browse auctions", href: LINKS.marketplace },
        { label: "Your dashboard", href: LINKS.dashboard },
      ],
    };
  }

  // Create auction
  if (has("create", "list an item", "sell", "new auction")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "To create an auction: connect your wallet, then open **Create Auction**. Fill in title, description, image, starting bid (in ETH), and duration in minutes. Confirm the transaction — your auction goes live immediately.",
      links: [
        { label: "Create Auction", href: LINKS.create },
        { label: "Marketplace", href: LINKS.marketplace },
      ],
      suggestions: ["How do I place a bid?", "How do I switch accounts?"],
    };
  }

  // Self-bid
  if (has("own auction", "my own", "self bid", "self-bid", "can't bid")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "The smart contract prevents the seller from bidding on their own auction — it would inflate the price unfairly. To test bidding on your own listing, switch to a different wallet account (see: how to test with two accounts).",
      suggestions: ["How do I test with two accounts?", "How do I switch accounts?"],
    };
  }

  // Switch accounts / test with two accounts
  if (has("switch account", "two account", "second account", "test account", "another account", "change account")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Easiest way to test with two accounts:\n\n1. In MetaMask, click the account icon → **Add account** → create Account 2\n2. Send a bit of Sepolia ETH to it from a faucet\n3. In MetaMask switch to Account 2, then in BlockBid disconnect & reconnect\n4. Now you can bid on auctions created by Account 1\n\nTip: keep both accounts funded with Sepolia ETH.",
      links: [{ label: "Sepolia faucet", href: LINKS.sepoliaFaucet, external: true }],
      suggestions: ["What is Sepolia?", "How do I place a bid?"],
    };
  }

  // Sepolia
  if (has("sepolia", "testnet", "test network", "fake eth", "real money")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Sepolia is Ethereum's main test network. The ETH used here has **no real value** — it's free test ETH from a faucet. BlockBid runs only on Sepolia, so you can experiment safely without spending real money.",
      links: [
        { label: "Get Sepolia ETH", href: LINKS.sepoliaFaucet, external: true },
        { label: "View contract on Etherscan", href: LINKS.etherscan, external: true },
      ],
    };
  }

  // Browse without wallet / guest
  if (has("guest", "without wallet", "without connect", "without log", "no wallet", "browse without")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Yes! As a guest you can:\n\n• Browse the Marketplace\n• Open any auction's details\n• See prices, status, and time remaining\n\nYou only need a wallet to **create**, **bid**, **end**, or **withdraw**.",
      links: [{ label: "Browse Marketplace", href: LINKS.marketplace }],
    };
  }

  // Active vs ended
  if (has("active", "ended", "ending", "status", "finished", "closed")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "The Marketplace shows **Ending soon** at the top (active auctions sorted by nearest end time), and **Ended** auctions below. Each card shows a status badge and a live countdown for active ones.",
      links: [{ label: "Open Marketplace", href: LINKS.marketplace }],
    };
  }

  // End auction / withdraw
  if (has("end auction", "finalize", "close auction", "withdraw", "claim")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Once an auction's countdown hits zero, anyone can call **End Auction** from its details page. The seller receives the highest bid, and outbid users can **Withdraw** their refunds from the Dashboard.",
      links: [{ label: "Your dashboard", href: LINKS.dashboard }],
    };
  }

  // Contract / blockchain proof
  if (has("contract", "etherscan", "blockchain", "on-chain", "proof", "verify")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "All auction logic lives in a Solidity smart contract on Sepolia. You can inspect every transaction on Etherscan or read the on-chain methods from the Contract page in this app.",
      links: [
        { label: "View on Etherscan", href: LINKS.etherscan, external: true },
        { label: "Contract page", href: LINKS.contract },
      ],
    };
  }

  // Code / repo
  if (has("code", "github", "repo", "source", "open source")) {
    return {
      id: makeId(),
      role: "assistant",
      content: "The full source is on GitHub — frontend, smart contract, and docs.",
      links: [{ label: "GitHub repository", href: LINKS.github, external: true }],
    };
  }

  // Mobile
  if (has("mobile", "phone", "responsive")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "BlockBid works on mobile too. For wallet actions on a phone, use a wallet's in-app browser (MetaMask / Coinbase Wallet) for the smoothest experience. WalletConnect also works from a desktop wallet to a mobile app.",
      suggestions: ["How do I connect my wallet?"],
    };
  }

  // Help / what can you do
  if (has("help", "what can you", "options", "menu")) {
    return {
      id: makeId(),
      role: "assistant",
      content: "I can help you with anything in BlockBid. Pick a topic:",
      suggestions: QUICK_PROMPTS,
    };
  }

  // Fallback
  return {
    id: makeId(),
    role: "assistant",
    content:
      "I'm not sure I caught that — but I can help with browsing, wallets, bidding, creating auctions, switching accounts, or Sepolia. Try one of these:",
    suggestions: QUICK_PROMPTS,
  };
}

function welcomeFor(route: string, connected: boolean): Message {
  if (route.startsWith("/marketplace")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Welcome! 👋 You're on the Marketplace. Active auctions ending soonest are at the top. Tap any card to see details and bid.",
      suggestions: ["How do I place a bid?", "Active vs ended auctions?"],
    };
  }
  if (route.startsWith("/auction/")) {
    return {
      id: makeId(),
      role: "assistant",
      content: connected
        ? "You're viewing an auction. Click **Place Bid** to participate. Your bid must be above the current minimum."
        : "You're viewing an auction. Connect your wallet (top-right) to place a bid. Browsing is free.",
      suggestions: ["How do I place a bid?", "Why can't I bid on my own auction?"],
    };
  }
  if (route.startsWith("/create")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Creating an auction. Required: title, starting bid (ETH), and duration (minutes). Add a clear image and description so bidders know what they're buying.",
      suggestions: ["How do I create an auction?"],
    };
  }
  if (route.startsWith("/dashboard")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "This is your Dashboard — auctions you've created, bids you've placed, and refunds available to withdraw.",
      suggestions: ["How do I withdraw?", "How do I create an auction?"],
    };
  }
  return {
    id: makeId(),
    role: "assistant",
    content: connected
      ? "Hey! 👋 Wallet connected. I can show you how to bid, create an auction, or test with two accounts."
      : "Hey! 👋 I'm your BlockBid guide. Browse freely as a guest, or connect a wallet to bid and create auctions.",
    suggestions: connected
      ? ["How do I create an auction?", "How do I test with two accounts?", "How do I place a bid?"]
      : ["How do I connect my wallet?", "Can I browse without a wallet?", "What is Sepolia?"],
  };
}

const QUICK_ACTIONS = [
  { label: "Browse", icon: Search, prompt: "Where are the auctions?" },
  { label: "Wallet", icon: Wallet, prompt: "How do I connect my wallet?" },
  { label: "Bid", icon: Gavel, prompt: "How do I place a bid?" },
  { label: "Create", icon: Plus, prompt: "How do I create an auction?" },
  { label: "Contract", icon: ExternalLink, prompt: "Show the smart contract" },
  { label: "GitHub", icon: Github, prompt: "Where is the source code?" },
];

export function AIAssistant() {
  const location = useLocation();
  const { wallet } = useWallet();
  const connected = !!wallet?.address;
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Seed welcome on first open / when route or connection changes while closed
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([welcomeFor(location.pathname, connected)]);
    }
  }, [open, messages.length, location.pathname, connected]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, open]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: Message = { id: makeId(), role: "user", content: trimmed };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    // Simulate a tiny "thinking" delay for natural feel
    window.setTimeout(() => {
      const reply = answer(trimmed, { route: location.pathname, connected });
      setMessages((m) => [...m, reply]);
      setTyping(false);
    }, 380);
  };

  const handleOpen = () => {
    setOpen(true);
    setHasOpened(true);
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
            "sm:inset-auto sm:bottom-5 sm:right-5 sm:top-auto sm:h-[600px] sm:w-[400px] sm:max-h-[calc(100vh-2.5rem)]",
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
                <p className="text-xs text-muted-foreground">Online · Helpful guide</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="flex flex-col gap-3 px-4 py-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} onSuggestionClick={send} onClose={() => setOpen(false)} />
              ))}
              {typing && (
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
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => send(a.prompt)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-secondary hover:text-foreground"
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
              placeholder="Ask anything about BlockBid..."
              className="h-10 bg-secondary/60 text-sm"
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground hover:opacity-90"
              disabled={!input.trim()}
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

function MessageBubble({
  msg,
  onSuggestionClick,
  onClose,
}: {
  msg: Message;
  onSuggestionClick: (prompt: string) => void;
  onClose: () => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {renderInline(msg.content)}
      </div>

      {!!msg.links?.length && (
        <div className="flex flex-wrap gap-1.5">
          {msg.links.map((l) =>
            l.external ? (
              <a
                key={l.href + l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <ExternalLink className="h-3 w-3" />
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href + l.label}
                to={l.href}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {l.label}
              </Link>
            ),
          )}
        </div>
      )}

      {!!msg.suggestions?.length && (
        <div className="flex flex-wrap gap-1.5">
          {msg.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestionClick(s)}
              className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Minimal **bold** renderer to keep messages friendly without a full md lib. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
