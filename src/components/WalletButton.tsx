import { useWallet, shortenAddress } from "@/contexts/WalletContext";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, AlertTriangle, Copy, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

export const WalletButton = () => {
  const { wallet, connecting, connect, disconnect, hasMetaMask, correctNetwork } = useWallet();
  const [copied, setCopied] = useState(false);

  if (!hasMetaMask) {
    return (
      <Button
        variant="outline"
        onClick={() => window.open("https://metamask.io/download/", "_blank")}
        className="border-warning/40 text-warning hover:bg-warning/10"
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        Install MetaMask
      </Button>
    );
  }

  if (!wallet) {
    return (
      <Button
        onClick={connect}
        disabled={connecting}
        className="bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold shadow-lg glow-primary"
      >
        <Wallet className="mr-2 h-4 w-4" />
        {connecting ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="border-border bg-card/60 backdrop-blur font-mono text-xs gap-2">
          <span className={`h-2 w-2 rounded-full ${correctNetwork ? "bg-success animate-pulse-glow" : "bg-warning"}`} />
          {shortenAddress(wallet.address)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-card border-border">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Connected wallet</span>
            <span className="font-mono text-sm break-all">{wallet.address}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-secondary/60 p-2">
            <div className="text-muted-foreground">Network</div>
            <div className="font-medium mt-0.5">{wallet.network}</div>
          </div>
          <div className="rounded-md bg-secondary/60 p-2">
            <div className="text-muted-foreground">Balance</div>
            <div className="font-medium mt-0.5 font-mono">{wallet.balance} ETH</div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={copy} className="cursor-pointer">
          {copied ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
          Copy address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={disconnect} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
