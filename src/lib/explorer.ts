// Helpers for building Sepolia Etherscan deep links so the UI can consistently
// expose blockchain access from any page (auction detail, footer, toasts, etc.).
import { CONTRACT_ADDRESS } from "@/lib/contract";

export const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

export const contractUrl = (address: string = CONTRACT_ADDRESS) =>
  `${ETHERSCAN_BASE}/address/${address}`;

export const txUrl = (txHash: string) => `${ETHERSCAN_BASE}/tx/${txHash}`;

export const addressUrl = (address: string) => `${ETHERSCAN_BASE}/address/${address}`;
