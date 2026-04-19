import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getAuction, OnChainAuction, endAuction, parseTxError, shortenAddress, CONTRACT_ADDRESS } from "@/lib/contract";
import { Countdown } from "@/components/Countdown";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { BidModal } from "@/components/BidModal";
import { ArrowLeft, Gavel, Wallet, ExternalLink, FileCode2, Trophy, User, Loader2, AlertTriangle } from "lucide-react";
import placeholder from "@/assets/auction-1.jpg";
import { toast } from "sonner";
import { AuctionStatus } from "@/lib/types";

const statusOf = (a: OnChainAuction): AuctionStatus =>
  a.ended ? "finalized" : a.active ? "active" : "ended";

const AuctionDetails = () => {
  const { id } = useParams();
  const auctionId = Number(id);
  const [auction, setAuction] = useState<OnChainAuction | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidOpen, setBidOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const { wallet, connect, correctNetwork, switchNetwork } = useWallet();

  const refresh = async () => {
    if (Number.isNaN(auctionId)) return;
    try {
      const a = await getAuction(auctionId);
      setAuction(a);
    } catch (e) {
      toast.error("Failed to load auction", { description: parseTxError(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      const { txHash } = await endAuction(auctionId);
      toast.success("Auction ended", { description: `Tx: ${txHash.slice(0, 10)}...` });
      await refresh();
    } catch (e) {
      toast.error("Failed to end auction", { description: parseTxError(e) });
    } finally {
      setEnding(false);
    }
  };

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
          <p className="text-muted-foreground">Auction not found on-chain.</p>
          <Button asChild className="mt-4"><Link to="/marketplace">Back to marketplace</Link></Button>
        </div>
      </Layout>
    );
  }

  const status = statusOf(auction);
  const isEnded = status !== "active";
  const isSeller = wallet?.address.toLowerCase() === auction.seller.toLowerCase();
  const hasBidder = auction.highestBidder && auction.highestBidder !== "0x0000000000000000000000000000000000000000";

  return (
    <Layout>
      <div className="container py-8">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
          <Link to="/marketplace"><ArrowLeft className="mr-1 h-4 w-4" /> Back to marketplace</Link>
        </Button>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden border border-border bg-card">
              <img src={placeholder} alt={auction.title} width={800} height={800} className="h-full w-full object-cover" />
            </div>
            <div className="absolute top-4 left-4">
              <StatusBadge status={status} />
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-2">On-chain • #{auction.id}</div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{auction.title || `Auction #${auction.id}`}</h1>
              <div className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Seller <span className="font-mono text-foreground">{shortenAddress(auction.seller)}</span>
              </div>
            </div>

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

              {hasBidder && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t border-border/60">
                  <Trophy className="h-3.5 w-3.5 text-warning" />
                  Leading bidder: <span className="font-mono text-foreground">{shortenAddress(auction.highestBidder)}</span>
                </div>
              )}

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  {isEnded ? "Final time" : "Auction ends in"}
                </div>
                <Countdown target={auction.endsAtMs} />
              </div>

              {!wallet ? (
                <Button size="lg" onClick={connect} className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12 glow-primary">
                  <Wallet className="mr-2 h-4 w-4" /> Connect MetaMask to Bid
                </Button>
              ) : !correctNetwork ? (
                <Button size="lg" onClick={switchNetwork} variant="outline" className="w-full border-warning/40 text-warning hover:bg-warning/10 h-12">
                  <AlertTriangle className="mr-2 h-4 w-4" /> Switch to Sepolia
                </Button>
              ) : status === "active" ? (
                <Button
                  size="lg"
                  onClick={() => setBidOpen(true)}
                  disabled={isSeller}
                  className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12 glow-primary"
                >
                  <Gavel className="mr-2 h-4 w-4" /> {isSeller ? "You are the seller" : "Place Bid"}
                </Button>
              ) : status === "ended" ? (
                <Button
                  size="lg"
                  onClick={handleEnd}
                  disabled={ending}
                  className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12"
                >
                  {ending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing...</> : "Finalize on-chain"}
                </Button>
              ) : (
                <div className="rounded-lg bg-secondary/60 border border-border p-4 text-center">
                  <Trophy className="h-5 w-5 text-warning mx-auto mb-2" />
                  <div className="text-sm font-medium">
                    Winner: <span className="font-mono">{hasBidder ? shortenAddress(auction.highestBidder) : "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">at {auction.highestBid} ETH</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-4 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <FileCode2 className="h-3.5 w-3.5" /> Smart contract
              </div>
              <div className="grid grid-cols-1 gap-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contract</span>
                  <a
                    href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
                    target="_blank" rel="noreferrer"
                    className="text-primary hover:text-primary-glow flex items-center gap-1"
                  >
                    {shortenAddress(CONTRACT_ADDRESS, 6)} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span>{status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BidModal
        auctionId={auction.id}
        currentBid={parseFloat(auction.highestBid)}
        startingPrice={parseFloat(auction.startingPrice)}
        open={bidOpen}
        onOpenChange={setBidOpen}
        onSuccess={refresh}
      />
    </Layout>
  );
};

export default AuctionDetails;
