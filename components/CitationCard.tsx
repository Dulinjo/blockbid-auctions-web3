import { ShieldCheck } from "lucide-react";

export type CitationItem = {
  source: string;
  confidence: number;
  excerpt: string;
  chunk?: number;
};

type CitationCardProps = {
  citation: CitationItem;
};

export function CitationCard({ citation }: CitationCardProps) {
  const { source, confidence, excerpt, chunk } = citation;
  const percent = Math.round(confidence * 100);
  const confidenceTone =
    percent >= 80
      ? "text-emerald-300"
      : percent >= 60
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <article className="rounded-xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-slate-100">{source}</h4>
          {chunk ? <p className="text-xs text-slate-400">Segment #{chunk}</p> : null}
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${confidenceTone}`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {percent}% sigurnost
        </div>
      </div>
      <p className="text-sm text-slate-300">{excerpt || "Nema dostupnog isecka."}</p>
    </article>
  );
}
