import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import abi from "@/abi/BlockBidAuction.json";

export const CONTRACT_ADDRESS = "0x32A5C515cbb766A6Df86CF2073ef755a45e8d746";
export const SEPOLIA_CHAIN_ID = "0xaa36a7";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function shortAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function getProvider() {
  if (!window.ethereum) {
    throw new Error("MetaMask nije instaliran.");
  }
  return new BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const provider = await getProvider();
  return provider.getSigner();
}

export async function connectWallet() {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
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

export async function getContract(withSigner = false) {
  await ensureSepoliaNetwork();
  const provider = await getProvider();

  if (withSigner) {
    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, abi, signer);
  }

  return new Contract(CONTRACT_ADDRESS, abi, provider);
}

export async function getAuctionCount() {
  const contract = await getContract(false);
  const count = await contract.auctionCount();
  return Number(count);
}

export async function getAuction(id: number) {
  const contract = await getContract(false);
  const auction = await contract.getAuction(id);

  return {
    id: Number(auction[0]),
    seller: auction[1],
    title: auction[2],
    startingBidWei: auction[3].toString(),
    startingBidEth: formatEther(auction[3]),
    highestBidWei: auction[4].toString(),
    highestBidEth: formatEther(auction[4]),
    highestBidder: auction[5],
    endTime: Number(auction[6]),
    ended: auction[7],
  };
}

export async function getCurrentMinBid(auctionId: number) {
  const contract = await getContract(false);
  const result = await contract.getCurrentMinBid(auctionId);

  return {
    wei: result.toString(),
    eth: formatEther(result),
  };
}

export async function isAuctionActive(auctionId: number) {
  const contract = await getContract(false);
  return await contract.isAuctionActive(auctionId);
}

export async function getTimeLeft(auctionId: number) {
  const contract = await getContract(false);
  const result = await contract.getTimeLeft(auctionId);
  return Number(result);
}

export async function createAuction(
  title: string,
  startingBidEth: string,
  durationInMinutes: number
) {
  if (!title.trim()) throw new Error("Naziv aukcije je obavezan.");
  if (!startingBidEth) throw new Error("Početna cena je obavezna.");
  if (!durationInMinutes || durationInMinutes <= 0) {
    throw new Error("Trajanje mora biti veće od 0.");
  }

  const contract = await getContract(true);
  const tx = await contract.createAuction(
    title,
    parseEther(startingBidEth),
    durationInMinutes
  );
  return await tx.wait();
}

export async function placeBid(auctionId: number, amountEth: string) {
  if (!amountEth) throw new Error("Iznos ponude je obavezan.");

  const contract = await getContract(true);
  const tx = await contract.placeBid(auctionId, {
    value: parseEther(amountEth),
  });
  return await tx.wait();
}

export async function endAuction(auctionId: number) {
  const contract = await getContract(true);
  const tx = await contract.endAuction(auctionId);
  return await tx.wait();
}

export async function withdrawFunds() {
  const contract = await getContract(true);
  const tx = await contract.withdraw();
  return await tx.wait();
}

export async function getPendingReturns(address: string) {
  const contract = await getContract(false);
  const result = await contract.pendingReturns(address);
  return {
    wei: result.toString(),
    eth: formatEther(result),
  };
}

export async function getAllAuctions() {
  const count = await getAuctionCount();

  if (count === 0) return [];

  const auctions = await Promise.all(
    Array.from({ length: count }, (_, i) => getAuction(i + 1))
  );

  return auctions.sort((a, b) => b.id - a.id);
}

/* ------------------------------------------------------------------ */
/* Compatibility layer for the rest of the app (Marketplace, Dashboard,
   AuctionDetails, BidModal, CreateAuction, WalletContext, ContractInfo).
   Keeps existing imports working without changing the demo logic above. */
/* ------------------------------------------------------------------ */

export type OnChainAuction = Awaited<ReturnType<typeof getAuction>>;

export const EXPECTED_CHAIN_ID = 11155111; // Sepolia decimal
export const EXPECTED_NETWORK_NAME = "Sepolia";

export const shortenAddress = shortAddress;
export const withdraw = withdrawFunds;

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

export async function switchToSepolia() {
  if (!window.ethereum) throw new Error("MetaMask nije instaliran.");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID,
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.infura.io/v3/"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export function parseTxError(err: unknown): string {
  if (!err) return "Nepoznata greška.";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED")
    return "Transakcija odbijena u walletu.";
  if (e?.shortMessage) return e.shortMessage;
  if (e?.reason) return e.reason;
  if (e?.data?.message) return e.data.message;
  if (e?.message) return e.message;
  return String(err);
}
