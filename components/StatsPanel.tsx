"use client";

import { useEffect, useState } from "react";
import { BarChart3, Building2, FileStack, Scale } from "lucide-react";

type TopCourt = {
  name: string;
  count: number;
};

type StatsPayload = {
  total_documents: number;
  total_chunks: number;
  unique_courts: number;
  top_courts: TopCourt[];
};

const EMPTY_STATS: StatsPayload = {
  total_documents: 0,
  total_chunks: 0,
  unique_courts: 0,
  top_courts: [],
};

export function StatsPanel() {
  const [stats, setStats] = useState<StatsPayload>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadStats = async () => {
      try {
        const response = await fetch("/api/stats");
        if (!response.ok) {
          throw new Error("Ne mogu da učitam metrike.");
        }
        const payload = (await response.json()) as StatsPayload;
        if (mounted) {
          setStats(payload);
          setError(null);
        }
      } catch (statsError) {
        if (mounted) {
          setError(statsError instanceof Error ? statsError.message : "Greška pri učitavanju metrika.");
        }
      }
    };

    void loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Sudske odluke</p>
          <FileStack className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">{stats.total_documents}</p>
      </article>

      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Ukupno chunk-ova</p>
          <BarChart3 className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">{stats.total_chunks}</p>
      </article>

      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Jedinstveni sudovi</p>
          <Building2 className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-white">{stats.unique_courts}</p>
      </article>

      <article className="glass-panel rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between text-slate-300">
          <p className="text-xs uppercase tracking-[0.2em]">Top sud</p>
          <Scale className="h-4 w-4 text-cyan-300" />
        </div>
        <p className="mt-3 text-sm font-semibold text-white">
          {stats.top_courts[0] ? `${stats.top_courts[0].name} (${stats.top_courts[0].count})` : "Nema podataka"}
        </p>
      </article>

      {error ? (
        <p className="md:col-span-2 xl:col-span-4 text-xs text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}
