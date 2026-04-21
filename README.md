# BlockBid

BlockBid is a Web3 auction prototype that demonstrates how a modern frontend
can talk to a real Solidity smart contract on the Ethereum **Sepolia testnet**.
It ships with an in-app **AI assistant** that helps users understand the
auction flow, navigate the UI, and answer questions about how the on-chain
logic works.

> Built with React + Vite + TypeScript + Tailwind, ethers.js v6, wagmi /
> RainbowKit, and a thin Supabase-backed metadata layer.

---

## 1. The real-world problem

Traditional online auctions rely on a single trusted operator that controls:

- who is winning,
- whether bids are real,
- when the auction ends, and
- whether the seller actually gets paid.

That centralised trust is also the weakest link — operators can manipulate
bids, leak data, freeze funds or simply disappear. **BlockBid** explores a
different model:

- Auctions, bids, end-time and refund logic live inside a public Solidity
  smart contract on Sepolia.
- Anyone can read the on-chain state — bids, highest bidder, end time —
  directly from the blockchain (Etherscan links are surfaced everywhere in
  the UI).
- The frontend is a thin client: it never custodies funds and never decides
  who wins. It only presents what the chain says and lets the user sign
  transactions with their own wallet.

The result is an auction app where the rules are enforceable code, not
operator policy.

---

## 2. How the AI assistant helps

Web3 UX is famously confusing for newcomers ("what's gas?", "why is my
wallet on the wrong network?", "what does *withdraw* even do?"). BlockBid
includes a small in-app assistant that:

- Explains the auction flow in plain language (Serbian or English,
  auto-detected).
- Helps guests find auctions ("show me auctions ending soon", "what's the
  cheapest active one?") using a **live snapshot** of on-chain data.
- Walks connected users through actions: connecting a wallet, switching to
  Sepolia, placing bids, ending auctions, withdrawing refunds.
- Surfaces direct **Etherscan links** to the contract, individual auctions,
  and the user's own wallet so they can verify everything on-chain.
- Refuses to invent prices, addresses, or transactions — it only talks
  about data the app actually loaded.

The assistant runs in a server-side edge function so the AI provider key
is never exposed to the browser.

---

## 3. Tech stack

**Frontend**
- React 18 + Vite 5 + TypeScript 5
- Tailwind CSS + shadcn/ui (Radix primitives)
- React Router, TanStack Query

**Web3**
- ethers.js v6 (read + write)
- wagmi + RainbowKit (multi-wallet connect: MetaMask, Coinbase, WalletConnect,
  injected EIP-6963)
- Solidity smart contract deployed on Sepolia via Remix IDE

**Backend (optional, for AI assistant + metadata)**
- Supabase (Postgres + Storage + Edge Functions)
- Lovable AI Gateway (Gemini) — accessed only from the edge function

---

## 4. Project structure

```
.
├── public/                       # static assets
├── src/
│   ├── abi/                      # contract ABI (BlockBidAuction.json)
│   ├── components/               # UI + Web3 components (AuctionCard, BidModal, …)
│   ├── contexts/                 # WalletContext
│   ├── hooks/
│   ├── integrations/supabase/    # auto-generated Supabase client + types
│   ├── lib/                      # contract.ts, wagmi.ts, explorer.ts, utils
│   ├── pages/                    # Index, Marketplace, AuctionDetails, …
│   ├── providers/                # Web3Providers (wagmi + RainbowKit)
│   └── services/                 # blockchain.ts (mock/demo service)
├── supabase/
│   └── functions/chat-assistant/ # AI assistant edge function
├── .env.example                  # template — copy to .env and fill in
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## 5. Environment variables

All configuration is read from environment variables. **Nothing secret is
hardcoded in the source.** Copy the template and edit it:

```bash
cp .env.example .env
```

Variables (all are exposed to the browser, so only put publishable values
here — the file is git-ignored anyway):

| Variable                          | Required | Description                                                                 |
| --------------------------------- | -------- | --------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`               | optional | Supabase project URL. Needed for AI assistant + auction metadata.           |
| `VITE_SUPABASE_PUBLISHABLE_KEY`   | optional | Supabase anon (publishable) key. Safe to ship in the browser.               |
| `VITE_SUPABASE_PROJECT_ID`        | optional | Supabase project ref.                                                       |
| `VITE_CONTRACT_ADDRESS`           | optional | Address of your deployed `BlockBidAuction` contract on Sepolia. Falls back to the public demo deployment if omitted. |
| `VITE_WALLETCONNECT_PROJECT_ID`   | optional | Free projectId from https://cloud.reown.com. Only needed for WalletConnect mobile QR; MetaMask & injected wallets work without it. |

> ⚠️ **No real secrets** (private keys, seed phrases, paid API keys, RPC
> auth tokens, etc.) are ever required by this project, and none should
> ever be committed. The Supabase anon key and WalletConnect projectId are
> publishable values by design.

---

## 6. Install & run

Requirements: **Node 18+** (or **Bun 1.x**) and a modern browser. A wallet
extension (MetaMask) is only needed to *write* to the chain — browsing,
reading auctions, and chatting with the assistant work as a guest.

```bash
# 1. install dependencies
npm install
# or: bun install

# 2. configure environment
cp .env.example .env
# edit .env with your own values (or leave defaults for the demo)

# 3. run the dev server
npm run dev
# app is served on http://localhost:8080
```

Other useful scripts:

```bash
npm run build      # production build into dist/
npm run preview    # preview the production build locally
npm run lint       # eslint
npm run test       # vitest (unit tests)
npm run typecheck  # TypeScript compile check (tsc --noEmit)
npm run check:week3 # minimal Week 3 check: typecheck + build
```

---

## 6.1 Week 3 assignment compliance (UkisAI Academy)

This repository satisfies the two required automated checks for the Week 3
assignment:

1. **Code compiles (TypeScript):**  
   `npm run typecheck` runs `tsc --noEmit` and must pass.
2. **No hardcoded secrets:**  
   runtime values are read from environment variables (`import.meta.env.*`),
   and `.env` is git-ignored. Only placeholder examples are committed in
   `.env.example`.

Local pre-push check:

```bash
npm install
npm run check:week3
```

---

## 7. Smart contract

The Solidity contract `BlockBidAuction` manages auction creation, bid
validation, highest-bid tracking, end-time enforcement, and refund logic
for outbid users.

Core methods:

- `createAuction(string _title, uint256 _startingBid, uint256 _durationInMinutes)`
- `placeBid(uint256 _auctionId)` (payable)
- `endAuction(uint256 _auctionId)`
- `withdraw()`
- `getAuction(uint256 _auctionId)`
- `getCurrentMinBid(uint256 _auctionId)`
- `isAuctionActive(uint256 _auctionId)`
- `getTimeLeft(uint256 _auctionId)`

The ABI lives in [`src/abi/BlockBidAuction.json`](src/abi/BlockBidAuction.json).
To deploy your own copy, open the contract in [Remix IDE](https://remix.ethereum.org),
deploy to Sepolia, and put the resulting address in `VITE_CONTRACT_ADDRESS`.

---

## 8. Security notes

- `.env` is git-ignored. Only `.env.example` (placeholders) is committed.
- No private keys, seed phrases, or paid API keys exist anywhere in the
  source tree.
- The Lovable AI Gateway key used by the assistant lives **only** as a
  server-side secret on the Supabase edge function — it is never sent to
  the browser.
- The `chat-assistant` edge function enforces an origin allow-list,
  payload size limits, message-count limits, and prompt-injection
  sanitisation on all client-supplied context.
- The frontend never custodies funds. All ETH movement happens via
  user-signed transactions through their own wallet.

---

## 9. License

MIT — provided for educational / homework / portfolio use.
