// BlockBid in-app AI assistant.
// Streams responses from Lovable AI Gateway (Gemini) and is given a snapshot
// of the user's current page + on-chain auction list so it can give precise,
// link-rich answers in Serbian or English.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ClientAuction {
  id: number;
  title: string;
  status: "active" | "ended";
  endsAtMs: number;
  highestBidEth: string;
  startingBidEth: string;
  hasImage: boolean;
  seller: string;
}

interface ChatContext {
  route?: string;
  connected?: boolean;
  walletAddress?: string | null;
  network?: string | null;
  auctions?: ClientAuction[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SITE_BASE = "https://blockbid-auctions-web3.lovable.app";
const ETHERSCAN = "https://sepolia.etherscan.io/address/0x32A5C515cbb766A6Df86CF2073ef755a45e8d746";
const GITHUB = "https://github.com/Dulinjo/blockbid-auctions-web3";

function fmtAuctions(list: ClientAuction[] | undefined): string {
  if (!list || list.length === 0) return "No auctions are currently loaded in the app.";
  // Cap to keep prompt small.
  const capped = list.slice(0, 40);
  return capped
    .map((a) => {
      const url = `${SITE_BASE}/auction/${a.id}`;
      const ms = a.endsAtMs - Date.now();
      const left =
        a.status === "ended" || ms <= 0
          ? "ended"
          : ms < 60_000
            ? `${Math.max(1, Math.floor(ms / 1000))}s left`
            : ms < 3_600_000
              ? `${Math.floor(ms / 60_000)}m left`
              : ms < 86_400_000
                ? `${Math.floor(ms / 3_600_000)}h left`
                : `${Math.floor(ms / 86_400_000)}d left`;
      return `#${a.id} "${a.title}" — ${a.status} (${left}), highest ${a.highestBidEth} ETH, start ${a.startingBidEth} ETH, seller ${a.seller.slice(0, 6)}…${a.seller.slice(-4)} → ${url}`;
    })
    .join("\n");
}

function buildSystemPrompt(ctx: ChatContext): string {
  const auctionsBlock = fmtAuctions(ctx.auctions);
  const wallet = ctx.connected
    ? `Connected: ${ctx.walletAddress ?? "unknown"} on ${ctx.network ?? "unknown network"}.`
    : "User is a guest (no wallet connected).";
  const route = ctx.route || "/";

  return `You are the in-app AI assistant for BlockBid, a Web3 auction app on the Ethereum Sepolia testnet.

LANGUAGE RULES (very important):
- Detect the language of the user's last message.
- If the user writes in Serbian (latinica or ćirilica), reply in natural Serbian (latinica by default).
- If the user writes in English, reply in English.
- If the language is unclear, default to Serbian.
- Never mix the two languages in one reply unless quoting a UI label.

ROLE:
- Help users understand and navigate BlockBid.
- Explain how to browse, connect a wallet, create auctions, place bids, end auctions, and withdraw refunds.
- Be a smart onboarding + navigation guide. Concise, friendly, practical. No fluff.
- Never invent auctions, prices, addresses, or transactions.
- Never claim to perform on-chain actions for the user — only guide them.
- Do NOT mention you are powered by Gemini, Lovable, OpenAI, or any provider.

GUEST vs CONNECTED:
- Guests can browse all auctions and view details — no wallet required.
- A wallet on Sepolia is required only to: create an auction, place a bid, end an auction, withdraw funds.

KNOWN LINKS (use markdown links when sharing):
- Marketplace: ${SITE_BASE}/marketplace
- Create auction: ${SITE_BASE}/create
- Dashboard: ${SITE_BASE}/dashboard
- Smart contract on Etherscan: ${ETHERSCAN}
- Source code on GitHub: ${GITHUB}
- Individual auctions: ${SITE_BASE}/auction/{id}

AUCTION DISCOVERY:
- When the user asks to find auctions, list active ones, ending soon, by topic/keyword in title — use ONLY the live snapshot below.
- Prefer active auctions, sorted by soonest end time. If asked for "ending soon", show the closest first.
- Output auctions as a short markdown list with clickable links to /auction/{id}.
- If no matching auction exists in the snapshot, say so plainly — do not fabricate.

CURRENT CONTEXT:
- Route: ${route}
- Wallet: ${wallet}

LIVE AUCTION SNAPSHOT (truncated to 40):
${auctionsBlock}

STYLE:
- Keep replies short (usually 2–6 sentences or a tight bullet list).
- Use markdown: **bold**, bullet lists, and [label](url) links.
- When relevant, end with one helpful next step or quick suggestion.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = (await req.json()) as {
      messages: ChatMessage[];
      context?: ChatContext;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(context ?? {});

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-12), // keep recent history
        ],
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (upstream.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const body = await upstream.text();
      console.error("[chat-assistant] upstream error", upstream.status, body);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("[chat-assistant] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
