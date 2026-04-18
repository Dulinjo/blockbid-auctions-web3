import { useEffect, useState } from "react";

export const useCountdown = (target: number) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { diff, days, hours, minutes, seconds, ended: diff === 0 };
};

export const Countdown = ({ target, compact = false }: { target: number; compact?: boolean }) => {
  const { days, hours, minutes, seconds, ended } = useCountdown(target);

  if (ended) return <span className="text-destructive font-medium">Auction ended</span>;

  if (compact) {
    return (
      <span className="font-mono text-sm">
        {days > 0 && `${days}d `}
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    );
  }

  const Box = ({ v, label }: { v: number; label: string }) => (
    <div className="flex flex-col items-center min-w-[64px]">
      <div className="px-3 py-2.5 rounded-lg bg-secondary/80 border border-border font-mono text-2xl font-bold tabular-nums">
        {String(v).padStart(2, "0")}
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{label}</span>
    </div>
  );

  return (
    <div className="flex gap-2">
      <Box v={days} label="days" />
      <Box v={hours} label="hours" />
      <Box v={minutes} label="min" />
      <Box v={seconds} label="sec" />
    </div>
  );
};
