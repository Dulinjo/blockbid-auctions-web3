import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { ArrowRight, ShieldCheck, Wallet, FileCode2, Activity, Sparkles } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import { useEffect, useMemo, useState } from "react";
import { Auction } from "@/lib/types";
import { getAllAuctions, OnChainAuction, EXPECTED_NETWORK_NAME } from "@/lib/contract";
import { refreshAuctionMetadata, type AuctionMetadata } from "@/lib/auctionMetadata";
import { AuctionCard } from "@/components/AuctionCard";
import { AuctionStories } from "@/components/AuctionStories";
import { EtherscanLink } from "@/components/EtherscanLink";
import placeholder from "@/assets/auction-1.jpg";

const ENDING_SOON_MS = 60 * 60 * 1000;

const toUiAuction = (
  a: OnChainAuction,
  meta: Record<number, AuctionMetadata>
): Auction => {
  const m = meta[a.id];
  return {
    id: String(a.id),
    title: m?.title || a.title || `Auction #${a.id}`,
    description: m?.description || "On-chain auction managed by the BlockBid smart contract.",
    category: m?.category || "On-chain",
    image: m?.imageUrl || placeholder,
    seller: a.seller,
    startingPrice: parseFloat(a.startingPrice),
    highestBid: parseFloat(a.highestBid),
    highestBidder: a.highestBidder && a.highestBidder !== "0x0000000000000000000000000000000000000000" ? a.highestBidder : null,
    endsAt: a.endsAtMs,
    status: a.ended ? "finalized" : a.active ? "active" : "ended",
    bidCount: 0,
  };
};

const Index = () => {
  const { wallet, connect } = useWallet();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [allAuctions, setAllAuctions] = useState<Auction[]>([]);
  const [onChainList, setOnChainList] = useState<OnChainAuction[]>([]);
  const [readHealthy, setReadHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [list, meta] = await Promise.all([
          getAllAuctions(),
          refreshAuctionMetadata(),
        ]);
        setOnChainList(list);
        setReadHealthy(true);
        // Prefer active auctions ending soonest, like Marketplace.
        const sorted = [...list].sort((a, b) => {
          const aActive = !a.ended && a.active;
          const bActive = !b.ended && b.active;
          if (aActive !== bActive) return aActive ? -1 : 1;
          if (aActive && bActive) return a.endsAtMs - b.endsAtMs;
          return b.endsAtMs - a.endsAtMs;
        });
        const ui = sorted.map((a) => toUiAuction(a, meta));
        setAllAuctions(ui);
        setAuctions(ui.slice(0, 3));
      } catch {
        setAuctions([]);
        setAllAuctions([]);
        setOnChainList([]);
        setReadHealthy(false);
      }
    })();
  }, []);

  const heroStats = useMemo(() => {
    const total = onChainList.length;
    const active = onChainList.filter((a) => a.active).length;
    const endingSoon = onChainList.filter(
      (a) => a.active && a.endsAtMs - Date.now() <= ENDING_SOON_MS
    ).length;
    return [
      { v: readHealthy === null ? "…" : String(total), l: "Auctions on-chain" },
      { v: readHealthy === null ? "…" : String(active), l: "Active now" },
      {
        v: readHealthy === false ? "Offline" : readHealthy === null ? "…" : `${endingSoon} • ${EXPECTED_NETWORK_NAME}`,
        l: "Ending soon",
      },
    ];
  }, [onChainList, readHealthy]);

  return (
    <Layout>
      {/* Quick-access auction stories — directly below the top header */}
      {allAuctions.length > 0 && (
        <div className="border-b border-border/40 bg-background/40 backdrop-blur-sm">
          <div className="container py-4">
            <AuctionStories auctions={allAuctions} />
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 grid-bg opacity-50" />
        <img
          src={heroBg}
          alt=""
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen"
        />
        <div className="container relative py-24 md:py-36">
          <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary-glow backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by Ethereum smart contracts
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              <span className="text-gradient">BlockBid —</span>
              <br />
              <span className="text-foreground">Transparent Digital</span>
              <br />
              <span className="text-gradient-primary">Auctions on Blockchain</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Browse auctions freely — connect any EVM wallet when you're ready to bid or list an item.
              Every bid is provable. Every result is final.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              {!wallet ? (
                <Button
                  size="lg"
                  onClick={connect}
                  className="bg-gradient-primary text-primary-foreground font-semibold h-12 px-8 glow-primary hover:opacity-90"
                >
                  <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
                </Button>
              ) : (
                <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground h-12 px-8 glow-primary">
                  <Link to="/dashboard">
                    Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="h-12 px-8 border-border/80 backdrop-blur bg-card/40">
                <Link to="/marketplace">
                  Explore Auctions <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="flex justify-center pt-2">
              <EtherscanLink kind="contract" variant="pill" label="View Contract on Etherscan" />
            </div>

            {/* Stats strip — derived from live contract reads */}
            <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto pt-12">
              {heroStats.map((s) => (
                <div key={s.l} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-gradient-primary font-mono">{s.v}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl md:text-4xl font-bold">Built for trustless bidding</h2>
          <p className="text-muted-foreground mt-3">
            Smart-contract logic, wallet identity, and real-time settlement — all in one platform.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: ShieldCheck, title: "Transparent Bidding", desc: "Every bid is recorded on-chain and publicly auditable." },
            { icon: Wallet, title: "Wallet-Based Identity", desc: "Use any EVM wallet — MetaMask, Coinbase, Rabby or WalletConnect. No accounts, no passwords." },
            { icon: FileCode2, title: "Smart Contract Logic", desc: "Auction rules enforced by Solidity, not middlemen." },
            { icon: Activity, title: "Real-Time Status", desc: "Live countdowns and instant bid updates from the chain." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl bg-gradient-card border border-border p-6 hover:border-primary/40 transition-all group">
              <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <f.icon className="h-5 w-5 text-primary-glow" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured auctions */}
      <section className="container pb-24">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">Featured Auctions</h2>
            <p className="text-muted-foreground mt-2">Live on-chain right now.</p>
          </div>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/marketplace">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-card p-10 md:p-16 text-center">
          <div className="absolute inset-0 bg-gradient-hero opacity-60" />
          <div className="relative space-y-5">
            <h2 className="text-3xl md:text-5xl font-bold text-gradient">Ready to launch your auction?</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              List any item — physical or digital — and let the blockchain handle the rest.
            </p>
            <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground h-12 px-8 glow-primary">
              <Link to="/create">
                Create Auction <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
