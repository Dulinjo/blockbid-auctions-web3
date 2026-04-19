import { Link } from "react-router-dom";
import { Auction } from "@/lib/types";
import { Countdown } from "./Countdown";
import { StatusBadge } from "./StatusBadge";
import { Clock, Gavel } from "lucide-react";
import placeholder from "@/assets/auction-1.jpg";

export const AuctionCard = ({ auction }: { auction: Auction }) => {
  const hasBid = auction.highestBid > 0;
  const imgSrc = auction.image && auction.image.length > 0 ? auction.image : placeholder;

  return (
    <Link
      to={`/auction/${auction.id}`}
      className="group relative rounded-2xl bg-gradient-card border border-border hover:border-primary/40 transition-all duration-300 overflow-hidden hover:shadow-[0_20px_60px_-15px_hsl(252_95%_65%/0.25)] hover:-translate-y-1 flex flex-col"
    >
      <div className="relative w-full aspect-square overflow-hidden bg-muted">
        <img
          src={imgSrc}
          alt={auction.title}
          loading="lazy"
          decoding="async"
          width={800}
          height={800}
          onError={(e) => {
            const t = e.currentTarget;
            if (t.src !== window.location.origin + placeholder && !t.src.endsWith(placeholder)) {
              t.src = placeholder;
            }
          }}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-3 left-3">
          <StatusBadge status={auction.status} />
        </div>
        <div className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur px-2.5 py-1 text-[11px] font-mono max-w-[55%] truncate">
          {auction.category}
        </div>
      </div>

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight line-clamp-2 group-hover:text-primary-glow transition-colors">
            {auction.title}
          </h3>
          <p className="text-xs text-muted-foreground font-mono mt-1 truncate">by {auction.seller}</p>
        </div>

        {/* Price block: stack vertically by default for clarity on mobile,
            switch to two-column grid on >=sm to keep desktop density. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/60">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Starting price
            </div>
            <div className="font-mono text-base sm:text-sm font-semibold mt-0.5 truncate">
              {auction.startingPrice} ETH
            </div>
          </div>
          <div className="min-w-0 sm:text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {hasBid ? "Current bid" : "No bids yet"}
            </div>
            <div className="font-mono text-lg font-bold text-gradient-primary mt-0.5 truncate">
              {hasBid ? `${auction.highestBid} ETH` : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-border/60">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Ends in
            </div>
            <Countdown target={auction.endsAt} compact />
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
              <Gavel className="h-3 w-3" /> {auction.bidCount}
            </div>
            <span className="font-mono text-[10px] opacity-60">{auction.id}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};
