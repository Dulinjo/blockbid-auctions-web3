import { AuctionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<AuctionStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  ended: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/15 text-warning border-warning/30",
  finalized: "bg-primary/15 text-primary border-primary/30",
};

const dot: Record<AuctionStatus, string> = {
  active: "bg-success animate-pulse-glow",
  ended: "bg-muted-foreground",
  pending: "bg-warning",
  finalized: "bg-primary",
};

export const StatusBadge = ({ status, className }: { status: AuctionStatus; className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
      styles[status],
      className
    )}
  >
    <span className={cn("h-1.5 w-1.5 rounded-full", dot[status])} />
    {status}
  </span>
);
