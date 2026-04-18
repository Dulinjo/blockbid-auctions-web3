/**
 * BlockBid blockchain service layer.
 *
 * This is a placeholder service designed to be drop-in replaced
 * with real ethers.js / viem calls once the Solidity contract is
 * deployed via Remix IDE.
 *
 * Expected smart-contract methods:
 *   createAuction(title, startingPrice, durationSeconds, metaURI) -> auctionId
 *   getAuction(id)
 *   getAllAuctions()
 *   placeBid(id) payable
 *   endAuction(id)
 *   getHighestBid(id)
 *   getWinner(id)
 *
 * To wire it up:
 *   1. Add contract ABI + address to a config file.
 *   2. Replace mock implementations below with `new ethers.Contract(...)` calls.
 *   3. Use window.ethereum (MetaMask) as the signer.
 */

import { Auction, Bid } from "@/lib/types";
import { mockAuctions, mockBids } from "@/lib/mockData";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randHash = () =>
  "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

// In-memory store (would be replaced by on-chain reads)
let auctions: Auction[] = [...mockAuctions];
const bids: Record<string, Bid[]> = { ...mockBids };

export interface WalletInfo {
  address: string;
  network: string;
  chainId: number;
  balance: string;
}

export const isMetaMaskInstalled = (): boolean => {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Boolean((window as any).ethereum?.isMetaMask);
};

export const connectWallet = async (): Promise<WalletInfo> => {
  await sleep(800);
  // Real impl:
  //   const provider = new ethers.BrowserProvider(window.ethereum);
  //   const accounts = await provider.send("eth_requestAccounts", []);
  //   const network = await provider.getNetwork();
  //   const balance = await provider.getBalance(accounts[0]);
  const mockAddress =
    "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return {
    address: mockAddress,
    network: "Sepolia Testnet",
    chainId: 11155111,
    balance: (Math.random() * 5 + 1).toFixed(4),
  };
};

export const fetchAuctions = async (): Promise<Auction[]> => {
  await sleep(400);
  return auctions.map((a) => ({
    ...a,
    status: a.endsAt < Date.now() && a.status === "active" ? "ended" : a.status,
  }));
};

export const fetchAuctionById = async (id: string): Promise<Auction | undefined> => {
  await sleep(300);
  return auctions.find((a) => a.id === id);
};

export const fetchBids = async (auctionId: string): Promise<Bid[]> => {
  await sleep(250);
  return bids[auctionId] ?? [];
};

export interface CreateAuctionInput {
  title: string;
  description: string;
  category: string;
  startingPrice: number;
  durationHours: number;
  image: string;
  seller: string;
}

export const createAuction = async (input: CreateAuctionInput): Promise<Auction> => {
  await sleep(1500); // simulate tx confirmation
  const newAuction: Auction = {
    id: "0x" + (auctions.length + 10).toString(16).padStart(2, "0"),
    title: input.title,
    description: input.description,
    category: input.category,
    image: input.image,
    seller: input.seller,
    startingPrice: input.startingPrice,
    highestBid: input.startingPrice,
    highestBidder: null,
    endsAt: Date.now() + input.durationHours * 60 * 60 * 1000,
    status: "active",
    bidCount: 0,
    txHash: randHash(),
  };
  auctions = [newAuction, ...auctions];
  return newAuction;
};

export const placeBid = async (
  auctionId: string,
  amount: number,
  bidder: string
): Promise<{ tx: string; auction: Auction }> => {
  await sleep(1800);
  const auction = auctions.find((a) => a.id === auctionId);
  if (!auction) throw new Error("Auction not found");
  if (amount <= auction.highestBid) throw new Error("Bid must exceed current highest bid");

  const tx = randHash();
  auction.highestBid = amount;
  auction.highestBidder = bidder;
  auction.bidCount += 1;

  bids[auctionId] = [
    { id: "b" + Date.now(), auctionId, bidder, amount, timestamp: Date.now(), txHash: tx },
    ...(bids[auctionId] ?? []),
  ];
  return { tx, auction: { ...auction } };
};

export const endAuction = async (auctionId: string): Promise<Auction> => {
  await sleep(1200);
  const auction = auctions.find((a) => a.id === auctionId);
  if (!auction) throw new Error("Auction not found");
  auction.status = "finalized";
  return { ...auction };
};
