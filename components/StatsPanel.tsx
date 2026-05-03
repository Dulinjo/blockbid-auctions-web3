"use client";

import { BarChart3, Building2, FileStack, Scale } from "lucide-react";

type TopCourt = {
  court: string;
  count: number;
};

export type DashboardStats = {
  total_decisions: number;
  total_chunks: number;
  total_courts: number;
  top_courts: TopCourt[];
  total_law_gazette_items: number;
};

const EMPTY_STATS: DashboardStats = {
  total_decisions: 0,
  total_chunks: 0,
  total_courts: 0,
  top_courts: [],
  total_law_gazette_items: 0,
};

type StatsPanelProps = {
  stats: DashboardStats | null;
  loading: boolean;
};

export function StatsPanel({ stats, loading }: StatsPanelProps) {
  const snapshot = stats ?? EMPTY_STATS;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Sudske odluke</p>
          <FileStack className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">
          {loading ? "..." : snapshot.total_decisions}
        </p>
      </article>

      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Ukupno chunk-ova</p>
          <BarChart3 className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">
          {loading ? "..." : snapshot.total_chunks}
        </p>
      </article>

      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Jedinstveni sudovi</p>
          <Building2 className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">
          {loading ? "..." : snapshot.total_courts}
        </p>
      </article>

      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Top sud</p>
          <Scale className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-sm font-semibold text-white">
          {loading
            ? "..."
            : snapshot.top_courts[0]
              ? `${snapshot.top_courts[0].court} (${snapshot.top_courts[0].count})`
              : "Nema podataka"}
        </p>
      </article>
    </section>
  );
}
