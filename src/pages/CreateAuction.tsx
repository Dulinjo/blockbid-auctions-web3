import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/contexts/WalletContext";
import { createAuction, classifyTxError } from "@/lib/contract";
import { debugBus } from "@/components/TxDebugPanel";
import { useNavigate } from "react-router-dom";
import { Wallet, Loader2, CheckCircle2, AlertCircle, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AuctionImageInput, type AuctionImageState } from "@/components/AuctionImageInput";

const CreateAuction = () => {
  const { wallet, connect, correctNetwork, switchNetwork } = useWallet();
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "pending" | "success" | "error">("form");
  const [tx, setTx] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Digital Art",
    startingPrice: "",
    durationHours: "24",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet) return;
    if (!form.title.trim() || !form.startingPrice) {
      toast.error("Please fill in title and starting price");
      return;
    }
    setStep("pending");
    setErrorMsg("");
    try {
      const durationMinutes = Math.max(1, Math.floor(parseFloat(form.durationHours) * 60));
      const { txHash } = await createAuction(
        {
          title: form.title.trim(),
          startingPriceEth: form.startingPrice,
          durationMinutes,
        },
        undefined,
        undefined,
        {
          onPhase: (phase, info) => {
            if (phase === "submitted" || phase === "confirmed") {
              debugBus.set({ phase, txHash: info?.txHash ?? "" });
            } else {
              debugBus.set({ phase });
            }
          },
        }
      );
      setTx(txHash);
      setStep("success");
      toast.success("Auction confirmed on-chain");
    } catch (err) {
      const parsed = classifyTxError(err);
      console.error("[createAuction]", err);
      setErrorMsg(`${parsed.kind}: ${parsed.message}`);
      debugBus.set({ phase: "error", kind: parsed.kind, message: parsed.message });
      setStep("error");
      toast.error("Transaction failed", { description: parsed.message });
    }
  };

  if (!wallet) {
    return (
      <Layout>
        <div className="container py-24">
          <div className="max-w-md mx-auto text-center rounded-2xl border border-border bg-gradient-card p-10">
            <div className="h-14 w-14 rounded-full bg-primary/15 mx-auto flex items-center justify-center mb-4">
              <Wallet className="h-7 w-7 text-primary-glow" />
            </div>
            <h2 className="text-2xl font-bold">Connect your wallet</h2>
            <p className="text-muted-foreground mt-2 text-sm">Creating an auction requires a connected MetaMask wallet to sign the transaction.</p>
            <Button onClick={connect} className="mt-6 bg-gradient-primary text-primary-foreground font-semibold w-full h-11 glow-primary">
              <Wallet className="mr-2 h-4 w-4" /> Connect MetaMask
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-12 max-w-3xl">
        <div className="mb-10">
          <h1 className="text-4xl font-bold">Create Auction</h1>
          <p className="text-muted-foreground mt-2">Deploy a new auction to the BlockBid smart contract on Sepolia.</p>
        </div>

        {!correctNetwork && (
          <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-warning">Wrong network</div>
                <div className="text-xs text-muted-foreground mt-1">Switch to Sepolia testnet to interact with the contract.</div>
              </div>
            </div>
            <Button onClick={switchNetwork} variant="outline" className="border-warning/40 text-warning hover:bg-warning/10">
              Switch
            </Button>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-gradient-card p-6 md:p-8">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                <Label>Item image (off-chain)</Label>
                <div className="mt-1.5 aspect-square rounded-xl border-2 border-dashed border-border bg-background/40 flex flex-col items-center justify-center text-center p-4 hover:border-primary/40 transition-colors cursor-pointer">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">Drop image or click</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Stored off-chain</p>
                </div>
              </div>

              <div className="md:col-span-2 space-y-4">
                <div>
                  <Label htmlFor="title">Title (on-chain)</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Iridescent Crystal Genesis"
                    className="mt-1.5 bg-background/60"
                    maxLength={100}
                  />
                </div>
                <div>
                  <Label htmlFor="desc">Description (off-chain)</Label>
                  <Textarea
                    id="desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    placeholder="Describe your item, provenance, and what makes it valuable..."
                    className="mt-1.5 bg-background/60"
                    maxLength={1000}
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1.5 bg-background/60"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Digital Art">Digital Art</SelectItem>
                      <SelectItem value="Collectibles">Collectibles</SelectItem>
                      <SelectItem value="Fashion">Fashion</SelectItem>
                      <SelectItem value="Music">Music</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <Label htmlFor="price">Starting price (ETH)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.startingPrice}
                  onChange={(e) => setForm({ ...form, startingPrice: e.target.value })}
                  placeholder="0.01"
                  className="mt-1.5 bg-background/60 font-mono"
                />
              </div>
              <div>
                <Label>Auction duration</Label>
                <Select value={form.durationHours} onValueChange={(v) => setForm({ ...form, durationHours: v })}>
                  <SelectTrigger className="mt-1.5 bg-background/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.0833">5 minutes (test)</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="6">6 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="72">3 days</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>This sends a real transaction to the BlockBid contract on Sepolia. Auction parameters cannot be changed once deployed.</span>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={!correctNetwork}
              className="w-full bg-gradient-primary text-primary-foreground font-semibold h-12 glow-primary disabled:opacity-50"
            >
              Create Auction
            </Button>
          </form>
        )}

        {step === "pending" && (
          <div className="rounded-2xl border border-border bg-gradient-card p-12 text-center">
            <Loader2 className="h-14 w-14 animate-spin text-primary mx-auto" />
            <h3 className="mt-5 text-xl font-semibold">Deploying auction to blockchain</h3>
            <p className="text-muted-foreground text-sm mt-2">Confirm in MetaMask, then we'll wait for the network.</p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-secondary border border-border">
              <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
              Pending on {wallet.network}
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="rounded-2xl border border-success/40 bg-gradient-card p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-success/15 mx-auto flex items-center justify-center glow-accent">
              <CheckCircle2 className="h-9 w-9 text-success" />
            </div>
            <h3 className="mt-5 text-2xl font-bold">Auction created</h3>
            <p className="text-muted-foreground text-sm mt-2">Your auction is now live on the blockchain.</p>
            <div className="mt-6 inline-flex flex-col gap-2 text-xs font-mono">
              <a
                href={`https://sepolia.etherscan.io/tx/${tx}`}
                target="_blank" rel="noreferrer"
                className="text-primary hover:text-primary-glow flex items-center gap-1"
              >
                Tx: {tx.slice(0, 16)}...{tx.slice(-8)} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-3 justify-center mt-8">
              <Button onClick={() => navigate("/marketplace")} className="bg-gradient-primary text-primary-foreground">
                View Marketplace
              </Button>
              <Button variant="outline" onClick={() => { setStep("form"); setForm({ title: "", description: "", category: "Digital Art", startingPrice: "", durationHours: "24" }); }}>
                Create another
              </Button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="rounded-2xl border border-destructive/40 bg-gradient-card p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/15 mx-auto flex items-center justify-center">
              <AlertCircle className="h-9 w-9 text-destructive" />
            </div>
            <h3 className="mt-5 text-2xl font-bold text-destructive">Transaction failed</h3>
            <p className="text-muted-foreground text-sm mt-2">{errorMsg}</p>
            <Button onClick={() => setStep("form")} variant="outline" className="mt-6">
              Try again
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CreateAuction;
