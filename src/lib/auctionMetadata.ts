/**
 * Off-chain auction metadata store.
 *
 * The smart contract only stores: id, seller, title, startingBid, highestBid,
 * highestBidder, endTime, ended. Anything else (image, description, category)
 * is kept off-chain and keyed by the on-chain auction ID, which is the
 * source of truth.
 *
 * Backed by localStorage for prototype mode. The exported functions form a
 * tiny adapter so this can later be swapped for Supabase / a real backend
 * without touching call sites.
 */

const STORAGE_KEY = "blockbid_auction_metadata_v1";

export type AuctionImageSourceType = "upload" | "ai";

export interface AuctionMetadata {
  auctionId: number;
  imageUrl: string | null; // data URL (uploads) or remote URL (AI)
  sourceType: AuctionImageSourceType | null;
  title?: string;
  description?: string;
  category?: string;
  prompt?: string;
  fileName?: string;
  createdAt: number; // ms
}

type Store = Record<string, AuctionMetadata>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    // localStorage quota exceeded (likely a large data URL). Surface a
    // warning so devs notice during demo, but do not crash the flow.
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] failed to persist", e);
  }
}

export function getAuctionMetadata(auctionId: number): AuctionMetadata | null {
  if (!Number.isInteger(auctionId) || auctionId <= 0) return null;
  const store = read();
  return store[String(auctionId)] ?? null;
}

export function getAllAuctionMetadata(): Record<number, AuctionMetadata> {
  const store = read();
  const out: Record<number, AuctionMetadata> = {};
  for (const k of Object.keys(store)) {
    const id = Number(k);
    if (Number.isInteger(id) && id > 0) out[id] = store[k];
  }
  return out;
}

export function saveAuctionMetadata(meta: AuctionMetadata): void {
  if (!Number.isInteger(meta.auctionId) || meta.auctionId <= 0) {
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] refusing to save with invalid id", meta);
    return;
  }
  const store = read();
  store[String(meta.auctionId)] = meta;
  write(store);
  // eslint-disable-next-line no-console
  console.info("[auctionMetadata] saved", {
    auctionId: meta.auctionId,
    sourceType: meta.sourceType,
    hasImage: Boolean(meta.imageUrl),
  });
}

export function removeAuctionMetadata(auctionId: number): void {
  const store = read();
  delete store[String(auctionId)];
  write(store);
}
