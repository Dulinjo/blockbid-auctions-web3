import { Layout } from "@/components/Layout";
import { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID, EXPECTED_NETWORK_NAME } from "@/lib/contract";
import { getContractStats, type ContractStats } from "@/lib/contractStats";
import { FileCode2, Activity, ExternalLink, Copy, Check, Database, Loader2, Hash } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EtherscanLink } from "@/components/EtherscanLink";
import { contractUrl } from "@/lib/explorer";

const CONTRACT_INFO = {
  address: CONTRACT_ADDRESS,
  network: `${EXPECTED_NETWORK_NAME} Testnet`,
  chainId: EXPECTED_CHAIN_ID,
  version: "1.0.0",
};

const methods = [
  { name: "createAuction", desc: "Deploy a new auction with title, starting price, and duration." },
  { name: "getAuction", desc: "Read auction state by ID from the contract." },
  { name: "getAllAuctions", desc: "Enumerate all auctions tracked by the contract." },
  { name: "placeBid", desc: "Payable. Submit a bid that exceeds the current highest bid." },
  { name: "endAuction", desc: "Finalize an ended auction and transfer funds to the seller." },
  { name: "getCurrentMinBid", desc: "Returns the minimum bid required to outbid the current highest bid." },
  { name: "withdraw", desc: "Withdraw pending returns from outbid balances." },
];

const ContractInfo = () => {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const s = await getContractStats();
      setStats(s);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const id = setInterval(loadStats, 30_000); // refresh every 30s
    return () => clearInterval(id);
  }, []);

  const copyAddr = () => {
    navigator.clipboard.writeText(CONTRACT_INFO.address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  };

  // Build a "recent transactions" preview from on-chain auctions.
  // We don't have a tx-log indexer, so we surface the latest auction events
  // (creation only — derived from auction list) with deep links to Etherscan
  // address page. This avoids fabricated tx hashes.
  const recentAuctions = (stats?.auctions ?? []).slice(0, 5);

  const healthLabel =
    stats?.health === "healthy" ? "Healthy" : stats?.health === "degraded" ? "Degraded" : loading ? "Checking…" : "Unavailable";
  const healthColor =
    stats?.health === "healthy" ? "text-success" : stats?.health === "degraded" ? "text-yellow-400" : "text-destructive";

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
          <div className="mt-4">
            <EtherscanLink kind="contract" variant="pill" label="View Contract on Etherscan" />
          </div>
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
                  <span className={`h-2 w-2 rounded-full ${stats?.health === "healthy" ? "bg-success animate-pulse-glow" : "bg-yellow-400"}`} />
                  {CONTRACT_INFO.network} <span className="text-muted-foreground">(chain {CONTRACT_INFO.chainId})</span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Deployment</div>
                <div className="mt-2 font-mono text-sm flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Deployed on {EXPECTED_NETWORK_NAME}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Latest block</div>
                <div className="mt-2 font-mono text-sm">
                  {stats?.latestBlock != null ? `#${stats.latestBlock.toLocaleString()}` : loading ? "…" : "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 grid md:grid-cols-4 gap-4">
            <Stat
              icon={Activity}
              label="Read status"
              value={healthLabel}
              color={healthColor}
              loading={loading && !stats}
            />
            <Stat
              icon={Database}
              label="Active auctions"
              value={stats ? String(stats.activeAuctions) : "…"}
              color="text-primary-glow"
              loading={loading && !stats}
            />
            <Stat
              icon={Hash}
              label="Total auctions"
              value={stats ? String(stats.totalAuctions) : "…"}
              color="text-accent"
              loading={loading && !stats}
            />
            <Stat
              icon={FileCode2}
              label="Finalized"
              value={stats ? String(stats.finalizedAuctions) : "…"}
              color="text-foreground"
              loading={loading && !stats}
            />
          </div>

          {lastUpdated && (
            <div className="px-6 md:px-8 pb-4 text-[11px] text-muted-foreground flex items-center gap-2">
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Updated {lastUpdated.toLocaleTimeString()} • auto-refresh every 30s
            </div>
          )}
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
              <Activity className="h-4 w-4 text-accent" /> Latest Auction Records
            </h3>
            {recentAuctions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {loading ? "Loading on-chain records…" : "No auctions on-chain yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {recentAuctions.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/40 border border-border/60">
                    <div className="min-w-0 flex-1">
                      <code className="font-mono text-xs text-primary-glow">Auction #{a.id}</code>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {a.title || "(no title)"} • {a.active ? "active" : a.ended ? "finalized" : "ended"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{a.highestBidEth} ETH</div>
                      <a
                        href={explorerTxUrl(CONTRACT_ADDRESS).replace("/tx/", "/address/")}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary hover:text-primary-glow inline-flex items-center gap-0.5"
                      >
                        View <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Integration note */}
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1.5">Live integration</p>
          <p>
            The frontend reads and writes through <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary-glow">src/lib/contract.ts</code> using <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary-glow">ethers.js v6</code> and the ABI in <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary-glow">src/abi/BlockBidAuction.json</code>. All counters above are derived from live contract reads.
          </p>
        </div>
      </div>
    </Layout>
  );
};

const Stat = ({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon: typeof FileCode2;
  label: string;
  value: string;
  color: string;
  loading?: boolean;
}) => (
  <div className="rounded-xl border border-border bg-card-elevated p-4">
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Icon className={`h-4 w-4 ${color}`} />
    </div>
    <div className={`text-2xl font-bold font-mono mt-2 ${color} flex items-center gap-2`}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : value}
    </div>
  </div>
);

export default ContractInfo;
