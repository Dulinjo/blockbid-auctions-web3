"use client";

import { useMemo, useState } from "react";
import { Gavel, Loader2, MessageSquareText } from "lucide-react";

import { ChatInput } from "@/components/ChatInput";
import { CitationCard, CitationItem } from "@/components/CitationCard";
import { ResearchSurveyModal } from "@/components/ResearchSurveyModal";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type Message = {
  id: string;
  role: ChatRole;
  content: string;
  citations?: CitationItem[];
};

type QuickAction = {
  id: string;
  label: string;
  query: string;
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [sessionId, setSessionId] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : `session-${Date.now()}`,
  );
  const [lastInteractionId, setLastInteractionId] = useState<string | null>(null);
  const [researchNotice, setResearchNotice] = useState<string | null>(null);
  const [surveyEnabled, setSurveyEnabled] = useState(false);
  const [surveyRequired, setSurveyRequired] = useState(false);
  const [surveyModalOpen, setSurveyModalOpen] = useState(false);
  const [questionsRemaining, setQuestionsRemaining] = useState<number | null>(null);
  const [surveyTitle, setSurveyTitle] = useState("Anketa za evaluaciju AI agenta za pristup pravdi");
  const [surveyIntro, setSurveyIntro] = useState("");
  const [surveyDisclaimer, setSurveyDisclaimer] = useState("");
  const [surveySuccessMessage, setSurveySuccessMessage] = useState<string | null>(null);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [latestUserQuery, setLatestUserQuery] = useState("");
  const [latestAssistantAnswer, setLatestAssistantAnswer] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Dobrodošli u LexVibe Legal AI.\n\nLexVibe je istraživački prototip za pravnu orijentaciju i pristup pravdi. Opišite problem običnim jezikom, a agent će vas usmeriti ka sledećem koraku, relevantnom propisu, instituciji ili servisu.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const quickActions: QuickAction[] = [
    { id: "qa-analyze", label: "Analiziraj situaciju", query: "Analiziraj moju pravnu situaciju." },
    { id: "qa-reg", label: "Pronađi propis", query: "Pronađi relevantan propis za ovo pitanje." },
    { id: "qa-case", label: "Pronađi praksu", query: "Pronađi sličnu sudsku praksu za ovu situaciju." },
    { id: "qa-status", label: "Gde mogu da proverim?", query: "Gde mogu da proverim status predmeta?" },
    { id: "qa-envelope", label: "Pomozite mi oko dopisa", query: "Stigao mi je dopis, pomozite da razumem sledeći korak." },
    { id: "qa-followup", label: "Pitaj me šta još treba", query: "Postavi mi pitanja koja su potrebna za precizniji odgovor." },
  ];

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  const handleQuickAction = (nextQuery: string) => {
    setQuery(nextQuery);
  };

  const handleSend = async () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading || surveyRequired) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setLatestUserQuery(trimmed);
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
        rate_limited?: boolean;
        survey_required?: boolean;
        questions_remaining?: number;
        sessionId?: string;
        surveyTitle?: string;
        surveyIntro?: string;
        surveyDisclaimer?: string;
        interactionId?: string;
        surveyEnabled?: boolean;
        researchNotice?: string;
        structured?: {
          topK?: Record<string, unknown>;
          similarCases?: CitationItem[];
          eServices?: unknown[];
        };
      };

      setLastInteractionId(payload.interactionId ?? null);
      setSurveyEnabled(Boolean(payload.surveyEnabled));
      setResearchNotice(payload.researchNotice ?? null);
      setSessionId(payload.sessionId ?? sessionId);
      setQuestionsRemaining(
        typeof payload.questions_remaining === "number" ? payload.questions_remaining : null,
      );
      setSurveyRequired(Boolean(payload.survey_required));
      if (!payload.survey_required) {
        setSurveyModalOpen(false);
      }
      if (payload.surveyTitle) {
        setSurveyTitle(payload.surveyTitle);
      }
      if (payload.surveyIntro) {
        setSurveyIntro(payload.surveyIntro);
      }
      if (payload.surveyDisclaimer) {
        setSurveyDisclaimer(payload.surveyDisclaimer);
      }

      setLatestAssistantAnswer(payload.answer);
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl gap-4 p-4 md:p-8">
      <section className="glass-panel flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10">
        <header className="border-b border-white/10 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">LexVibe Legal AI</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-100">
            <Gavel className="h-5 w-5 text-cyan-300" />
            Istraživački alat za pristup pravdi
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Postavite pitanje običnim jezikom. Agent će pokušati da vas usmeri ka propisu, sudskoj praksi,
            e-servisu, instituciji ili sledećem praktičnom koraku.
          </p>
          <p className="mt-2 inline-flex rounded-full border border-cyan-300/30 bg-cyan-950/30 px-2 py-1 text-[11px] text-cyan-200">
            Access to Justice · SDG 16 · Research prototype
          </p>
          {questionsRemaining !== null ? (
            <p className="mt-2 text-xs text-slate-400">
              Preostalo pitanja u trenutnom bloku: {questionsRemaining}
            </p>
          ) : null}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
              <MessageSquareText className="mb-3 h-9 w-9" />
              <p className="max-w-md text-sm">
                Opišite problem, a agent će vas voditi kroz pravni sistem korak po korak.
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
            isLoading={isLoading || surveyRequired}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleQuickAction(action.query)}
                className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                {action.label}
              </button>
            ))}
          </div>
          {surveyRequired ? (
            <section className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">
              <p>
                Dostigli ste broj besplatnih pitanja. LexVibe je istraživački prototip. Vaše povratne
                informacije nam pomažu da proverimo koliko su odgovori razumljivi, korisni i bezbedni za
                građane. Molimo Vas da popunite evaluacionu anketu kako biste nastavili korišćenje.
              </p>
              <button
                type="button"
                onClick={() => setSurveyModalOpen(true)}
                className="mt-3 rounded-md bg-cyan-700 px-3 py-1.5 text-sm text-white"
              >
                Popuni anketu i nastavi
              </button>
            </section>
          ) : null}
          {surveySuccessMessage ? (
            <section className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-sm text-emerald-200">
              {surveySuccessMessage}
            </section>
          ) : null}
          {surveyError ? (
            <section className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/30 p-4 text-sm text-rose-200">
              {surveyError}
            </section>
          ) : null}
          {surveyEnabled && researchNotice ? (
            <section className="mt-4 rounded-xl border border-white/10 bg-slate-900/55 p-4 text-xs text-slate-400">
              {researchNotice}
            </section>
          ) : null}
        </div>
      </section>
      <ResearchSurveyModal
        isOpen={surveyRequired && surveyModalOpen}
        interactionId={lastInteractionId}
        sessionId={sessionId}
        latestUserQuery={latestUserQuery}
        latestAssistantAnswer={latestAssistantAnswer}
        surveyTitle={surveyTitle}
        surveyIntro={surveyIntro}
        surveyDisclaimer={surveyDisclaimer}
        onClose={() => setSurveyModalOpen(false)}
        onSubmitSuccess={(questionsUnlocked) => {
          setSurveyRequired(false);
          setSurveyModalOpen(false);
          setSurveyError(null);
          setSurveySuccessMessage("Hvala Vam. Možete nastaviti korišćenje LexVibe asistenta.");
          setQuestionsRemaining(questionsUnlocked);
        }}
      />
    </main>
  );
}
