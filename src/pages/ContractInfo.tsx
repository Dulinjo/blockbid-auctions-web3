import { Layout } from "@/components/Layout";
import { CONTRACT_INFO } from "@/lib/mockData";
import { FileCode2, Activity, ExternalLink, Copy, Check, Database } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const recentTx = [
  { hash: "0xa1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01", method: "placeBid", time: "2m ago", status: "success" },
  { hash: "0xb2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123", method: "createAuction", time: "12m ago", status: "success" },
  { hash: "0xc3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef012345", method: "placeBid", time: "34m ago", status: "success" },
  { hash: "0xd4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01234567", method: "endAuction", time: "1h ago", status: "success" },
  { hash: "0xe5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789", method: "placeBid", time: "2h ago", status: "success" },
];

const methods = [
  { name: "createAuction", desc: "Deploy a new auction with title, starting price, and duration." },
  { name: "getAuction", desc: "Read auction state by ID from the contract." },
  { name: "getAllAuctions", desc: "Enumerate all auctions tracked by the contract." },
  { name: "placeBid", desc: "Payable. Submit a bid that exceeds the current highest bid." },
  { name: "endAuction", desc: "Finalize an ended auction and transfer funds to the seller." },
  { name: "getHighestBid", desc: "Returns the current highest bid for an auction." },
  { name: "getWinner", desc: "Returns the winning bidder address after finalization." },
];

const ContractInfo = () => {
  const [copied, setCopied] = useState(false);
  const copyAddr = () => {
    navigator.clipboard.writeText(CONTRACT_INFO.address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Layout>
      <div className="container py-12 space-y-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow mb-3">
            <FileCode2 className="h-3.5 w-3.5" /> Smart Contract
          </div>
          <h1 className="text-4xl font-bold">Contract Info</h1>
          <p className="text-muted-foreground mt-2">
            Read-only developer panel. All auction logic runs through the deployed Solidity contract.
          </p>
        </div>

        {/* Contract panel */}
        <div className="rounded-2xl border border-border bg-gradient-card overflow-hidden">
          <div className="p-6 md:p-8 border-b border-border">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Contract address</div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="font-mono text-sm break-all flex-1">{CONTRACT_INFO.address}</code>
                  <Button size="icon" variant="ghost" onClick={copyAddr} className="h-7 w-7 shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Network</div>
                <div className="mt-2 flex items-center gap-2 font-mono text-sm">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
                  {CONTRACT_INFO.network} <span className="text-muted-foreground">(chain {CONTRACT_INFO.chainId})</span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Deployed</div>
                <div className="mt-2 font-mono text-sm">{CONTRACT_INFO.deployedAt}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Version</div>
                <div className="mt-2 font-mono text-sm">v{CONTRACT_INFO.version}</div>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 grid md:grid-cols-3 gap-4">
            <Stat icon={Activity} label="Interaction status" value="Healthy" color="text-success" />
            <Stat icon={Database} label="Active auctions" value="6" color="text-primary-glow" />
            <Stat icon={FileCode2} label="Total transactions" value="1,284" color="text-accent" />
          </div>
        </div>

        {/* Methods */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-primary-glow" /> Contract Methods
            </h3>
            <div className="space-y-2">
              {methods.map((m) => (
                <div key={m.name} className="rounded-lg bg-secondary/40 border border-border/60 p-3">
                  <code className="font-mono text-xs text-primary-glow">{m.name}()</code>
                  <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" /> Recent Transactions
            </h3>
            <div className="space-y-2">
              {recentTx.map((t) => (
                <div key={t.hash} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/40 border border-border/60">
                  <div className="min-w-0 flex-1">
                    <code className="font-mono text-xs text-primary-glow">{t.method}()</code>
                    <div className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                      {t.hash.slice(0, 22)}...{t.hash.slice(-6)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">{t.time}</div>
                    <a href="#" onClick={(e) => e.preventDefault()} className="text-[11px] text-primary hover:text-primary-glow inline-flex items-center gap-0.5">
                      View <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Integration note */}
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1.5">Integration ready</p>
          <p>
            Frontend service layer (<code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary-glow">src/services/blockchain.ts</code>) is structured to drop in <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary-glow">ethers.js</code> or <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary-glow">viem</code>. Just provide the deployed contract ABI and address.
          </p>
        </div>
      </div>
    </Layout>
  );
};

const Stat = ({ icon: Icon, label, value, color }: { icon: typeof FileCode2; label: string; value: string; color: string }) => (
  <div className="rounded-xl border border-border bg-card-elevated p-4">
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Icon className={`h-4 w-4 ${color}`} />
    </div>
    <div className={`text-2xl font-bold font-mono mt-2 ${color}`}>{value}</div>
  </div>
);

export default ContractInfo;
