import { getAllAuctions, getAuctionCount, getReadProvider, OnChainAuction, EXPECTED_NETWORK_NAME, EXPECTED_CHAIN_ID } from "./contract";

export interface ContractStats {
  totalAuctions: number;
  activeAuctions: number;
  endedAuctions: number;
  endingSoon: number; // active auctions ending within ENDING_SOON_MS
  finalizedAuctions: number; // ended === true on-chain
  latestBlock: number | null;
  health: "healthy" | "degraded" | "down";
  network: string;
  chainId: number;
  auctions: OnChainAuction[];
}

export const ENDING_SOON_MS = 60 * 60 * 1000; // 1 hour

export async function getContractStats(): Promise<ContractStats> {
  const now = Date.now();
  let auctions: OnChainAuction[] = [];
  let totalAuctions = 0;
  let latestBlock: number | null = null;
  let health: ContractStats["health"] = "down";

  try {
    const [list, count, block] = await Promise.all([
      getAllAuctions(),
      getAuctionCount(),
      getReadProvider().getBlockNumber().catch(() => null),
    ]);
    auctions = list;
    totalAuctions = count;
    latestBlock = block;
    health = "healthy";
  } catch {
    try {
      // Soft fallback: try only the count to detect partial health.
      totalAuctions = await getAuctionCount();
      health = "degraded";
    } catch {
      health = "down";
    }
  }

  const activeAuctions = auctions.filter((a) => a.active).length;
  const finalizedAuctions = auctions.filter((a) => a.ended).length;
  const endedAuctions = auctions.filter((a) => !a.active).length;
  const endingSoon = auctions.filter(
    (a) => a.active && a.endsAtMs - now <= ENDING_SOON_MS
  ).length;

  return {
    totalAuctions,
    activeAuctions,
    endedAuctions,
    endingSoon,
    finalizedAuctions,
    latestBlock,
    health,
    network: EXPECTED_NETWORK_NAME,
    chainId: EXPECTED_CHAIN_ID,
    auctions,
  };
}
