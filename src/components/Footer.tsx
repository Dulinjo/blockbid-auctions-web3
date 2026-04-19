import { Logo } from "./Logo";
import { CONTRACT_INFO } from "@/lib/mockData";
import { EtherscanLink } from "./EtherscanLink";

export const Footer = () => (
  <footer className="border-t border-border/60 bg-card/30 mt-24">
    <div className="container py-12 grid gap-10 md:grid-cols-4">
      <div className="md:col-span-2 space-y-4">
        <Logo />
        <p className="text-sm text-muted-foreground max-w-sm">
          Transparent, on-chain digital auctions powered by smart contracts and verified through wallet signatures.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
          <span className="text-xs font-mono text-muted-foreground">
            {CONTRACT_INFO.network} • Live
          </span>
        </div>
        <div className="pt-1">
          <EtherscanLink kind="contract" variant="button" label="View Contract on Etherscan" />
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-3">Platform</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Marketplace</li>
          <li>Create Auction</li>
          <li>Dashboard</li>
          <li>Contract Info</li>
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-3">Resources</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Documentation</li>
          <li>Smart Contract</li>
          <li>Wallet Setup</li>
          <li>Security</li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border/60">
      <div className="container py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>© 2025 BlockBid. All bids settled on-chain.</span>
        <EtherscanLink kind="contract" variant="link" showCopy />
      </div>
    </div>
  </footer>
);
