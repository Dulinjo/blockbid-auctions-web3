"use client";

import { FileText, Scale, ShieldCheck } from "lucide-react";

const docs = [
  "Zakon o obligacionim odnosima",
  "Zakon o radu",
  "Zakonik o krivicnom postupku",
];

export function Sidebar() {
  return (
    <aside className="glass-panel hidden w-72 flex-col justify-between rounded-2xl p-6 lg:flex">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">
            LexVibe
          </p>
          <h2 className="text-2xl font-semibold text-white">Pravna baza znanja</h2>
          <p className="text-sm text-slate-300/80">
            RAG pretraga srpskih pravnih dokumenata uz transparentne izvore i
            procenu pouzdanosti odgovora.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/60">
            Aktivni izvori
          </p>
          <ul className="space-y-2 text-sm text-slate-200/90">
            {docs.map((doc) => (
              <li
                key={doc}
                className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-900/50 px-3 py-2"
              >
                <FileText className="h-4 w-4 text-cyan-300" />
                <span>{doc}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4 border-t border-white/10 pt-5 text-xs text-slate-300/80">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <span>Odgovori su informativni i nisu zamena za pravni savet.</span>
        </div>
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-cyan-300" />
          <span>Profesionalni pravni ton na srpskom jeziku.</span>
        </div>
      </div>
    </aside>
  );
}
