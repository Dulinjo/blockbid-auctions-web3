import { useCallback, useRef, useState } from "react";
import { Upload, Sparkles, X, RefreshCw, ImageIcon, Loader2, AlertCircle, Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type AuctionImageSource = "upload" | "ai" | "none";

export interface AuctionImageState {
  source: AuctionImageSource;
  /** Data URL or remote URL used for preview + off-chain metadata */
  url: string | null;
  /** Original filename when source === "upload" */
  fileName?: string;
  /** Prompt used when source === "ai" */
  prompt?: string;
}

interface Props {
  value: AuctionImageState;
  onChange: (next: AuctionImageState) => void;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const BUCKET = "auction-images";

/** Upload a file to the public auction-images bucket and return its public URL. */
async function uploadToBucket(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const SAMPLE_PROMPTS = [
  "Futuristic crystal artwork, neon glow",
  "Vintage watch on velvet background",
  "Rare digital collectible card, holographic",
];

/**
 * Mock AI image generator. Returns a deterministic-but-varied placeholder
 * URL based on the prompt so the demo feels interactive.
 *
 * Swap this for a real call to a Supabase edge function calling
 * Lovable AI (google/gemini-2.5-flash-image) when Cloud is enabled.
 */
async function mockGenerateImage(prompt: string): Promise<string> {
  // Simulate latency
  await new Promise((r) => setTimeout(r, 1400));
  const seed = encodeURIComponent(prompt.trim().slice(0, 64) || "auction");
  // picsum supports deterministic seeded images, perfect for a demo.
  return `https://picsum.photos/seed/${seed}/800/800`;
}

export function AuctionImageInput({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);

  const validateAndRead = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPTED.includes(file.type)) {
        setError("Unsupported file type. Use PNG, JPG, WEBP or GIF.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("File too large. Max size is 5 MB.");
        return;
      }
      // Show instant local preview while we upload to Cloud.
      const reader = new FileReader();
      reader.onload = () => {
        onChange({
          source: "upload",
          url: String(reader.result),
          fileName: file.name,
        });
      };
      reader.onerror = () => setError("Could not read file.");
      reader.readAsDataURL(file);

      try {
        const publicUrl = await uploadToBucket(file);
        onChange({
          source: "upload",
          url: publicUrl,
          fileName: file.name,
        });
        toast.success("Image uploaded");
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[AuctionImageInput] cloud upload failed", e);
        setError("Could not upload image. Please try again.");
        toast.error("Image upload failed");
      }
    },
    [onChange]
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) validateAndRead(f);
    e.target.value = ""; // allow re-pick of same file
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) validateAndRead(f);
  };

  const remove = () => {
    onChange({ source: "none", url: null });
    setError(null);
  };

  const generate = async (prompt?: string) => {
    const p = (prompt ?? aiPrompt).trim();
    if (!p) {
      toast.error("Enter a prompt first");
      return;
    }
    setAiLoading(true);
    try {
      const url = await mockGenerateImage(p);
      setAiPreview(url);
    } catch {
      toast.error("Generation failed. Try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAi = () => {
    if (!aiPreview) return;
    onChange({ source: "ai", url: aiPreview, prompt: aiPrompt.trim() });
    setAiOpen(false);
    setAiPreview(null);
    setAiPrompt("");
    toast.success("AI image attached");
  };

  const hasImage = value.source !== "none" && value.url;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <Label>Item image</Label>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
          Off-chain
        </span>
      </div>

      {/* Drop / preview area */}
      <div
        onClick={() => !hasImage && fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!hasImage) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "relative aspect-square rounded-xl overflow-hidden border-2 border-dashed transition-all",
          hasImage
            ? "border-border"
            : dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-background/40 hover:border-primary/40 cursor-pointer",
        ].join(" ")}
      >
        {hasImage ? (
          <>
            <img
              src={value.url!}
              alt={value.prompt || value.fileName || "Auction item"}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute top-2 left-2 flex gap-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-background/80 backdrop-blur border border-border text-foreground">
                {value.source === "ai" ? "AI generated" : "Uploaded"}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove();
              }}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-destructive/20 hover:border-destructive/40 transition-colors"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <ImageIcon className="h-5 w-5 text-primary-glow" />
            </div>
            <p className="text-sm font-medium">
              {dragOver ? "Drop to upload" : "Drop image or click"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              PNG, JPG, WEBP · max 5 MB
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={onPick}
        className="hidden"
      />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="w-full"
        >
          {hasImage && value.source === "upload" ? (
            <>
              <Replace className="h-3.5 w-3.5" /> Replace
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" /> Upload
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAiOpen(true)}
          className="w-full border-primary/30 text-primary-glow hover:bg-primary/10"
        >
          <Sparkles className="h-3.5 w-3.5" /> Generate
        </Button>
      </div>

      {hasImage && value.source === "upload" && value.fileName && (
        <p className="text-[11px] text-muted-foreground mt-2 truncate">
          {value.fileName}
        </p>
      )}
      {hasImage && value.source === "ai" && value.prompt && (
        <p className="text-[11px] text-muted-foreground mt-2 truncate italic">
          “{value.prompt}”
        </p>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Images are stored off-chain and used only for marketplace display.
      </p>

      {/* AI Generation Dialog */}
      <Dialog
        open={aiOpen}
        onOpenChange={(o) => {
          setAiOpen(o);
          if (!o) {
            setAiPreview(null);
            setAiPrompt("");
          }
        }}
      >
        <DialogContent className="bg-gradient-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-glow" /> Generate item image
            </DialogTitle>
            <DialogDescription>
              Describe your item. A demo image will be generated for the auction listing (off-chain).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="ai-prompt">Prompt</Label>
              <Input
                id="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="A futuristic crystal artwork, neon glow"
                className="mt-1.5 bg-background/60"
                disabled={aiLoading}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SAMPLE_PROMPTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAiPrompt(s)}
                    disabled={aiLoading}
                    className="text-[11px] px-2 py-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="aspect-square rounded-xl overflow-hidden border border-border bg-background/40 relative">
              {aiLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground mt-3">Generating…</p>
                </div>
              )}
              {aiPreview ? (
                <img src={aiPreview} alt="Generated preview" className="h-full w-full object-cover" />
              ) : !aiLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <Sparkles className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">Preview will appear here</p>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              {!aiPreview ? (
                <Button
                  type="button"
                  onClick={() => generate()}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="flex-1 bg-gradient-primary text-primary-foreground"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generate
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => generate()}
                    disabled={aiLoading}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4" /> Regenerate
                  </Button>
                  <Button
                    type="button"
                    onClick={acceptAi}
                    className="flex-1 bg-gradient-primary text-primary-foreground"
                  >
                    Use this image
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
