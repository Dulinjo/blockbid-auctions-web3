/**
 * BlockBid contract helper.
 * All blockchain logic lives here so components stay clean.
 */
import { BrowserProvider, Contract, JsonRpcSigner, formatEther, parseEther } from "ethers";
import abi from "@/abi/BlockBidAuction.json";

export const CONTRACT_ADDRESS = "0xd8b934580fcE35a11B58C6D73aDeE468a2833fa8";
export const EXPECTED_CHAIN_ID = 11155111; // Sepolia
export const EXPECTED_NETWORK_NAME = "Sepolia";
export const ABI = abi;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eth = () => (typeof window !== "undefined" ? (window as any).ethereum : undefined);

export const isMetaMaskInstalled = (): boolean => Boolean(eth()?.isMetaMask);

export interface WalletInfo {
  address: string;
  network: string;
  chainId: number;
  balance: string;
}

export interface OnChainAuction {
  id: number;
  seller: string;
  title: string;
  startingPrice: string; // ETH
  highestBid: string; // ETH
  highestBidder: string;
  endTime: number; // unix ms
  ended: boolean;
  active: boolean;
  timeLeft: number; // seconds
}

export const getProvider = (): BrowserProvider => {
  const e = eth();
  if (!e) throw new Error("MetaMask not detected. Please install MetaMask.");
  return new BrowserProvider(e);
};

export const getSigner = async (): Promise<JsonRpcSigner> => {
  const provider = getProvider();
  return await provider.getSigner();
};

export const getContract = async (withSigner = false): Promise<Contract> => {
  const provider = getProvider();
  if (withSigner) {
    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, ABI, signer);
  }
  return new Contract(CONTRACT_ADDRESS, ABI, provider);
};

export const switchToSepolia = async (): Promise<void> => {
  const e = eth();
  if (!e) throw new Error("MetaMask not detected");
  try {
    await e.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.code === 4902) {
      await e.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xaa36a7",
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
};

export const connectWallet = async (): Promise<WalletInfo> => {
  const e = eth();
  if (!e) throw new Error("MetaMask not detected. Please install MetaMask.");
  const accounts: string[] = await e.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) throw new Error("No account selected");

  const provider = getProvider();
  const network = await provider.getNetwork();
  const balanceWei = await provider.getBalance(accounts[0]);

  return {
    address: accounts[0],
    network: network.name === "unknown" ? `Chain ${network.chainId}` : network.name,
    chainId: Number(network.chainId),
    balance: parseFloat(formatEther(balanceWei)).toFixed(4),
  };
};

// ---- Read methods ----

export const getAuctionCount = async (): Promise<number> => {
  const c = await getContract(false);
  const count: bigint = await c.auctionCount();
  return Number(count);
};

export const getAuction = async (id: number): Promise<OnChainAuction> => {
  const c = await getContract(false);
  // Try getAuction(uint256) first; fall back to public mapping `auctions(uint256)`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = await c.getAuction(id);
  } catch {
    raw = await c.auctions(id);
  }

  const [aid, seller, title, startingPrice, highestBid, highestBidder, endTime, ended] = raw;
  const endMs = Number(endTime) * 1000;
  const now = Date.now();
  const active = !ended && endMs > now;
  const timeLeft = Math.max(0, Math.floor((endMs - now) / 1000));

  return {
    id: Number(aid),
    seller,
    title,
    startingPrice: formatEther(startingPrice),
    highestBid: formatEther(highestBid),
    highestBidder,
    endTime: endMs,
    ended,
    active,
    timeLeft,
  };
};

export const getCurrentMinBid = async (id: number): Promise<string> => {
  const c = await getContract(false);
  try {
    const v: bigint = await c.getCurrentMinBid(id);
    return formatEther(v);
  } catch {
    const a = await getAuction(id);
    const current = parseFloat(a.highestBid) || parseFloat(a.startingPrice);
    return (current + 0.0001).toString();
  }
};

export const isAuctionActive = async (id: number): Promise<boolean> => {
  const c = await getContract(false);
  try {
    return await c.isAuctionActive(id);
  } catch {
    const a = await getAuction(id);
    return a.active;
  }
};

export const getTimeLeft = async (id: number): Promise<number> => {
  const c = await getContract(false);
  try {
    const v: bigint = await c.getTimeLeft(id);
    return Number(v);
  } catch {
    const a = await getAuction(id);
    return a.timeLeft;
  }
};

export const getAllAuctions = async (): Promise<OnChainAuction[]> => {
  const count = await getAuctionCount();
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const results = await Promise.all(
    ids.map((id) => getAuction(id).catch(() => null))
  );
  return results.filter((a): a is OnChainAuction => a !== null);
};

// ---- Write methods ----

export interface CreateAuctionInput {
  title: string;
  startingPriceEth: string; // "0.05"
  durationSeconds: number;
}

export const createAuction = async (
  input: CreateAuctionInput
): Promise<{ txHash: string }> => {
  const c = await getContract(true);
  const tx = await c.createAuction(
    input.title,
    parseEther(input.startingPriceEth),
    BigInt(input.durationSeconds)
  );
  await tx.wait();
  return { txHash: tx.hash };
};

export const placeBid = async (
  auctionId: number,
  bidEth: string
): Promise<{ txHash: string }> => {
  const c = await getContract(true);
  const tx = await c.placeBid(auctionId, { value: parseEther(bidEth) });
  await tx.wait();
  return { txHash: tx.hash };
};

export const endAuction = async (auctionId: number): Promise<{ txHash: string }> => {
  const c = await getContract(true);
  const tx = await c.endAuction(auctionId);
  await tx.wait();
  return { txHash: tx.hash };
};

// ---- Helpers ----

export const shortenAddress = (addr: string, chars = 4): string => {
  if (!addr) return "";
  return addr.length > chars * 2 + 2
    ? `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`
    : addr;
};

export const parseTxError = (err: unknown): string => {
  if (!err) return "Unknown error";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return "Transaction rejected in MetaMask";
  if (e.reason) return e.reason;
  if (e.shortMessage) return e.shortMessage;
  if (e.message) return e.message;
  return "Transaction failed";
};

export { formatEther, parseEther };
