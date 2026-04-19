import { useEffect, useState, useCallback } from "react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import abi from "@/abi/BlockBidAuction.json";

const CONTRACT_ADDRESS = "0x32A5C515cbb766A6Df86CF2073ef755a45e8d746";
const SEPOLIA_CHAIN_ID = 11155111;

type LogEntry = { ts: string; msg: string; level: "info" | "ok" | "err" };

type RawAuction = {
  id: string;
  title: string;
  seller: string;
  startingBid: string;
  highestBid: string;
  highestBidder: string;
  endTime: string;
  endTimeHuman: string;
  ended: boolean;
};

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
  const [auctionCount, setAuctionCount] = useState<string>("—");
  const [auctions, setAuctions] = useState<RawAuction[]>([]);
  const [loadingAuctions, setLoadingAuctions] = useState(false);

  const log = useCallback((msg: string, level: LogEntry["level"] = "info") => {
    const ts = new Date().toLocaleTimeString();
    // eslint-disable-next-line no-console
    console.log(`[debug ${ts}] ${msg}`);
    setLogs((prev) => [...prev, { ts, msg, level }]);
  }, []);

  function clearLogs() {
    setLogs([]);
    setLastError(null);
  }

  const handleError = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (where: string, err: any) => {
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
    },
    [log]
  );

  async function getProvider() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth)
      throw new Error(
        "MetaMask nije pronađen (window.ethereum undefined). Otvori app u novom tabu sa instaliranim MetaMaskom."
      );
    return new BrowserProvider(eth);
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

  const formatAuction = (a: any, id: number): RawAuction => {
    const endTime = a[6]?.toString?.() ?? "0";
    const endTimeMs = Number(endTime) * 1000;
    return {
      id: a[0]?.toString?.() ?? String(id),
      title: a[2] ?? "",
      seller: a[1] ?? "",
      startingBid: formatEther(a[3] ?? 0n) + " ETH",
      highestBid: formatEther(a[4] ?? 0n) + " ETH",
      highestBidder: a[5] ?? "",
      endTime,
      endTimeHuman: endTimeMs ? new Date(endTimeMs).toLocaleString() : "—",
      ended: !!a[7],
    };
  };

  const loadAllAuctions = useCallback(async () => {
    setLoadingAuctions(true);
    try {
      log("loadAllAuctions: reading auctionCount...");
      const c = await readContract();
      const countBn = await c.auctionCount();
      const count = Number(countBn);
      setAuctionCount(count.toString());
      log(`auctionCount = ${count}`, "ok");

      if (count === 0) {
        setAuctions([]);
        log("Nema aukcija na ugovoru.", "info");
        return;
      }

      log(`Učitavam aukcije 1..${count}...`);
      const results: RawAuction[] = [];
      for (let i = 1; i <= count; i++) {
        try {
          const a = await c.getAuction(i);
          results.push(formatAuction(a, i));
          log(`getAuction(${i}) OK`, "ok");
        } catch (err) {
          handleError(`getAuction(${i})`, err);
        }
      }
      setAuctions(results);
      log(`Učitano ${results.length} aukcija.`, "ok");
    } catch (err) {
      handleError("loadAllAuctions", err);
    } finally {
      setLoadingAuctions(false);
    }
  }, [log, handleError]);

  // Auto-load on mount
  useEffect(() => {
    loadAllAuctions();
  }, [loadAllAuctions]);

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
      log(
        `chainId: ${net.chainId}`,
        net.chainId === BigInt(SEPOLIA_CHAIN_ID) ? "ok" : "err"
      );
      if (net.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
        log(`POGREŠNA MREŽA. Očekivano ${SEPOLIA_CHAIN_ID} (Sepolia).`, "err");
      }
    } catch (err) {
      handleError("connect", err);
    } finally {
      setBusy(false);
    }
  }

  async function testAuctionCount() {
    setBusy(true);
    try {
      log("auctionCount: calling...");
      const c = await readContract();
      const result = await c.auctionCount();
      log(`auctionCount = ${result.toString()}`, "ok");
      setAuctionCount(result.toString());
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
      const formatted = formatAuction(a, 1);
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
      log("=== createAuction LIFECYCLE START ===");
      log('params: title="Frontend Test", startingBid=0.01 ETH, duration=30');
      log("STEP 1: getting provider + signer...");
      const c = await writeContract();
      log("STEP 2: BEFORE REQUEST -> opening MetaMask...");
      const tx = await c.createAuction("Frontend Test", parseEther("0.01"), 30);
      log("STEP 3: WALLET CONFIRMED, tx submitted", "ok");
      log(`STEP 4: tx.hash = ${tx.hash}`, "ok");
      log(`STEP 4b: tx.nonce = ${tx.nonce}, gasLimit = ${tx.gasLimit?.toString?.()}`);
      log("STEP 5: WAITING FOR CONFIRMATION (tx.wait())...");
      const receipt = await tx.wait();
      log(
        `STEP 6: CONFIRMED in block ${receipt?.blockNumber} (status=${receipt?.status})`,
        "ok"
      );
      log(`STEP 6b: gasUsed = ${receipt?.gasUsed?.toString?.()}`);
      log("STEP 7: refreshing auctions list...");
      await loadAllAuctions();
      log("=== createAuction LIFECYCLE END ===", "ok");
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
          <div>
            <span className="text-muted-foreground">Contract:</span> {CONTRACT_ADDRESS}
          </div>
          <div>
            <span className="text-muted-foreground">Expected chain:</span> {SEPOLIA_CHAIN_ID} (Sepolia)
          </div>
          <div>
            <span className="text-muted-foreground">Wallet:</span>{" "}
            {address || <em className="text-muted-foreground">nije povezan</em>}
          </div>
          <div>
            <span className="text-muted-foreground">Chain ID:</span>{" "}
            {chainId || <em className="text-muted-foreground">—</em>}
          </div>
          <div>
            <span className="text-muted-foreground">auctionCount:</span> {auctionCount}
          </div>
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
            onClick={loadAllAuctions}
            disabled={busy || loadingAuctions}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded disabled:opacity-50"
          >
            {loadingAuctions ? "Loading..." : "Reload All Auctions"}
          </button>
          <button
            onClick={testCreateAuction}
            disabled={busy}
            className="px-3 py-2 bg-accent text-accent-foreground rounded disabled:opacity-50"
          >
            Create Auction Debug
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
          <h2 className="font-bold mb-2">Aukcije ({auctions.length})</h2>
          <div className="space-y-2">
            {auctions.length === 0 && !loadingAuctions && (
              <div className="text-muted-foreground border border-border rounded p-3">
                — nema učitanih aukcija —
              </div>
            )}
            {auctions.map((a) => (
              <div
                key={a.id}
                className="border border-border rounded p-3 bg-muted/30 space-y-1 text-xs"
              >
                <div>
                  <span className="text-muted-foreground">id:</span> {a.id}
                </div>
                <div>
                  <span className="text-muted-foreground">title:</span> {a.title}
                </div>
                <div className="break-all">
                  <span className="text-muted-foreground">seller:</span> {a.seller}
                </div>
                <div>
                  <span className="text-muted-foreground">startingBid:</span> {a.startingBid}
                </div>
                <div>
                  <span className="text-muted-foreground">highestBid:</span> {a.highestBid}
                </div>
                <div className="break-all">
                  <span className="text-muted-foreground">highestBidder:</span> {a.highestBidder}
                </div>
                <div>
                  <span className="text-muted-foreground">endTime:</span> {a.endTime}{" "}
                  <span className="text-muted-foreground">({a.endTimeHuman})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ended:</span>{" "}
                  <span className={a.ended ? "text-destructive" : "text-primary"}>
                    {String(a.ended)}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
                <div>
                  <span className="text-muted-foreground">message:</span>{" "}
                  {String(lastError?.message ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">reason:</span>{" "}
                  {String(lastError?.reason ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">code:</span>{" "}
                  {String(lastError?.code ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">shortMessage:</span>{" "}
                  {String(lastError?.shortMessage ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">info.error.message:</span>{" "}
                  {String(lastError?.info?.error?.message ?? "")}
                </div>
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
