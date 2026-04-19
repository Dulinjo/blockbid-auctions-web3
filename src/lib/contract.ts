import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import abi from "@/abi/BlockBidAuction.json";

export const CONTRACT_ADDRESS = "0x32A5C515cbb766A6Df86CF2073ef755a45e8d746";
export const SEPOLIA_CHAIN_ID = "0xaa36a7";
export const EXPECTED_CHAIN_ID = 11155111;
export const EXPECTED_NETWORK_NAME = "Sepolia";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
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

export async function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask nije instaliran.");
  return new BrowserProvider(window.ethereum);
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
  if (!window.ethereum) throw new Error("MetaMask nije instaliran.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error("Poveži MetaMask na Sepolia mrežu.");
  }
}

export async function switchToSepolia() {
  if (!window.ethereum) throw new Error("MetaMask nije instaliran.");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    if (e?.code === 4902) {
      await window.ethereum.request({
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
  await ensureSepoliaNetwork();
  const provider = await getProvider();
  if (withSigner) {
    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, abi, signer);
  }
  return new Contract(CONTRACT_ADDRESS, abi, provider);
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

export interface CreateAuctionInput {
  title: string;
  startingPriceEth: string;
  durationMinutes: number;
}

// Overloaded: accepts either positional args (demo) or the input object (app).
export async function createAuction(
  titleOrInput: string | CreateAuctionInput,
  startingBidEth?: string,
  durationInMinutes?: number
): Promise<TxResult> {
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

  const contract = await getContract(true);
  const tx = await contract.createAuction(title, parseEther(priceEth), minutes);
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}

export async function placeBid(auctionId: number, amountEth: string): Promise<TxResult> {
  if (!amountEth) throw new Error("Iznos ponude je obavezan.");
  const contract = await getContract(true);
  const tx = await contract.placeBid(auctionId, { value: parseEther(amountEth) });
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}

export async function endAuction(auctionId: number): Promise<TxResult> {
  const contract = await getContract(true);
  const tx = await contract.endAuction(auctionId);
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}

export async function withdrawFunds(): Promise<TxResult> {
  const contract = await getContract(true);
  const tx = await contract.withdraw();
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}
export const withdraw = withdrawFunds;

/* ---------------- Error helper ---------------- */

export function parseTxError(err: unknown): string {
  if (!err) return "Nepoznata greška.";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") return "Transakcija odbijena u walletu.";
  if (e?.shortMessage) return e.shortMessage;
  if (e?.reason) return e.reason;
  if (e?.data?.message) return e.data.message;
  if (e?.message) return e.message;
  return String(err);
}
