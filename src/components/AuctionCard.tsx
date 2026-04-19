import { Link } from "react-router-dom";
import { Auction } from "@/lib/types";
import { Countdown } from "./Countdown";
import { StatusBadge } from "./StatusBadge";
import { Clock, Gavel } from "lucide-react";

export const AuctionCard = ({ auction }: { auction: Auction }) => (
  <Link
    to={`/auction/${auction.id}`}
    className="group relative rounded-2xl bg-gradient-card border border-border hover:border-primary/40 transition-all duration-300 overflow-hidden hover:shadow-[0_20px_60px_-15px_hsl(252_95%_65%/0.25)] hover:-translate-y-1"
  >
    <div className="aspect-square overflow-hidden bg-muted relative">
      <img
        src={auction.image}
        alt={auction.title}
        loading="lazy"
        width={800}
        height={800}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute top-3 left-3">
        <StatusBadge status={auction.status} />
      </div>
      <div className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur px-2.5 py-1 text-[11px] font-mono">
        {auction.category}
      </div>
    </div>
    <div className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold leading-tight line-clamp-1 group-hover:text-primary-glow transition-colors">
          {auction.title}
        </h3>
        <p className="text-xs text-muted-foreground font-mono mt-1">by {auction.seller}</p>
      </div>

      <div className="flex flex-col gap-3 pt-2 border-t border-border/60 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {auction.highestBid > 0 ? "Current bid" : "Starting price"}
          </div>
          <div className="font-mono text-lg font-bold text-gradient-primary truncate">
            {auction.highestBid > 0 ? auction.highestBid : auction.startingPrice} ETH
          </div>
          {auction.highestBid > 0 && (
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              start {auction.startingPrice} ETH
            </div>
          )}
        </div>
        <div className="sm:text-right min-w-0">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:justify-end">
            <Clock className="h-3 w-3" /> Ends in
          </div>
          <Countdown target={auction.endsAt} compact />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <Gavel className="h-3 w-3" /> {auction.bidCount} bids
        </span>
        <span className="font-mono opacity-60">{auction.id}</span>
      </div>
    </div>
  </Link>
);
