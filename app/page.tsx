"use client";

import { useEffect, useMemo, useState } from "react";
import { Gavel, Loader2, MessageSquareText } from "lucide-react";

import { ChatInput } from "@/components/ChatInput";
import { CitationCard, CitationItem } from "@/components/CitationCard";
import { Sidebar } from "@/components/Sidebar";
import { StatsPanel, type DashboardStats } from "@/components/StatsPanel";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type Message = {
  id: string;
  role: ChatRole;
  content: string;
  citations?: CitationItem[];
};

type SurveyDraft = {
  usefulness: "yes" | "partial" | "no";
  sourceRelevance: "yes" | "partial" | "no" | "not_checked";
  clarity: "yes" | "partial" | "no";
  wouldUseAgain: "yes" | "maybe" | "no";
  freeComment: string;
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [lastInteractionId, setLastInteractionId] = useState<string | null>(null);
  const [researchNotice, setResearchNotice] = useState<string | null>(null);
  const [surveyEnabled, setSurveyEnabled] = useState(false);
  const [surveySaved, setSurveySaved] = useState(false);
  const [surveyDraft, setSurveyDraft] = useState<SurveyDraft>({
    usefulness: "partial",
    sourceRelevance: "not_checked",
    clarity: "partial",
    wouldUseAgain: "maybe",
    freeComment: "",
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Dobrodošli u LexVibe. Postavite pravno pitanje i dobićete odgovor zasnovan na vašoj bazi dokumenata.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      try {
        const response = await fetch("/api/stats");
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as DashboardStats;
        if (active) {
          setStats(payload);
        }
      } catch {
        // silent stats failure - do not block chat
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    };
    void loadStats();
    return () => {
      active = false;
    };
  }, []);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  const handleSend = async () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, sessionId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Server nije uspešno obradio upit.");
      }

      const payload = (await response.json()) as {
        answer: string;
        citations: CitationItem[];
        interactionId?: string;
        surveyEnabled?: boolean;
        researchNotice?: string;
      };

      setLastInteractionId(payload.interactionId ?? null);
      setSurveyEnabled(Boolean(payload.surveyEnabled));
      setResearchNotice(payload.researchNotice ?? null);
      setSurveySaved(false);

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer,
          citations: payload.citations,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? `Došlo je do greške: ${error.message}`
              : "Došlo je do neočekivane greške pri komunikaciji sa serverom.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitSurvey = async () => {
    if (!lastInteractionId || surveySaved) {
      return;
    }
    try {
      const response = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionId: lastInteractionId,
          ...surveyDraft,
        }),
      });
      if (!response.ok) {
        return;
      }
      setSurveySaved(true);
    } catch {
      // survey is optional; ignore errors
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl gap-4 p-4 md:p-8">
      <Sidebar />
      <section className="glass-panel flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10">
        <header className="border-b border-white/10 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">LexVibe Legal AI</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-100">
            <Gavel className="h-5 w-5 text-cyan-300" />
            Profesionalni pravni analitički asistent
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Analiza sudske prakse i propisa na osnovu dostupnih izvora, uz transparentne citate.
          </p>
        </header>

        <StatsPanel stats={stats} loading={statsLoading} />

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
              <MessageSquareText className="mb-3 h-9 w-9" />
              <p className="max-w-md text-sm">
                Unesite pravni upit kako biste dobili sažetak sa citatima izvora i procenom relevantnosti.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "rounded-2xl p-4 shadow-lg",
                  message.role === "user"
                    ? "ml-auto max-w-[86%] bg-slate-700/65 text-slate-100"
                    : "mr-auto max-w-[94%] bg-slate-900/65 text-slate-100",
                )}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                {message.role === "assistant" && message.citations && message.citations.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {message.citations.map((citation, index) => (
                      <CitationCard key={`${message.id}-${citation.source}-${index}`} citation={citation} />
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}

          {isLoading ? (
            <div className="mr-auto flex max-w-[94%] items-center gap-2 rounded-2xl bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              Obrada upita u toku...
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 p-4">
          <ChatInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSend}
            isLoading={isLoading}
          />
          {surveyEnabled && lastInteractionId ? (
            <section className="mt-4 rounded-xl border border-white/10 bg-slate-900/55 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Kratka anketa (opciono)</h3>
              {researchNotice ? (
                <p className="mt-2 text-xs text-slate-400">{researchNotice}</p>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs text-slate-300">
                  Korisnost
                  <select
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={surveyDraft.usefulness}
                    onChange={(event) =>
                      setSurveyDraft((prev) => ({
                        ...prev,
                        usefulness: event.target.value as SurveyDraft["usefulness"],
                      }))
                    }
                  >
                    <option value="yes">Da</option>
                    <option value="partial">Delimično</option>
                    <option value="no">Ne</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">
                  Relevantnost izvora
                  <select
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={surveyDraft.sourceRelevance}
                    onChange={(event) =>
                      setSurveyDraft((prev) => ({
                        ...prev,
                        sourceRelevance: event.target.value as SurveyDraft["sourceRelevance"],
                      }))
                    }
                  >
                    <option value="yes">Da</option>
                    <option value="partial">Delimično</option>
                    <option value="no">Ne</option>
                    <option value="not_checked">Nisam proverio/la</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">
                  Jasnoća odgovora
                  <select
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={surveyDraft.clarity}
                    onChange={(event) =>
                      setSurveyDraft((prev) => ({
                        ...prev,
                        clarity: event.target.value as SurveyDraft["clarity"],
                      }))
                    }
                  >
                    <option value="yes">Da</option>
                    <option value="partial">Delimično</option>
                    <option value="no">Ne</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">
                  Koristio/la bih opet
                  <select
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={surveyDraft.wouldUseAgain}
                    onChange={(event) =>
                      setSurveyDraft((prev) => ({
                        ...prev,
                        wouldUseAgain: event.target.value as SurveyDraft["wouldUseAgain"],
                      }))
                    }
                  >
                    <option value="yes">Da</option>
                    <option value="maybe">Možda</option>
                    <option value="no">Ne</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-xs text-slate-300">
                Slobodan komentar
                <textarea
                  className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                  rows={2}
                  value={surveyDraft.freeComment}
                  onChange={(event) =>
                    setSurveyDraft((prev) => ({ ...prev, freeComment: event.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={submitSurvey}
                disabled={surveySaved}
                className="mt-3 rounded-md bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {surveySaved ? "Hvala na povratnoj informaciji" : "Pošalji anketu"}
              </button>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
