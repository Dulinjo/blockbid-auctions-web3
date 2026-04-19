/**
 * Off-chain auction metadata store.
 *
 * The smart contract only stores: id, seller, title, startingBid, highestBid,
 * highestBidder, endTime, ended. Anything else (image, description, category)
 * is kept off-chain and keyed by the on-chain auction ID, which is the
 * source of truth.
 *
 * Backed by Lovable Cloud (Postgres `auction_metadata` table) so uploaded
 * images are visible to every visitor — mobile, guests, and shared links —
 * not only to the wallet that created the auction.
 *
 * A small in-memory + localStorage cache keeps the synchronous getters
 * (`getAuctionMetadata`, `getAllAuctionMetadata`) instant for existing
 * call sites while the next `refreshAuctionMetadata()` pulls fresh data
 * from Cloud.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "blockbid_auction_metadata_v2";

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

let memCache: Store | null = null;

function read(): Store {
  if (memCache) return memCache;
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memCache = {};
      return memCache;
    }
    const parsed = JSON.parse(raw);
    memCache = parsed && typeof parsed === "object" ? (parsed as Store) : {};
    return memCache;
  } catch {
    memCache = {};
    return memCache;
  }
}

function write(store: Store) {
  memCache = store;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    // Cache failure is non-fatal — Cloud is the source of truth now.
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] failed to persist cache", e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): AuctionMetadata {
  return {
    auctionId: Number(row.auction_id),
    imageUrl: row.image_url ?? null,
    sourceType: (row.source_type as AuctionImageSourceType | null) ?? null,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    prompt: row.prompt ?? undefined,
    fileName: row.file_name ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
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

/**
 * Refresh the local cache from Cloud. Call once on app/page load so guests
 * (no wallet) and other browsers see images uploaded by other users.
 */
export async function refreshAuctionMetadata(): Promise<Record<number, AuctionMetadata>> {
  try {
    const { data, error } = await supabase
      .from("auction_metadata")
      .select("*");
    if (error) throw error;
    const next: Store = {};
    for (const row of data ?? []) {
      const m = fromRow(row);
      if (Number.isInteger(m.auctionId) && m.auctionId > 0) {
        next[String(m.auctionId)] = m;
      }
    }
    write(next);
    return getAllAuctionMetadata();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] refresh failed, using cached data", e);
    return getAllAuctionMetadata();
  }
}

/**
 * Fetch a single auction's metadata directly from Cloud (bypasses cache).
 * Used by AuctionDetails so a freshly created auction is visible even
 * before the marketplace cache has caught up.
 */
export async function fetchAuctionMetadata(auctionId: number): Promise<AuctionMetadata | null> {
  if (!Number.isInteger(auctionId) || auctionId <= 0) return null;
  try {
    const { data, error } = await supabase
      .from("auction_metadata")
      .select("*")
      .eq("auction_id", auctionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return getAuctionMetadata(auctionId);
    const meta = fromRow(data);
    const store = read();
    store[String(meta.auctionId)] = meta;
    write(store);
    return meta;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] fetch failed, falling back to cache", e);
    return getAuctionMetadata(auctionId);
  }
}

export async function saveAuctionMetadata(meta: AuctionMetadata): Promise<void> {
  if (!Number.isInteger(meta.auctionId) || meta.auctionId <= 0) {
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] refusing to save with invalid id", meta);
    return;
  }
  // Optimistic local cache update so the success screen / detail page is
  // instant even before the Cloud round-trip completes.
  const store = read();
  store[String(meta.auctionId)] = meta;
  write(store);

  try {
    const { error } = await supabase
      .from("auction_metadata")
      .upsert(
        {
          auction_id: meta.auctionId,
          image_url: meta.imageUrl,
          source_type: meta.sourceType,
          title: meta.title ?? null,
          description: meta.description ?? null,
          category: meta.category ?? null,
          prompt: meta.prompt ?? null,
          file_name: meta.fileName ?? null,
        },
        { onConflict: "auction_id" }
      );
    if (error) throw error;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auctionMetadata] cloud upsert failed", e);
  }

  // eslint-disable-next-line no-console
  console.info("[auctionMetadata] saved", {
    auctionId: meta.auctionId,
    sourceType: meta.sourceType,
    hasImage: Boolean(meta.imageUrl),
  });
}

export async function removeAuctionMetadata(auctionId: number): Promise<void> {
  const store = read();
  delete store[String(auctionId)];
  write(store);
  try {
    await supabase.from("auction_metadata").delete().eq("auction_id", auctionId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] cloud delete failed", e);
  }
}
