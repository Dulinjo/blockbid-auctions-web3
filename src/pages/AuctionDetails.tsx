import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Auction, Bid } from "@/lib/types";
import { fetchAuctionById, fetchBids } from "@/services/blockchain";
import { Countdown } from "@/components/Countdown";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { BidModal } from "@/components/BidModal";
import { ArrowLeft, Gavel, Wallet, ExternalLink, FileCode2, Trophy, User } from "lucide-react";

const AuctionDetails = () => {
  const { id } = useParams();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidOpen, setBidOpen] = useState(false);
  const { wallet, connect } = useWallet();

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchAuctionById(id), fetchBids(id)]).then(([a, b]) => {
      setAuction(a ?? null);
      setBids(b);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="container py-16 grid lg:grid-cols-2 gap-10">
          <div className="aspect-square rounded-2xl bg-card animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-card rounded w-2/3 animate-pulse" />
            <div className="h-4 bg-card rounded w-1/2 animate-pulse" />
            <div className="h-32 bg-card rounded animate-pulse" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!auction) {
    return (
      <Layout>
        <div className="container py-24 text-center">
          <p className="text-muted-foreground">Auction not found.</p>
          <Button asChild className="mt-4"><Link to="/marketplace">Back to marketplace</Link></Button>
        </div>
      </Layout>
    );
  }

  const isEnded = auction.status === "ended" || auction.status === "finalized";

  return (
    <Layout>
      <div className="container py-8">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
          <Link to="/marketplace"><ArrowLeft className="mr-1 h-4 w-4" /> Back to marketplace</Link>
        </Button>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Image */}
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden border border-border bg-card">
              <img
                src={auction.image}
                alt={auction.title}
                width={800}
                height={800}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute top-4 left-4">
              <StatusBadge status={auction.status} />
            </div>
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-2">{auction.category} • {auction.id}</div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{auction.title}</h1>
              <div className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Sold by <span className="font-mono text-foreground">{auction.seller}</span>
              </div>
            </div>

            {/* Price box */}
            <div className="rounded-2xl border border-border bg-gradient-card p-6 space-y-5">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Starting price</div>
                  <div className="font-mono text-xl font-semibold mt-1">{auction.startingPrice} ETH</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Current bid</div>
                  <div className="font-mono text-3xl font-bold text-gradient-primary mt-1">{auction.highestBid} ETH</div>
                </div>
              </div>

              {auction.highestBidder && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t border-border/60">
                  <Trophy className="h-3.5 w-3.5 text-warning" />
                  Leading bidder: <span className="font-mono text-foreground">{auction.highestBidder}</span>
                </div>
              )}

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  {isEnded ? "Final time" : "Auction ends in"}
                </div>
                <Countdown target={auction.endsAt} />
              </div>

              {!isEnded ? (
                wallet ? (
                  <Button
                    size="lg"
                    onClick={() => setBidOpen(true)}
                    className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12 glow-primary"
                  >
                    <Gavel className="mr-2 h-4 w-4" /> Place Bid
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={connect}
                    className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12 glow-primary"
                  >
                    <Wallet className="mr-2 h-4 w-4" /> Connect MetaMask to Bid
                  </Button>
                )
              ) : (
                <div className="rounded-lg bg-secondary/60 border border-border p-4 text-center">
                  <Trophy className="h-5 w-5 text-warning mx-auto mb-2" />
                  <div className="text-sm font-medium">
                    Winner: <span className="font-mono">{auction.highestBidder ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">at {auction.highestBid} ETH</div>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{auction.description}</p>
            </div>

            {/* Contract */}
            <div className="rounded-xl border border-border bg-card/40 p-4 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <FileCode2 className="h-3.5 w-3.5" /> Smart contract status
              </div>
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div>{auction.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tx hash</div>
                  <a href="#" onClick={(e) => e.preventDefault()} className="text-primary hover:text-primary-glow flex items-center gap-1">
                    {auction.txHash?.slice(0, 12)}... <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bid history */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary-glow" /> Bid History
            <span className="text-sm font-normal text-muted-foreground">({auction.bidCount})</span>
          </h2>
          <div className="rounded-2xl border border-border bg-card/40 overflow-hidden">
            {bids.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                No bids yet. Be the first to bid on-chain.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {bids.map((b, i) => (
                  <div key={b.id} className="flex items-center justify-between p-4 hover:bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-gradient-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <div>
                        <div className="font-mono text-sm">{b.bidder}</div>
                        <div className="text-xs text-muted-foreground">{new Date(b.timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{b.amount} ETH</div>
                      <div className="text-xs text-muted-foreground font-mono">{b.txHash.slice(0, 10)}...</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <BidModal
        auction={auction}
        open={bidOpen}
        onOpenChange={setBidOpen}
        onSuccess={(updated) => {
          setAuction(updated);
          fetchBids(updated.id).then(setBids);
        }}
      />
    </Layout>
  );
};

export default AuctionDetails;
