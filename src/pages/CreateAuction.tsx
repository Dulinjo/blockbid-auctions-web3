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
import { saveAuctionMetadata } from "@/lib/auctionMetadata";

const CreateAuction = () => {
  const { wallet, connect, correctNetwork, switchNetwork } = useWallet();
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "pending" | "success" | "error">("form");
  const [tx, setTx] = useState("");
  const [createdAuctionId, setCreatedAuctionId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [image, setImage] = useState<AuctionImageState>({ source: "none", url: null });
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
      // Snapshot the form state at submit time so async resets can't race
      // and we always bind metadata to the values the user actually saw.
      const snapshot = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        image: { ...image },
      };
      const { txHash, auctionId } = await createAuction(
        {
          title: snapshot.title,
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
      setCreatedAuctionId(auctionId);

      // Bind off-chain metadata to the new on-chain auction id.
      if (auctionId !== null) {
        await saveAuctionMetadata({
          auctionId,
          imageUrl: snapshot.image.url,
          sourceType:
            snapshot.image.source === "upload" || snapshot.image.source === "ai"
              ? snapshot.image.source
              : null,
          title: snapshot.title,
          description: snapshot.description || undefined,
          category: snapshot.category,
          prompt: snapshot.image.prompt,
          fileName: snapshot.image.fileName,
          createdAt: Date.now(),
        });
        // eslint-disable-next-line no-console
        console.info("[CreateAuction] bound metadata", {
          auctionId,
          sourceType: snapshot.image.source,
          hasImage: Boolean(snapshot.image.url),
        });
      } else {
        // eslint-disable-next-line no-console
        console.warn("[CreateAuction] auctionId could not be resolved; metadata not saved");
      }

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
        <div className="container py-16 md:py-24 max-w-3xl">
          <div className="mb-8 text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-[11px] font-mono text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Read-only mode
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mt-4">Create an auction</h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">
              Listing an item is an on-chain action. Connect any EVM wallet (MetaMask, Coinbase, Rabby, WalletConnect) to sign the transaction on Sepolia.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-gradient-card p-8 md:p-10 text-center">
            <div className="h-14 w-14 rounded-full bg-primary/15 mx-auto flex items-center justify-center mb-4">
              <Wallet className="h-7 w-7 text-primary-glow" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold">Connect a wallet to continue</h2>
            <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
              Browsing the marketplace is free and public. A wallet is only required to create auctions, place bids, finalize, or withdraw funds.
            </p>
            <Button onClick={connect} className="mt-6 bg-gradient-primary text-primary-foreground font-semibold w-full sm:w-auto h-11 px-8 glow-primary">
              <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
            </Button>
            <div className="mt-6 text-xs text-muted-foreground">
              Just looking around? <a href="/marketplace" className="text-primary hover:text-primary-glow underline-offset-2 hover:underline">Browse auctions</a> instead.
            </div>
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
                <AuctionImageInput value={image} onChange={setImage} />
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
            <p className="text-muted-foreground text-sm mt-2">Confirm in your wallet, then we'll wait for the network.</p>
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
              {createdAuctionId !== null && (
                <span className="text-foreground">Auction ID: <span className="text-primary-glow">#{createdAuctionId}</span></span>
              )}
              <a
                href={`https://sepolia.etherscan.io/tx/${tx}`}
                target="_blank" rel="noreferrer"
                className="text-primary hover:text-primary-glow flex items-center gap-1"
              >
                Tx: {tx.slice(0, 16)}...{tx.slice(-8)} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-3 justify-center mt-8 flex-wrap">
              {createdAuctionId !== null && (
                <Button onClick={() => navigate(`/auction/${createdAuctionId}`)} className="bg-gradient-primary text-primary-foreground">
                  View auction
                </Button>
              )}
              <Button onClick={() => navigate("/marketplace")} variant="outline">
                Marketplace
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("form");
                  setTx("");
                  setCreatedAuctionId(null);
                  setImage({ source: "none", url: null });
                  setForm({ title: "", description: "", category: "Digital Art", startingPrice: "", durationHours: "24" });
                }}
              >
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
