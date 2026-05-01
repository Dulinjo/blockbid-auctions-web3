import { BrowserProvider, Contract, JsonRpcProvider, formatEther, parseEther } from "ethers";
import abi from "@/abi/BlockBidAuction.json";

// Contract address is read from env so the deployment can be swapped
// without code changes. The fallback below points at the original Sepolia
// demo deployment so the app still works out-of-the-box for graders /
// reviewers who haven't configured a custom .env.
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x32A5C515cbb766A6Df86CF2073ef755a45e8d746";
export const SEPOLIA_CHAIN_ID = "0xaa36a7";
export const EXPECTED_CHAIN_ID = 11155111;
export const EXPECTED_NETWORK_NAME = "Sepolia";

function normalizeChainId(chainId: unknown): number | null {
  if (typeof chainId === "number" && Number.isFinite(chainId)) return chainId;
  if (typeof chainId === "bigint") return Number(chainId);
  if (typeof chainId === "string") {
    const raw = chainId.trim();
    if (!raw) return null;
    const parsed = raw.toLowerCase().startsWith("0x")
      ? Number.parseInt(raw, 16)
      : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isSepoliaChainId(chainId: unknown): boolean {
  return normalizeChainId(chainId) === EXPECTED_CHAIN_ID;
}

// Public read-only RPCs used when MetaMask is missing or on a different network.
// Reading auction data must work for every visitor (mobile, shared links, etc.).
const SEPOLIA_PUBLIC_RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://1rpc.io/sepolia",
];

let _readProvider: JsonRpcProvider | null = null;
export function getReadProvider(): JsonRpcProvider {
  if (_readProvider) return _readProvider;
  _readProvider = new JsonRpcProvider(SEPOLIA_PUBLIC_RPCS[0], EXPECTED_CHAIN_ID, {
    staticNetwork: true,
  });
  return _readProvider;
}

function getReadContract(): Contract {
  return new Contract(CONTRACT_ADDRESS, abi, getReadProvider());
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

/**
 * EIP-1193 provider used for writes. Defaults to window.ethereum (MetaMask)
 * but can be overridden by the wallet layer (wagmi connector, Coinbase,
 * WalletConnect, Rabby, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _activeWriteProvider: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setActiveWalletProvider(provider: any | null) {
  _activeWriteProvider = provider;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getWriteEip1193(): any | null {
  if (_activeWriteProvider) return _activeWriteProvider;
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  return null;
}

export function shortAddress(address?: string, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}
export const shortenAddress = shortAddress;

export interface WalletInfo {
  address: string;
  network: string;
  chainId: number;
  balance: string;
}

export function isMetaMaskInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.ethereum);
}

/** True when any EVM wallet (injected or wagmi-connected) is available for writes. */
export function hasAnyWallet(): boolean {
  return Boolean(getWriteEip1193());
}

export async function getProvider() {
  const eip = getWriteEip1193();
  if (!eip) throw new Error("Wallet nije povezan.");
  return new BrowserProvider(eip);
}

export async function getSigner() {
  const provider = await getProvider();
  return provider.getSigner();
}

/**
 * Connects MetaMask. Returns rich wallet info compatible with the WalletContext.
 * Demo code that destructures `{ address }` keeps working.
 */
export async function connectWallet(): Promise<WalletInfo> {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  const balanceWei = await provider.getBalance(address);
  return {
    address,
    network: network.name === "unknown" ? "Sepolia" : network.name,
    chainId: Number(network.chainId),
    balance: parseFloat(formatEther(balanceWei)).toFixed(4),
  };
}

export async function getNetworkInfo() {
  const provider = await getProvider();
  const network = await provider.getNetwork();
  return {
    chainId: `0x${network.chainId.toString(16)}`,
    chainIdDecimal: Number(network.chainId),
    name: network.name,
  };
}

export async function ensureSepoliaNetwork() {
  const eip = getWriteEip1193();
  if (!eip) throw new Error("Wallet nije povezan.");
  const chainId = await eip.request({ method: "eth_chainId" });
  if (!isSepoliaChainId(chainId)) {
    throw new Error("Poveži wallet na Sepolia mrežu.");
  }
}

export async function switchToSepolia() {
  const eip = getWriteEip1193();
  if (!eip) throw new Error("Wallet nije povezan.");
  try {
    await eip.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    if (e?.code === 4902) {
      await eip.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID,
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function getContract(withSigner = false) {
  // Writes require an active wallet (any EVM connector) on Sepolia.
  // Reads use the active wallet's provider when on Sepolia, else the public RPC fallback.
  if (withSigner) {
    await ensureSepoliaNetwork();
    const provider = await getProvider();
    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, abi, signer);
  }
  const eip = getWriteEip1193();
  if (eip) {
    try {
      const chainId = await eip.request({ method: "eth_chainId" });
      if (isSepoliaChainId(chainId)) {
        const provider = new BrowserProvider(eip);
        return new Contract(CONTRACT_ADDRESS, abi, provider);
      }
    } catch {
      /* fall through to public RPC */
    }
  }
  return getReadContract();
}

/* ---------------- Read methods ---------------- */

export async function getAuctionCount() {
  const contract = await getContract(false);
  return Number(await contract.auctionCount());
}

export interface OnChainAuction {
  id: number;
  seller: string;
  title: string;
  startingBidWei: string;
  startingBidEth: string;
  highestBidWei: string;
  highestBidEth: string;
  highestBidder: string;
  endTime: number; // unix seconds
  ended: boolean;
  // UI aliases (also kept so existing components keep working):
  startingPrice: string; // ETH string
  highestBid: string;    // ETH string
  active: boolean;       // !ended && now < endTime
  endsAtMs: number;      // endTime * 1000 for Countdown helpers
}

export async function getAuction(id: number): Promise<OnChainAuction> {
  const contract = await getContract(false);
  const a = await contract.getAuction(id);
  const endTime = Number(a[6]);
  const ended: boolean = a[7];
  const startingBidEth = formatEther(a[3]);
  const highestBidEth = formatEther(a[4]);
  return {
    id: Number(a[0]),
    seller: a[1],
    title: a[2],
    startingBidWei: a[3].toString(),
    startingBidEth,
    highestBidWei: a[4].toString(),
    highestBidEth,
    highestBidder: a[5],
    endTime,
    ended,
    startingPrice: startingBidEth,
    highestBid: highestBidEth,
    active: !ended && Date.now() / 1000 < endTime,
    endsAtMs: endTime * 1000,
  };
}

export async function getCurrentMinBid(auctionId: number): Promise<string> {
  const contract = await getContract(false);
  const result = await contract.getCurrentMinBid(auctionId);
  return formatEther(result);
}

export async function isAuctionActive(auctionId: number): Promise<boolean> {
  const contract = await getContract(false);
  return await contract.isAuctionActive(auctionId);
}

export async function getTimeLeft(auctionId: number): Promise<number> {
  const contract = await getContract(false);
  return Number(await contract.getTimeLeft(auctionId));
}

export async function getPendingReturns(address: string): Promise<string> {
  const contract = await getContract(false);
  const result = await contract.pendingReturns(address);
  return formatEther(result);
}

export async function getAllAuctions(): Promise<OnChainAuction[]> {
  const count = await getAuctionCount();
  if (count === 0) return [];
  const auctions = await Promise.all(
    Array.from({ length: count }, (_, i) => getAuction(i + 1))
  );
  return auctions.sort((a, b) => b.id - a.id);
}

/* ---------------- Write methods ----------------
 * Each write returns { txHash, receipt } so existing UI code that
 * destructures `{ txHash }` keeps working. The simple demo (AuctionTest)
 * that ignores the return value also keeps working.
 */

export interface TxResult {
  txHash: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  receipt: any;
}

export interface CreateAuctionResult extends TxResult {
  /** On-chain auction ID assigned by the contract (parsed from AuctionCreated event). */
  auctionId: number | null;
}

export type TxPhase = "preflight" | "awaiting_signature" | "submitted" | "confirmed";

export interface TxCallbacks {
  onPhase?: (phase: TxPhase, info?: { txHash?: string }) => void;
}

async function preflight(callbacks?: TxCallbacks) {
  callbacks?.onPhase?.("preflight");
  if (!hasAnyWallet()) throw new Error("Wallet nije povezan.");
  await ensureSepoliaNetwork();
}

export interface CreateAuctionInput {
  title: string;
  startingPriceEth: string;
  durationMinutes: number;
}

// Overloaded: accepts either positional args (demo) or the input object (app).
export async function createAuction(
  titleOrInput: string | CreateAuctionInput,
  startingBidEth?: string,
  durationInMinutes?: number,
  callbacks?: TxCallbacks
): Promise<CreateAuctionResult> {
  let title: string;
  let priceEth: string;
  let minutes: number;
  if (typeof titleOrInput === "object") {
    title = titleOrInput.title;
    priceEth = titleOrInput.startingPriceEth;
    minutes = titleOrInput.durationMinutes;
  } else {
    title = titleOrInput;
    priceEth = startingBidEth!;
    minutes = durationInMinutes!;
  }

  if (!title.trim()) throw new Error("Naziv aukcije je obavezan.");
  if (!priceEth) throw new Error("Početna cena je obavezna.");
  if (!minutes || minutes <= 0) throw new Error("Trajanje mora biti veće od 0.");

  await preflight(callbacks);
  const contract = await getContract(true);
  callbacks?.onPhase?.("awaiting_signature");
  const tx = await contract.createAuction(title, parseEther(priceEth), minutes);
  callbacks?.onPhase?.("submitted", { txHash: tx.hash });
  const receipt = await tx.wait();
  callbacks?.onPhase?.("confirmed", { txHash: tx.hash });

  // Parse AuctionCreated event from receipt to learn the on-chain ID
  // assigned to the new auction. This ID is the source of truth that
  // off-chain metadata (image, description, ...) is keyed against.
  let auctionId: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = (receipt?.logs ?? []) as any[];
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "AuctionCreated") {
          auctionId = Number(parsed.args.auctionId);
          break;
        }
      } catch {
        /* not our event, keep scanning */
      }
    }
    if (auctionId === null) {
      // Fallback: assume the latest auctionCount is the new auction.
      auctionId = await getAuctionCount();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[createAuction] could not resolve new auctionId", e);
  }

  return { txHash: tx.hash, receipt, auctionId };
}


export async function placeBid(
  auctionId: number,
  amountEth: string,
  callbacks?: TxCallbacks
): Promise<TxResult> {
  if (!amountEth) throw new Error("Iznos ponude je obavezan.");
  await preflight(callbacks);
  const contract = await getContract(true);
  callbacks?.onPhase?.("awaiting_signature");
  const tx = await contract.placeBid(auctionId, { value: parseEther(amountEth) });
  callbacks?.onPhase?.("submitted", { txHash: tx.hash });
  const receipt = await tx.wait();
  callbacks?.onPhase?.("confirmed", { txHash: tx.hash });
  return { txHash: tx.hash, receipt };
}

export async function endAuction(auctionId: number, callbacks?: TxCallbacks): Promise<TxResult> {
  await preflight(callbacks);
  const contract = await getContract(true);
  callbacks?.onPhase?.("awaiting_signature");
  const tx = await contract.endAuction(auctionId);
  callbacks?.onPhase?.("submitted", { txHash: tx.hash });
  const receipt = await tx.wait();
  callbacks?.onPhase?.("confirmed", { txHash: tx.hash });
  return { txHash: tx.hash, receipt };
}

export async function withdrawFunds(callbacks?: TxCallbacks): Promise<TxResult> {
  await preflight(callbacks);
  const contract = await getContract(true);
  callbacks?.onPhase?.("awaiting_signature");
  const tx = await contract.withdraw();
  callbacks?.onPhase?.("submitted", { txHash: tx.hash });
  const receipt = await tx.wait();
  callbacks?.onPhase?.("confirmed", { txHash: tx.hash });
  return { txHash: tx.hash, receipt };
}
export const withdraw = withdrawFunds;

/* ---------------- Error helper ---------------- */

export type TxErrorKind =
  | "user_rejected"
  | "wrong_network"
  | "no_wallet"
  | "insufficient_funds"
  | "contract_revert"
  | "provider_disconnected"
  | "network_error"
  | "unknown";

export interface ParsedTxError {
  kind: TxErrorKind;
  message: string;
  raw?: unknown;
}

export function classifyTxError(err: unknown): ParsedTxError {
  if (!err) return { kind: "unknown", message: "Nepoznata greška." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const code = e?.code ?? e?.error?.code;
  const msg: string =
    e?.shortMessage ||
    e?.reason ||
    e?.info?.error?.message ||
    e?.error?.message ||
    e?.data?.message ||
    e?.message ||
    String(err);
  const lower = String(msg).toLowerCase();

  if (code === 4001 || code === "ACTION_REJECTED" || lower.includes("user rejected") || lower.includes("user denied"))
    return { kind: "user_rejected", message: "Transakcija odbijena u walletu.", raw: err };
  if (code === 4900 || code === 4901 || lower.includes("disconnected from"))
    return { kind: "provider_disconnected", message: "Wallet nije povezan sa mrežom.", raw: err };
  if (lower.includes("metamask nije instaliran") || lower.includes("no ethereum"))
    return { kind: "no_wallet", message: "MetaMask nije dostupan u ovom pregledu. Otvori app u novom tabu.", raw: err };
  // Detect insufficient-funds before generic chain/network wording so
  // errors like "insufficient funds on chain ... network ..." are not
  // incorrectly reported as wrong_network.
  if (
    code === "INSUFFICIENT_FUNDS" ||
    lower.includes("insufficient funds") ||
    lower.includes("gas required exceeds allowance") ||
    lower.includes("exceeds balance")
  ) {
    return {
      kind: "insufficient_funds",
      message: "Nedovoljno Sepolia ETH za gas (i eventualni iznos transakcije).",
      raw: err,
    };
  }
  const explicitWrongNetwork =
    lower.includes("poveži wallet na sepolia") ||
    lower.includes("switch to sepolia") ||
    lower.includes("wrong network") ||
    lower.includes("unsupported chain");
  if (explicitWrongNetwork || (lower.includes("chain") && lower.includes("network") && lower.includes("sepolia")))
    return { kind: "wrong_network", message: "Pogrešna mreža. Prebaci MetaMask na Sepolia.", raw: err };
  if (code === "CALL_EXCEPTION" || lower.includes("execution reverted") || lower.includes("revert"))
    return { kind: "contract_revert", message: msg.replace(/^execution reverted:?\s*/i, "Contract revert: "), raw: err };
  if (code === "NETWORK_ERROR" || lower.includes("failed to fetch") || lower.includes("could not detect network"))
    return { kind: "network_error", message: "Mrežna greška ka RPC-u. Proveri MetaMask konekciju i Sepolia RPC.", raw: err };

  return { kind: "unknown", message: msg, raw: err };
}

export function parseTxError(err: unknown): string {
  return classifyTxError(err).message;
}
