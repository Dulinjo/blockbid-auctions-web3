export type AuctionStatus = "active" | "ended" | "pending" | "finalized";

export interface Auction {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  seller: string;
  startingPrice: number; // in ETH
  highestBid: number;
  highestBidder: string | null;
  endsAt: number; // unix ms
  status: AuctionStatus;
  bidCount: number;
  txHash?: string;
}

export interface Bid {
  id: string;
  auctionId: string;
  bidder: string;
  amount: number;
  timestamp: number;
  txHash: string;
}
