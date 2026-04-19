import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { AuctionCard } from "@/components/AuctionCard";
import { AuctionStories } from "@/components/AuctionStories";
import { Auction, AuctionStatus } from "@/lib/types";
import { getAllAuctions, OnChainAuction, CONTRACT_ADDRESS } from "@/lib/contract";
import { getAllAuctionMetadata, refreshAuctionMetadata } from "@/lib/auctionMetadata";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, RefreshCw, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import placeholder from "@/assets/auction-1.jpg";

const toUiAuction = (
  a: OnChainAuction,
  meta: Record<number, ReturnType<typeof getAllAuctionMetadata>[number]>
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

const Marketplace = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<string>("ending");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, meta] = await Promise.all([
        getAllAuctions(),
        refreshAuctionMetadata(),
      ]);
      setAuctions(list.map((a) => toUiAuction(a, meta)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load auctions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = [...auctions];
    if (query) list = list.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()) || a.id.includes(query));
    if (status !== "all") list = list.filter((a) => a.status === (status as AuctionStatus));

    // Always prioritize active auctions over ended/finalized ones, regardless
    // of the chosen sort. Within each group we apply the selected ordering;
    // active auctions ending soonest stay at the top by default.
    const isActive = (a: Auction) => a.status === "active";
    const compareWithin = (a: Auction, b: Auction) => {
      if (sort === "price-high") return b.highestBid - a.highestBid;
      if (sort === "price-low") return a.highestBid - b.highestBid;
      // "ending" — active sorted by soonest end first; ended sorted by most
      // recently ended first so freshly closed auctions are visible.
      if (isActive(a) && isActive(b)) return a.endsAt - b.endsAt;
      return b.endsAt - a.endsAt;
    };
    list.sort((a, b) => {
      const aActive = isActive(a);
      const bActive = isActive(b);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return compareWithin(a, b);
    });
    return list;
  }, [auctions, query, status, sort]);

  const activeCount = filtered.filter((a) => a.status === "active").length;
  const endedCount = filtered.length - activeCount;

  return (
    <Layout>
      <section className="container py-12">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-5xl font-bold">Marketplace</h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">
              Browse auctions freely — connect a wallet when you're ready to place a bid.
            </p>
            <div className="mt-2 text-[11px] md:text-xs font-mono text-muted-foreground break-all">
              Contract: {CONTRACT_ADDRESS}
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="self-start">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {!loading && !error && auctions.length > 0 && (
          <AuctionStories auctions={auctions} />
        )}

        <div className="rounded-2xl border border-border bg-card/40 backdrop-blur p-4 mb-8 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-background/60 border-border"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px] bg-background/60"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[170px] bg-background/60">
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ending">Ending soon</SelectItem>
                <SelectItem value="price-high">Price: high to low</SelectItem>
                <SelectItem value="price-low">Price: low to high</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 mb-6 flex items-start gap-3 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium text-destructive">Failed to load auctions</div>
              <div className="text-xs text-muted-foreground mt-1">{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border h-[400px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 rounded-2xl border border-dashed border-border">
            <p className="text-muted-foreground">No auctions found on-chain.</p>
            <Button asChild className="mt-4 bg-gradient-primary text-primary-foreground">
              <a href="/create">Create the first auction</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {activeCount > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Ending soon
                  </h2>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {activeCount} active
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filtered
                    .filter((a) => a.status === "active")
                    .map((a) => (
                      <AuctionCard key={a.id} auction={a} />
                    ))}
                </div>
              </div>
            )}
            {endedCount > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Ended
                  </h2>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {endedCount} closed
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 opacity-90">
                  {filtered
                    .filter((a) => a.status !== "active")
                    .map((a) => (
                      <AuctionCard key={a.id} auction={a} />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </Layout>
  );
};

export default Marketplace;
