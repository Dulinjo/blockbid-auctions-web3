import { Auction, Bid } from "./types";
import a1 from "@/assets/auction-1.jpg";
import a2 from "@/assets/auction-2.jpg";
import a3 from "@/assets/auction-3.jpg";
import a4 from "@/assets/auction-4.jpg";
import a5 from "@/assets/auction-5.jpg";
import a6 from "@/assets/auction-6.jpg";

const now = Date.now();
const hours = (n: number) => n * 60 * 60 * 1000;
const days = (n: number) => n * 24 * 60 * 60 * 1000;

export const mockAuctions: Auction[] = [
  {
    id: "0x01",
    title: "Iridescent Crystal Genesis #001",
    description: "A one-of-a-kind generative crystal sculpture minted on-chain. Holographic refraction shifts with viewer angle. The genesis piece of the Crystalline collection.",
    category: "Digital Art",
    image: a1,
    seller: "0x7Ab3...91Df",
    startingPrice: 0.5,
    highestBid: 2.45,
    highestBidder: "0x9Cd2...3FaE",
    endsAt: now + hours(8),
    status: "active",
    bidCount: 14,
    txHash: "0xa1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01",
  },
  {
    id: "0x02",
    title: "Vintage Chronograph — 1968",
    description: "Authenticated rare mechanical chronograph with rose-gold case. Provenance certificate stored on IPFS. Includes original box.",
    category: "Collectibles",
    image: a2,
    seller: "0x4De1...77Ac",
    startingPrice: 1.2,
    highestBid: 3.88,
    highestBidder: "0xBe44...12Ef",
    endsAt: now + hours(2),
    status: "active",
    bidCount: 22,
    txHash: "0xb2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123",
  },
  {
    id: "0x03",
    title: "Neon Specter — AI Portrait",
    description: "Limited edition cyberpunk portrait. 1/1 NFT with embedded provenance metadata. Created by acclaimed digital artist v0id.",
    category: "Digital Art",
    image: a3,
    seller: "0x2Bc8...44Ee",
    startingPrice: 0.25,
    highestBid: 0.92,
    highestBidder: "0x7Ab3...91Df",
    endsAt: now + days(3),
    status: "active",
    bidCount: 8,
    txHash: "0xc3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef012345",
  },
  {
    id: "0x04",
    title: "Holographic Runners — Edition 03",
    description: "Limited drop physical sneakers paired with digital twin NFT. Authenticated by manufacturer signature on-chain.",
    category: "Fashion",
    image: a4,
    seller: "0x9Cd2...3FaE",
    startingPrice: 0.8,
    highestBid: 1.55,
    highestBidder: "0x4De1...77Ac",
    endsAt: now + hours(18),
    status: "active",
    bidCount: 11,
    txHash: "0xd4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01234567",
  },
  {
    id: "0x05",
    title: "Voxel Cube #042",
    description: "Procedurally generated voxel sculpture from the Cubist Collective. Each cube is computed from on-chain entropy.",
    category: "Digital Art",
    image: a5,
    seller: "0xBe44...12Ef",
    startingPrice: 0.3,
    highestBid: 1.1,
    highestBidder: null,
    endsAt: now - hours(4),
    status: "ended",
    bidCount: 19,
    txHash: "0xe5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789",
  },
  {
    id: "0x06",
    title: "Iconic Comics — Issue 239",
    description: "Mint-condition vintage comic book with on-chain authenticity certificate. Sealed and graded 9.8.",
    category: "Collectibles",
    image: a6,
    seller: "0x7Ab3...91Df",
    startingPrice: 2.0,
    highestBid: 5.6,
    highestBidder: "0x2Bc8...44Ee",
    endsAt: now + days(1) + hours(6),
    status: "active",
    bidCount: 27,
    txHash: "0xf6789012345678abcdef0123456789abcdef0123456789abcdef0123456789ab",
  },
];

export const mockBids: Record<string, Bid[]> = {
  "0x01": [
    { id: "b1", auctionId: "0x01", bidder: "0x9Cd2...3FaE", amount: 2.45, timestamp: now - hours(1), txHash: "0xaa11..." },
    { id: "b2", auctionId: "0x01", bidder: "0x4De1...77Ac", amount: 2.2, timestamp: now - hours(3), txHash: "0xaa12..." },
    { id: "b3", auctionId: "0x01", bidder: "0xBe44...12Ef", amount: 1.8, timestamp: now - hours(6), txHash: "0xaa13..." },
    { id: "b4", auctionId: "0x01", bidder: "0x2Bc8...44Ee", amount: 1.2, timestamp: now - hours(12), txHash: "0xaa14..." },
  ],
};

export const CONTRACT_INFO = {
  address: "0xBLOCK1d5a2C4F8E9b7A1c3D6e5F8a9B0c2D4e6F8A0",
  network: "Sepolia Testnet",
  chainId: 11155111,
  deployedAt: "2025-01-12",
  version: "1.0.0",
};
