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
const BUCKET = "auction-images";

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

function readLegacyStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64] = dataUrl.split(",");
    if (!header || !base64) return null;
    const mime = header.match(/^data:(.*?);base64$/)?.[1] ?? "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function inferImageExtension(dataUrl: string, fileName?: string) {
  const fromName = fileName?.split(".").pop()?.toLowerCase();
  if (fromName) return fromName === "jpeg" ? "jpg" : fromName;
  const mime = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/)?.[1]?.toLowerCase();
  if (!mime) return "png";
  if (mime === "jpeg") return "jpg";
  if (mime === "svg+xml") return "svg";
  return mime;
}

async function uploadRecoveredImage(auctionId: number, imageUrl: string, fileName?: string) {
  const blob = dataUrlToBlob(imageUrl);
  if (!blob) return null;
  const ext = inferImageExtension(imageUrl, fileName);
  const path = `uploads/recovered-${auctionId}-${Date.now()}.${ext}`;
  const file = new File([blob], fileName ?? `auction-${auctionId}.${ext}`, {
    type: blob.type || `image/${ext}`,
  });
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function repairMissingCloudImages(rows: any[]) {
  if (typeof window === "undefined" || rows.length === 0) return rows;
  const local = { ...readLegacyStore(), ...read() };
  for (const row of rows) {
    if (row.image_url || row.source_type !== "upload") continue;
    const localMeta = local[String(row.auction_id)];
    const localImage = localMeta?.imageUrl;
    if (!localImage || !localImage.startsWith("data:")) continue;
    try {
      const publicUrl = await uploadRecoveredImage(Number(row.auction_id), localImage, localMeta.fileName);
      if (!publicUrl) continue;
      const { error } = await supabase.from("auction_metadata").upsert(
        {
          auction_id: Number(row.auction_id),
          image_url: publicUrl,
          source_type: row.source_type ?? localMeta.sourceType ?? "upload",
          title: row.title ?? localMeta.title ?? null,
          description: row.description ?? localMeta.description ?? null,
          category: row.category ?? localMeta.category ?? null,
          prompt: row.prompt ?? localMeta.prompt ?? null,
          file_name: row.file_name ?? localMeta.fileName ?? null,
        },
        { onConflict: "auction_id" }
      );
      if (error) throw error;
      row.image_url = publicUrl;
      row.file_name = row.file_name ?? localMeta.fileName ?? null;
      console.info("[auctionMetadata] repaired missing cloud image", { auctionId: row.auction_id });
    } catch (e) {
      console.warn("[auctionMetadata] failed to repair cloud image", { auctionId: row.auction_id, error: e });
    }
  }
  return rows;
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
    // One-time migration: push any legacy localStorage entries (data URLs
    // from before Cloud was enabled) to the cloud table so other devices
    // and guests can see them too.
    await migrateLegacyLocalEntries();

    const { data, error } = await supabase
      .from("auction_metadata")
      .select("*");
    if (error) throw error;
    const rows = await repairMissingCloudImages(data ?? []);
    const next: Store = {};
    for (const row of rows) {
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

const LEGACY_KEY = "blockbid_auction_metadata_v1";
const MIGRATION_FLAG = "blockbid_auction_metadata_migrated_v1";

async function migrateLegacyLocalEntries() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG)) return;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }
    const parsed = JSON.parse(raw) as Store;
    const rows = Object.values(parsed)
      .filter((m) => m && Number.isInteger(m.auctionId) && m.auctionId > 0)
      .map((m) => ({
        auction_id: m.auctionId,
        // We intentionally drop massive data: URLs that won't fit in a
        // text column comfortably. Remote URLs (AI / Cloud) are kept.
        image_url:
          m.imageUrl && !m.imageUrl.startsWith("data:") ? m.imageUrl : null,
        source_type: m.sourceType ?? null,
        title: m.title ?? null,
        description: m.description ?? null,
        category: m.category ?? null,
        prompt: m.prompt ?? null,
        file_name: m.fileName ?? null,
      }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("auction_metadata")
        .upsert(rows, { onConflict: "auction_id" });
      if (error) throw error;
      // eslint-disable-next-line no-console
      console.info("[auctionMetadata] migrated", rows.length, "legacy entries to Cloud");
    }
    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[auctionMetadata] legacy migration failed", e);
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
    const [row] = await repairMissingCloudImages([data]);
    const meta = fromRow(row);
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
