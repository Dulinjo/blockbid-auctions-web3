import { useEffect, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID, shortAddress } from "@/lib/contract";
import { Bug, X, Copy } from "lucide-react";
import { toast } from "sonner";

export type DebugStatus =
  | { phase: "idle" }
  | { phase: "preflight" }
  | { phase: "awaiting_signature" }
  | { phase: "submitted"; txHash: string }
  | { phase: "confirmed"; txHash: string }
  | { phase: "error"; kind: string; message: string };

let externalSetter: ((s: DebugStatus) => void) | null = null;

/** Imperative API so any module can push status updates without prop-drilling. */
export const debugBus = {
  set(status: DebugStatus) {
    externalSetter?.(status);
    // eslint-disable-next-line no-console
    console.log("[BlockBid tx]", status);
  },
};

const phaseLabel: Record<string, string> = {
  idle: "Idle",
  preflight: "Checking wallet & network…",
  awaiting_signature: "Waiting for MetaMask signature…",
  submitted: "Tx submitted, waiting for confirmation…",
  confirmed: "Confirmed on-chain ✓",
  error: "Error",
};

export const TxDebugPanel = () => {
  const { wallet, correctNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DebugStatus>({ phase: "idle" });

  useEffect(() => {
    externalSetter = setStatus;
    return () => {
      externalSetter = null;
    };
  }, []);

  const dotColor =
    status.phase === "error"
      ? "bg-destructive"
      : status.phase === "confirmed"
        ? "bg-success"
        : status.phase === "idle"
          ? "bg-muted-foreground"
          : "bg-warning animate-pulse";

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copied");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-2 text-xs font-mono shadow-lg backdrop-blur hover:bg-card"
      >
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <Bug className="h-3.5 w-3.5" />
        Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Bug className="h-3.5 w-3.5 text-primary" /> Tx Debug Panel
        </div>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 p-3 text-xs font-mono">
        <Row label="Wallet">
          {wallet ? (
            <button onClick={() => copy(wallet.address)} className="flex items-center gap-1 text-primary hover:text-primary-glow">
              {shortAddress(wallet.address)} <Copy className="h-3 w-3" />
            </button>
          ) : (
            <span className="text-muted-foreground">not connected</span>
          )}
        </Row>
        <Row label="Chain">
          <span className={correctNetwork ? "text-success" : "text-warning"}>
            {wallet?.chainId ?? "—"} {correctNetwork ? "(Sepolia ✓)" : `(expected ${EXPECTED_CHAIN_ID})`}
          </span>
        </Row>
        <Row label="Balance">{wallet ? `${wallet.balance} ETH` : "—"}</Row>
        <Row label="Contract">
          <button onClick={() => copy(CONTRACT_ADDRESS)} className="flex items-center gap-1 text-primary hover:text-primary-glow">
            {shortAddress(CONTRACT_ADDRESS, 6)} <Copy className="h-3 w-3" />
          </button>
        </Row>

        <div className="my-2 border-t border-border" />

        <Row label="Status">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {phaseLabel[status.phase] ?? status.phase}
          </span>
        </Row>

        {"txHash" in status && status.txHash && (
          <Row label="Tx">
            <a
              href={`https://sepolia.etherscan.io/tx/${status.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:text-primary-glow underline-offset-2 hover:underline"
            >
              {status.txHash.slice(0, 10)}…{status.txHash.slice(-6)}
            </a>
          </Row>
        )}

        {status.phase === "error" && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            <div className="font-semibold">{status.kind}</div>
            <div className="mt-1 break-words font-sans text-[11px]">{status.message}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right">{children}</span>
  </div>
);
