import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getAuction, OnChainAuction, endAuction, parseTxError, shortenAddress, CONTRACT_ADDRESS } from "@/lib/contract";
import { getAuctionMetadata } from "@/lib/auctionMetadata";
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
  const idIsValid = id !== undefined && id !== "" && Number.isInteger(auctionId) && auctionId > 0;
  const [auction, setAuction] = useState<OnChainAuction | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bidOpen, setBidOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const { wallet, connect, correctNetwork, switchNetwork } = useWallet();

  const meta = useMemo(() => (idIsValid ? getAuctionMetadata(auctionId) : null), [auctionId, idIsValid]);

  const refresh = async () => {
    if (!idIsValid) {
      setLoading(false);
      setLoadError("Invalid auction ID in URL.");
      return;
    }
    setLoadError(null);
    try {
      const a = await getAuction(auctionId);
      setAuction(a);
    } catch (e) {
      const msg = parseTxError(e);
      setLoadError(msg);
      setAuction(null);
      // Don't toast on first load — the page already shows a clear message.
      // eslint-disable-next-line no-console
      console.error("getAuction failed", { auctionId, error: e });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setAuction(null);
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
        <div className="container py-24 max-w-xl mx-auto text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Auction not available</h1>
            <p className="text-muted-foreground">
              {idIsValid
                ? "This auction does not exist on-chain or the link is invalid."
                : "The auction ID in the URL is missing or invalid."}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/40 p-4 text-left text-xs font-mono space-y-1.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Requested ID</span>
              <span className="break-all">{String(id ?? "—")}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Contract</span>
              <span className="break-all">{shortenAddress(CONTRACT_ADDRESS, 6)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Network</span>
              <span>Sepolia (chainId 11155111)</span>
            </div>
            {loadError && (
              <div className="pt-2 mt-2 border-t border-border/60">
                <div className="text-muted-foreground mb-1">Error</div>
                <div className="text-destructive break-all whitespace-pre-wrap">{loadError}</div>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-center">
            <Button asChild variant="outline">
              <Link to="/marketplace"><ArrowLeft className="mr-1 h-4 w-4" /> Marketplace</Link>
            </Button>
            <Button onClick={() => { setLoading(true); refresh(); }}>Retry</Button>
          </div>
        </div>
      </Layout>
    );
  }

  const status = statusOf(auction);
  const isEnded = status !== "active";
  const isSeller = wallet?.address.toLowerCase() === auction.seller.toLowerCase();
  const hasBidder = auction.highestBidder && auction.highestBidder !== "0x0000000000000000000000000000000000000000";

  // Off-chain metadata bound to this on-chain auction id (computed above the early returns).
  const imageUrl = meta?.imageUrl || placeholder;
  const displayTitle = meta?.title || auction.title || `Auction #${auction.id}`;

  return (
    <Layout>
      <div className="container py-8">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
          <Link to="/marketplace"><ArrowLeft className="mr-1 h-4 w-4" /> Back to marketplace</Link>
        </Button>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden border border-border bg-card">
              <img src={imageUrl} alt={displayTitle} width={800} height={800} className="h-full w-full object-cover" />
            </div>
            <div className="absolute top-4 left-4">
              <StatusBadge status={status} />
            </div>
            {meta?.sourceType && (
              <div className="absolute top-4 right-4 text-[10px] px-2 py-0.5 rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground">
                {meta.sourceType === "ai" ? "AI generated" : "Uploaded"} · off-chain
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-2">On-chain • #{auction.id}</div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{displayTitle}</h1>
              {meta?.description && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{meta.description}</p>
              )}
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
                <div className="space-y-2">
                  <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground text-center">
                    You're viewing this auction in <span className="text-foreground font-medium">read-only mode</span>. Connect a wallet to place a bid.
                  </div>
                  <Button size="lg" onClick={connect} className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12 glow-primary">
                    <Wallet className="mr-2 h-4 w-4" /> Connect Wallet to Bid
                  </Button>
                </div>
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
