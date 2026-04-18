import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { AuctionCard } from "@/components/AuctionCard";
import { Auction, AuctionStatus } from "@/lib/types";
import { fetchAuctions } from "@/services/blockchain";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Marketplace = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<string>("ending");

  useEffect(() => {
    fetchAuctions().then((a) => {
      setAuctions(a);
      setLoading(false);
    });
  }, []);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(auctions.map((a) => a.category)))],
    [auctions]
  );

  const filtered = useMemo(() => {
    let list = [...auctions];
    if (query) list = list.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()));
    if (category !== "all") list = list.filter((a) => a.category === category);
    if (status !== "all") list = list.filter((a) => a.status === (status as AuctionStatus));
    if (sort === "ending") list.sort((a, b) => a.endsAt - b.endsAt);
    if (sort === "price-high") list.sort((a, b) => b.highestBid - a.highestBid);
    if (sort === "price-low") list.sort((a, b) => a.highestBid - b.highestBid);
    return list;
  }, [auctions, query, category, status, sort]);

  return (
    <Layout>
      <section className="container py-12">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold">Marketplace</h1>
          <p className="text-muted-foreground mt-2">Browse live auctions backed by on-chain smart contracts.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card/40 backdrop-blur p-4 mb-8 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search auctions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-background/60 border-border"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px] bg-background/60"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border h-[400px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 rounded-2xl border border-dashed border-border">
            <p className="text-muted-foreground">No auctions match your filters.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
};

export default Marketplace;
