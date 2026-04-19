import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Auction } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AuctionStoriesProps {
  auctions: Auction[];
}

const ONE_HOUR = 60 * 60 * 1000;

function statusOf(a: Auction): "ending-soon" | "active" | "ended" {
  if (a.status !== "active") return "ended";
  return a.endsAt - Date.now() < ONE_HOUR ? "ending-soon" : "active";
}

function shortLabel(a: Auction): string {
  const t = a.title?.trim() || `Auction #${a.id}`;
  return t.length > 18 ? t.slice(0, 17) + "…" : t;
}

export function AuctionStories({ auctions }: AuctionStoriesProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Active first, ending-soonest first; then ended (most recently ended first).
  // Cap to keep the strip lean.
  const items = useMemo(() => {
    const active = auctions
      .filter((a) => a.status === "active")
      .sort((a, b) => a.endsAt - b.endsAt);
    const ended = auctions
      .filter((a) => a.status !== "active")
      .sort((a, b) => b.endsAt - a.endsAt);
    return [...active, ...ended].slice(0, 20);
  }, [auctions]);

  if (items.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 480), behavior: "smooth" });
  };

  return (
    <section className="mb-6" aria-label="Quick auction access">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Quick access · Trending
          </h2>
        </div>
        <div className="hidden md:flex gap-1">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((a) => {
          const s = statusOf(a);
          return (
            <Link
              key={a.id}
              to={`/auction/${a.id}`}
              className="group flex flex-col items-center w-[78px] sm:w-[88px] shrink-0 snap-start"
              title={a.title}
            >
              <div
                className={cn(
                  "relative rounded-full p-[2.5px] transition-transform group-hover:scale-105 group-active:scale-95",
                  s === "ending-soon" &&
                    "bg-gradient-to-br from-warning via-primary-glow to-accent shadow-[0_0_18px_hsl(38_95%_60%/0.45)]",
                  s === "active" &&
                    "bg-gradient-to-br from-primary via-primary-glow to-accent shadow-[0_0_14px_hsl(252_95%_65%/0.35)]",
                  s === "ended" && "bg-border/70 opacity-70 group-hover:opacity-100",
                )}
              >
                <div className="rounded-full bg-card p-[2px]">
                  <div className="relative h-[64px] w-[64px] sm:h-[72px] sm:w-[72px] overflow-hidden rounded-full bg-muted">
                    <img
                      src={a.image}
                      alt={a.title}
                      loading="lazy"
                      className={cn(
                        "h-full w-full object-cover",
                        s === "ended" && "grayscale-[40%]",
                      )}
                    />
                    {s === "ending-soon" && (
                      <span
                        className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-warning ring-2 ring-card"
                        aria-label="Ending soon"
                      />
                    )}
                    {s === "active" && (
                      <span
                        className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success ring-2 ring-card"
                        aria-label="Active"
                      />
                    )}
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "mt-2 text-[11px] sm:text-xs text-center leading-tight max-w-full truncate",
                  s === "ended" ? "text-muted-foreground" : "text-foreground/90",
                )}
              >
                {shortLabel(a)}
              </span>
              {s === "ending-soon" && (
                <span className="mt-0.5 text-[10px] font-medium text-warning">
                  Ending soon
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
