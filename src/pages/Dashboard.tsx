import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useWallet } from "@/contexts/WalletContext";
import { Auction } from "@/lib/types";
import { fetchAuctions } from "@/services/blockchain";
import { AuctionCard } from "@/components/AuctionCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Wallet, Gavel, Trophy, Clock, Plus, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

const Dashboard = () => {
  const { wallet, connect } = useWallet();
  const [auctions, setAuctions] = useState<Auction[]>([]);

  useEffect(() => {
    fetchAuctions().then(setAuctions);
  }, []);

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

  // Mock attribution: pretend the connected wallet owns first 2 + bid on 1
  const myCreated = auctions.slice(0, 2);
  const myBids = auctions.slice(1, 4);
  const myWon = auctions.filter((a) => a.status === "ended" || a.status === "finalized").slice(0, 1);

  const stats = [
    { label: "Auctions created", value: myCreated.length, icon: Gavel, color: "text-primary-glow" },
    { label: "Active bids", value: myBids.filter((a) => a.status === "active").length, icon: Clock, color: "text-accent" },
    { label: "Won auctions", value: myWon.length, icon: Trophy, color: "text-warning" },
    { label: "Pending claims", value: 1, icon: ExternalLink, color: "text-success" },
  ];

  return (
    <Layout>
      <div className="container py-12">
        {/* Wallet overview */}
        <div className="rounded-2xl border border-border bg-gradient-card p-6 md:p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Connected wallet</div>
              <div className="font-mono text-lg md:text-xl mt-1 break-all">{wallet.address}</div>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
                  {wallet.network}
                </span>
                <span>•</span>
                <span className="font-mono">{wallet.balance} ETH</span>
              </div>
            </div>
            <Button asChild className="bg-gradient-primary text-primary-foreground">
              <Link to="/create"><Plus className="mr-1.5 h-4 w-4" /> New Auction</Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
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

        {/* Tabs */}
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
                {myCreated.map((a) => <AuctionCard key={a.id} auction={a} />)}
              </div>
            ) : <EmptyState text="You haven't created any auctions yet." />}
          </TabsContent>
          <TabsContent value="bids" className="mt-6">
            {myBids.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {myBids.map((a) => <AuctionCard key={a.id} auction={a} />)}
              </div>
            ) : <EmptyState text="No active bids." />}
          </TabsContent>
          <TabsContent value="won" className="mt-6">
            {myWon.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {myWon.map((a) => <AuctionCard key={a.id} auction={a} />)}
              </div>
            ) : <EmptyState text="No won auctions yet." />}
          </TabsContent>
          <TabsContent value="ended" className="mt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {auctions.filter(a => a.status === "ended").map((a) => <AuctionCard key={a.id} auction={a} />)}
            </div>
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
