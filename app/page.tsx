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

export default function HomePage() {
  const [query, setQuery] = useState("");
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
        body: JSON.stringify({ query: trimmed }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Server nije uspešno obradio upit.");
      }

      const payload = (await response.json()) as {
        answer: string;
        citations: CitationItem[];
      };

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
        </div>
      </section>
    </main>
  );
}
