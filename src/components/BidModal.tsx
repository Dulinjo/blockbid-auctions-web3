import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Auction } from "@/lib/types";
import { useWallet } from "@/contexts/WalletContext";
import { placeBid } from "@/services/blockchain";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface Props {
  auction: Auction;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (a: Auction) => void;
}

type Step = "form" | "confirming" | "pending" | "success" | "error";

export const BidModal = ({ auction, open, onOpenChange, onSuccess }: Props) => {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState((auction.highestBid + 0.05).toFixed(2));
  const [step, setStep] = useState<Step>("form");
  const [tx, setTx] = useState<string>("");
  const [error, setError] = useState<string>("");

  const minBid = (auction.highestBid + 0.01).toFixed(2);

  const submit = async () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= auction.highestBid) {
      toast.error(`Bid must exceed ${auction.highestBid} ETH`);
      return;
    }
    if (!wallet) return;
    setStep("confirming");
    await new Promise((r) => setTimeout(r, 800));
    setStep("pending");
    try {
      const { tx: hash, auction: updated } = await placeBid(auction.id, value, wallet.address);
      setTx(hash);
      setStep("success");
      onSuccess(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStep("error");
    }
  };

  const reset = () => {
    setStep("form");
    setError("");
    setTx("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? reset() : onOpenChange(v))}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Place Bid</DialogTitle>
          <DialogDescription>
            {step === "form" && "Enter your bid amount. The transaction will be confirmed via MetaMask."}
            {step === "confirming" && "Awaiting MetaMask confirmation..."}
            {step === "pending" && "Broadcasting to network..."}
            {step === "success" && "Your bid is now recorded on-chain."}
            {step === "error" && "Something went wrong with the transaction."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-secondary/60 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current highest bid</span>
                <span className="font-mono font-semibold">{auction.highestBid} ETH</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Minimum next bid</span>
                <span className="font-mono font-semibold text-primary">{minBid} ETH</span>
              </div>
            </div>
            <div>
              <Label htmlFor="bid">Your bid (ETH)</Label>
              <Input
                id="bid"
                type="number"
                step="0.01"
                min={minBid}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono text-lg mt-1.5"
              />
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>This action requires a blockchain transaction. Gas fees may apply.</span>
            </div>
            <Button onClick={submit} className="w-full bg-gradient-primary text-primary-foreground font-semibold h-11">
              Confirm Bid
            </Button>
          </div>
        )}

        {(step === "confirming" || step === "pending") && (
          <div className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center">
              <div className="font-medium">
                {step === "confirming" ? "Confirm in MetaMask" : "Transaction pending"}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">
                {amount} ETH bid on {auction.id}
              </div>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-success/15 flex items-center justify-center glow-accent">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div className="text-center space-y-1">
              <div className="font-semibold">Bid placed successfully</div>
              <div className="text-xs text-muted-foreground">Your bid of {amount} ETH is on-chain.</div>
            </div>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-xs font-mono text-primary hover:text-primary-glow flex items-center gap-1"
            >
              {tx.slice(0, 14)}...{tx.slice(-8)} <ExternalLink className="h-3 w-3" />
            </a>
            <Button onClick={reset} variant="outline" className="mt-2 w-full">
              Close
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-destructive/15 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="text-center text-sm">
              <div className="font-semibold text-destructive">Transaction failed</div>
              <div className="text-xs text-muted-foreground mt-1">{error}</div>
            </div>
            <Button onClick={() => setStep("form")} variant="outline" className="mt-2 w-full">
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
