import { useState } from "react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import abi from "@/abi/BlockBidAuction.json";

const CONTRACT_ADDRESS = "0x32A5C515cbb766A6Df86CF2073ef755a45e8d746";
const SEPOLIA_CHAIN_ID = 11155111;

type LogEntry = { ts: string; msg: string; level: "info" | "ok" | "err" };

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
  } catch {
    return String(value);
  }
}

export default function Debug() {
  const [address, setAddress] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lastError, setLastError] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  function log(msg: string, level: LogEntry["level"] = "info") {
    const ts = new Date().toLocaleTimeString();
    // eslint-disable-next-line no-console
    console.log(`[debug ${ts}] ${msg}`);
    setLogs((prev) => [...prev, { ts, msg, level }]);
  }

  function clearLogs() {
    setLogs([]);
    setLastError(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleError(where: string, err: any) {
    // eslint-disable-next-line no-console
    console.error(`[debug] ${where}`, err);
    setLastError(err);
    const parts = [
      err?.code ? `code=${err.code}` : "",
      err?.shortMessage ? `short=${err.shortMessage}` : "",
      err?.reason ? `reason=${err.reason}` : "",
      err?.info?.error?.message ? `info=${err.info.error.message}` : "",
      err?.message ? `message=${err.message}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    log(`${where} FAILED -> ${parts || String(err)}`, "err");
  }

  async function getProvider() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask nije pronađen (window.ethereum undefined). Otvori app u novom tabu sa instaliranim MetaMaskom.");
    return new BrowserProvider(eth);
  }

  async function connect() {
    setBusy(true);
    try {
      log("connect: requesting accounts...");
      const provider = await getProvider();
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      const net = await provider.getNetwork();
      setAddress(addr);
      setChainId(`${net.chainId} (0x${net.chainId.toString(16)})`);
      log(`connected: ${addr}`, "ok");
      log(`chainId: ${net.chainId}`, net.chainId === BigInt(SEPOLIA_CHAIN_ID) ? "ok" : "err");
      if (net.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
        log(`POGREŠNA MREŽA. Očekivano ${SEPOLIA_CHAIN_ID} (Sepolia).`, "err");
      }
    } catch (err) {
      handleError("connect", err);
    } finally {
      setBusy(false);
    }
  }

  async function readContract() {
    const provider = await getProvider();
    return new Contract(CONTRACT_ADDRESS, abi, provider);
  }

  async function writeContract() {
    const provider = await getProvider();
    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, abi, signer);
  }

  async function testAuctionCount() {
    setBusy(true);
    try {
      log("auctionCount: calling...");
      const c = await readContract();
      const result = await c.auctionCount();
      log(`auctionCount = ${result.toString()}`, "ok");
    } catch (err) {
      handleError("auctionCount", err);
    } finally {
      setBusy(false);
    }
  }

  async function testGetAuction1() {
    setBusy(true);
    try {
      log("getAuction(1): calling...");
      const c = await readContract();
      const a = await c.getAuction(1);
      const formatted = {
        id: a[0]?.toString?.(),
        seller: a[1],
        title: a[2],
        startingBid: formatEther(a[3]) + " ETH",
        highestBid: formatEther(a[4]) + " ETH",
        highestBidder: a[5],
        endTime: a[6]?.toString?.(),
        ended: a[7],
      };
      log(`getAuction(1) = ${safeStringify(formatted)}`, "ok");
    } catch (err) {
      handleError("getAuction(1)", err);
    } finally {
      setBusy(false);
    }
  }

  async function testCreateAuction() {
    setBusy(true);
    try {
      log('createAuction: title="Frontend Test", startingBid=0.01 ETH, duration=30');
      log("createAuction: BEFORE REQUEST -> opening MetaMask...");
      const c = await writeContract();
      const tx = await c.createAuction("Frontend Test", parseEther("0.01"), 30);
      log("createAuction: WALLET CONFIRMED, tx submitted", "ok");
      log(`createAuction: tx.hash = ${tx.hash}`, "ok");
      log("createAuction: WAITING FOR CONFIRMATION...");
      const receipt = await tx.wait();
      log(`createAuction: CONFIRMED in block ${receipt?.blockNumber} (status=${receipt?.status})`, "ok");
    } catch (err) {
      handleError("createAuction", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 font-mono text-sm">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-bold">BlockBid — Debug</h1>
          <p className="text-muted-foreground text-xs">
            Minimalni ekran za testiranje contract poziva. Sve greške se prikazuju u sirovom obliku.
          </p>
        </header>

        <section className="border border-border rounded p-4 space-y-1">
          <div><span className="text-muted-foreground">Contract:</span> {CONTRACT_ADDRESS}</div>
          <div><span className="text-muted-foreground">Expected chain:</span> {SEPOLIA_CHAIN_ID} (Sepolia)</div>
          <div><span className="text-muted-foreground">Wallet:</span> {address || <em className="text-muted-foreground">nije povezan</em>}</div>
          <div><span className="text-muted-foreground">Chain ID:</span> {chainId || <em className="text-muted-foreground">—</em>}</div>
        </section>

        <section className="flex flex-wrap gap-2">
          <button
            onClick={connect}
            disabled={busy}
            className="px-3 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
          >
            Connect Wallet
          </button>
          <button
            onClick={testAuctionCount}
            disabled={busy}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded disabled:opacity-50"
          >
            Test auctionCount()
          </button>
          <button
            onClick={testGetAuction1}
            disabled={busy}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded disabled:opacity-50"
          >
            Test getAuction(1)
          </button>
          <button
            onClick={testCreateAuction}
            disabled={busy}
            className="px-3 py-2 bg-accent text-accent-foreground rounded disabled:opacity-50"
          >
            Test createAuction()
          </button>
          <button
            onClick={clearLogs}
            disabled={busy}
            className="px-3 py-2 border border-border rounded disabled:opacity-50"
          >
            Clear
          </button>
        </section>

        <section>
          <h2 className="font-bold mb-2">Logs</h2>
          <div className="border border-border rounded p-3 bg-muted/30 max-h-72 overflow-auto space-y-1">
            {logs.length === 0 && <div className="text-muted-foreground">— prazno —</div>}
            {logs.map((l, i) => (
              <div
                key={i}
                className={
                  l.level === "err"
                    ? "text-destructive"
                    : l.level === "ok"
                    ? "text-primary"
                    : "text-foreground"
                }
              >
                [{l.ts}] {l.msg}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-bold mb-2">Last raw error</h2>
          <div className="border border-border rounded p-3 bg-muted/30 space-y-2">
            {!lastError && <div className="text-muted-foreground">— nema greške —</div>}
            {lastError && (
              <>
                <div><span className="text-muted-foreground">message:</span> {String(lastError?.message ?? "")}</div>
                <div><span className="text-muted-foreground">reason:</span> {String(lastError?.reason ?? "")}</div>
                <div><span className="text-muted-foreground">code:</span> {String(lastError?.code ?? "")}</div>
                <div><span className="text-muted-foreground">shortMessage:</span> {String(lastError?.shortMessage ?? "")}</div>
                <div><span className="text-muted-foreground">info.error.message:</span> {String(lastError?.info?.error?.message ?? "")}</div>
                <pre className="text-xs whitespace-pre-wrap break-all bg-background border border-border rounded p-2 overflow-auto max-h-72">
{safeStringify(lastError)}
                </pre>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
