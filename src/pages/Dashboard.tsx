import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { getAllAuctions, OnChainAuction, shortenAddress, getPendingReturns, withdraw, parseTxError } from "@/lib/contract";
import { AuctionCard } from "@/components/AuctionCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Wallet, Gavel, Trophy, Clock, Plus, AlertTriangle, RefreshCw, Download, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Auction } from "@/lib/types";
import placeholder from "@/assets/auction-1.jpg";
import { toast } from "sonner";

const toUiAuction = (a: OnChainAuction): Auction => ({
  id: String(a.id),
  title: a.title || `Auction #${a.id}`,
  description: "On-chain auction managed by the BlockBid smart contract.",
  category: "On-chain",
  image: placeholder,
  seller: a.seller,
  startingPrice: parseFloat(a.startingPrice),
  highestBid: parseFloat(a.highestBid),
  highestBidder: a.highestBidder && a.highestBidder !== "0x0000000000000000000000000000000000000000" ? a.highestBidder : null,
  endsAt: a.endTime,
  status: a.ended ? "finalized" : a.active ? "active" : "ended",
  bidCount: 0,
});

const Dashboard = () => {
  const { wallet, connect, correctNetwork, switchNetwork } = useWallet();
  const [auctions, setAuctions] = useState<OnChainAuction[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState("0");
  const [withdrawing, setWithdrawing] = useState(false);

  const load = async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const [list, p] = await Promise.all([
        getAllAuctions(),
        getPendingReturns(wallet.address).catch(() => "0"),
      ]);
      setAuctions(list);
      setPending(p);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      const { txHash } = await withdraw();
      toast.success("Withdraw successful", { description: `Tx: ${txHash.slice(0, 10)}...` });
      await load();
    } catch (e) {
      toast.error("Withdraw failed", { description: parseTxError(e) });
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    if (wallet) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  if (!wallet) {
    return (
      <Layout>
        <div className="container py-24">
          <div className="max-w-md mx-auto text-center rounded-2xl border border-border bg-gradient-card p-10">
            <div className="h-14 w-14 rounded-full bg-primary/15 mx-auto flex items-center justify-center mb-4">
              <Wallet className="h-7 w-7 text-primary-glow" />
            </div>
            <h2 className="text-2xl font-bold">Connect to view dashboard</h2>
            <p className="text-muted-foreground mt-2 text-sm">Track your auctions, bids, and winnings on-chain.</p>
            <Button onClick={connect} className="mt-6 bg-gradient-primary text-primary-foreground font-semibold w-full h-11 glow-primary">
              <Wallet className="mr-2 h-4 w-4" /> Connect MetaMask
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const me = wallet.address.toLowerCase();
  const myCreated = auctions.filter((a) => a.seller.toLowerCase() === me);
  const myBids = auctions.filter((a) => a.highestBidder.toLowerCase() === me);
  const myWon = auctions.filter(
    (a) => a.ended && a.highestBidder.toLowerCase() === me
  );
  const ended = auctions.filter((a) => !a.active && a.seller.toLowerCase() === me);

  const stats = [
    { label: "Auctions created", value: myCreated.length, icon: Gavel, color: "text-primary-glow" },
    { label: "Leading bids", value: myBids.filter((a) => a.active).length, icon: Clock, color: "text-accent" },
    { label: "Won auctions", value: myWon.length, icon: Trophy, color: "text-warning" },
    { label: "Pending finalize", value: ended.filter((a) => !a.ended).length, icon: AlertTriangle, color: "text-success" },
  ];

  return (
    <Layout>
      <div className="container py-12">
        <div className="rounded-2xl border border-border bg-gradient-card p-6 md:p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Connected wallet</div>
              <div className="font-mono text-lg md:text-xl mt-1 break-all">{shortenAddress(wallet.address, 8)}</div>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${correctNetwork ? "bg-success animate-pulse-glow" : "bg-warning"}`} />
                  {wallet.network}
                </span>
                <span>•</span>
                <span className="font-mono">{wallet.balance} ETH</span>
              </div>
              {!correctNetwork && (
                <Button size="sm" variant="outline" onClick={switchNetwork} className="mt-3 border-warning/40 text-warning hover:bg-warning/10">
                  <AlertTriangle className="mr-2 h-3 w-3" /> Switch to Sepolia
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button asChild className="bg-gradient-primary text-primary-foreground">
                <Link to="/create"><Plus className="mr-1.5 h-4 w-4" /> New Auction</Link>
              </Button>
            </div>
          </div>
        </div>

        {parseFloat(pending) > 0 && (
          <div className="mb-8 rounded-2xl border border-success/40 bg-success/5 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                <Download className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="font-semibold">You have funds to withdraw</div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-mono text-success">{pending} ETH</span> from outbid auctions is available to claim.
                </div>
              </div>
            </div>
            <Button onClick={handleWithdraw} disabled={withdrawing} className="bg-gradient-primary text-primary-foreground">
              {withdrawing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Withdrawing...</> : <><Download className="mr-2 h-4 w-4" /> Withdraw {pending} ETH</>}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div className="text-3xl font-bold font-mono mt-2">{s.value}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="created">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="created">My Auctions</TabsTrigger>
            <TabsTrigger value="bids">My Bids</TabsTrigger>
            <TabsTrigger value="won">Won</TabsTrigger>
            <TabsTrigger value="ended">Ended</TabsTrigger>
          </TabsList>

          <TabsContent value="created" className="mt-6">
            {myCreated.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {myCreated.map((a) => <AuctionCard key={a.id} auction={toUiAuction(a)} />)}
              </div>
            ) : <EmptyState text="You haven't created any auctions yet." />}
          </TabsContent>
          <TabsContent value="bids" className="mt-6">
            {myBids.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {myBids.map((a) => <AuctionCard key={a.id} auction={toUiAuction(a)} />)}
              </div>
            ) : <EmptyState text="You're not the highest bidder on any auctions." />}
          </TabsContent>
          <TabsContent value="won" className="mt-6">
            {myWon.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {myWon.map((a) => <AuctionCard key={a.id} auction={toUiAuction(a)} />)}
              </div>
            ) : <EmptyState text="No won auctions yet." />}
          </TabsContent>
          <TabsContent value="ended" className="mt-6">
            {ended.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {ended.map((a) => <AuctionCard key={a.id} auction={toUiAuction(a)} />)}
              </div>
            ) : <EmptyState text="None of your auctions have ended." />}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-2xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
    {text}
  </div>
);

export default Dashboard;
