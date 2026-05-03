"use client";

import { useEffect, useMemo, useState } from "react";
import { Gavel, Loader2, MessageSquareText } from "lucide-react";

import { ChatInput } from "@/components/ChatInput";
import { CitationCard, CitationItem } from "@/components/CitationCard";
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

type SurveyDraft = {
  usefulness: "yes" | "partial" | "no";
  sourceRelevance: "yes" | "partial" | "no" | "not_checked";
  clarity: "yes" | "partial" | "no";
  wouldUseAgain: "yes" | "maybe" | "no";
  freeComment: string;
};

type FullSurveyDraft = {
  role: string;
  yearsExperience: string;
  worksWithCitizensFrequency: string;
  digitalSkills: string;
  gender: string;
  ageGroup: string;
  educationLevel: string;
  educationField: string;
  institutionType: string;
  usedAiToolsBefore: string;
  caseComplexity: string;
  expectedAnswer: string;
  likert: Record<string, number | null>;
  identifiedRightInstitution: string;
  offeredRelevantContactsOrServices: string;
  goodEnoughForRealUser: string;
  manualSearchTimeEstimate: string;
  errors: string[];
  mostUseful: string;
  whatToImprove: string;
  missingInformation: string;
  rolePerspectiveMostImportant: string;
};

const LIKERT_KEYS = [
  "institutionalGuidance1",
  "institutionalGuidance2",
  "institutionalGuidance3",
  "operationalUsefulness1",
  "operationalUsefulness2",
  "operationalUsefulness3",
  "accuracyRelevance1",
  "accuracyRelevance2",
  "accuracyRelevance3",
  "clarity1",
  "clarity2",
  "clarity3",
  "trust1",
  "trust2",
  "trust3",
  "overallSatisfaction",
  "metExpectations",
] as const;

const ERROR_OPTIONS = [
  "Pogrešna institucija",
  "Nedostaje važna institucija",
  "Nerelevantni kontakti ili linkovi",
  "Nedostaje konkretan sledeći korak",
  "Odgovor je previše opšti",
  "Pravna nepreciznost",
  "Teško razumljiv odgovor",
  "Odgovor deluje pouzdano, ali je pogrešan",
  "Nema značajnih problema",
  "Drugo",
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [queryCount, setQueryCount] = useState(0);
  const [remainingBonusQueries, setRemainingBonusQueries] = useState(0);
  const [surveySkips, setSurveySkips] = useState(0);
  const [fullSurveyOpen, setFullSurveyOpen] = useState(false);
  const [miniFeedbackVisible, setMiniFeedbackVisible] = useState(false);
  const [miniFeedbackHelpfulness, setMiniFeedbackHelpfulness] = useState<"useful" | "partial" | "not_useful" | null>(
    null,
  );
  const [miniProblemTypes, setMiniProblemTypes] = useState<string[]>([]);
  const [miniComment, setMiniComment] = useState("");
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
  const [fullSurveyDraft, setFullSurveyDraft] = useState<FullSurveyDraft>({
    role: "",
    yearsExperience: "",
    worksWithCitizensFrequency: "",
    digitalSkills: "",
    gender: "",
    ageGroup: "",
    educationLevel: "",
    educationField: "",
    institutionType: "",
    usedAiToolsBefore: "",
    caseComplexity: "",
    expectedAnswer: "",
    likert: Object.fromEntries(LIKERT_KEYS.map((key) => [key, null])),
    identifiedRightInstitution: "",
    offeredRelevantContactsOrServices: "",
    goodEnoughForRealUser: "",
    manualSearchTimeEstimate: "",
    errors: [],
    mostUseful: "",
    whatToImprove: "",
    missingInformation: "",
    rolePerspectiveMostImportant: "",
  });
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

  const canSkipSurvey = surveySkips < 2;
  const needsSoftFeedbackBlock = queryCount >= 4 && !miniFeedbackHelpfulness && !canSkipSurvey;

  const handleQuickAction = (nextQuery: string) => {
    setQuery(nextQuery);
  };

  const handleSend = async () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading || needsSoftFeedbackBlock) {
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
    setQueryCount((prev) => prev + 1);
    if (remainingBonusQueries > 0) {
      setRemainingBonusQueries((prev) => prev - 1);
    }

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
        structured?: {
          topK?: Record<string, unknown>;
          similarCases?: CitationItem[];
          eServices?: unknown[];
        };
      };

      setLastInteractionId(payload.interactionId ?? null);
      setSurveyEnabled(Boolean(payload.surveyEnabled));
      setResearchNotice(payload.researchNotice ?? null);
      setSurveySaved(false);
      const shouldOpenMini = queryCount + 1 >= 2;
      if (shouldOpenMini) {
        setMiniFeedbackVisible(true);
      }
      const usedEServices = Array.isArray(payload.structured?.eServices) && payload.structured?.eServices.length > 0;
      const usedLawOrCases =
        Boolean(payload.structured?.similarCases && payload.structured?.similarCases.length > 0) ||
        Boolean(payload.citations?.length);
      const shouldOpenFull = queryCount + 1 >= 4 || usedEServices || usedLawOrCases;
      if (shouldOpenFull) {
        setFullSurveyOpen(true);
      }

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

  const submitMiniFeedback = async () => {
    if (!lastInteractionId || !miniFeedbackHelpfulness) {
      return;
    }
    try {
      await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionId: lastInteractionId,
          surveyType: "mini",
          helpfulness: miniFeedbackHelpfulness,
          problemTypes: miniProblemTypes,
          freeComment: miniComment,
          triggerReason: "after_answer",
          sessionId,
        }),
      });
      setMiniFeedbackVisible(false);
      setRemainingBonusQueries((prev) => prev + 3);
      setSurveySaved(true);
    } catch {
      // optional
    }
  };

  const submitFullSurvey = async () => {
    if (!lastInteractionId) {
      return;
    }
    try {
      await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionId: lastInteractionId,
          surveyType: "full",
          triggerReason: "after_n_queries",
          sessionId,
          profile: {
            role: fullSurveyDraft.role,
            yearsExperience: fullSurveyDraft.yearsExperience,
            worksWithCitizensFrequency: fullSurveyDraft.worksWithCitizensFrequency,
            digitalSkills: fullSurveyDraft.digitalSkills,
          },
          socioDemographics: {
            gender: fullSurveyDraft.gender,
            ageGroup: fullSurveyDraft.ageGroup,
            educationLevel: fullSurveyDraft.educationLevel,
            educationField: fullSurveyDraft.educationField,
            institutionType: fullSurveyDraft.institutionType,
            usedAiToolsBefore: fullSurveyDraft.usedAiToolsBefore,
          },
          testedCase: {
            caseComplexity: fullSurveyDraft.caseComplexity,
            expectedAnswer: fullSurveyDraft.expectedAnswer,
          },
          likert: fullSurveyDraft.likert,
          objectiveAssessment: {
            identifiedRightInstitution: fullSurveyDraft.identifiedRightInstitution,
            offeredRelevantContactsOrServices: fullSurveyDraft.offeredRelevantContactsOrServices,
            goodEnoughForRealUser: fullSurveyDraft.goodEnoughForRealUser,
            manualSearchTimeEstimate: fullSurveyDraft.manualSearchTimeEstimate,
          },
          errors: fullSurveyDraft.errors,
          openFeedback: {
            mostUseful: fullSurveyDraft.mostUseful,
            whatToImprove: fullSurveyDraft.whatToImprove,
            missingInformation: fullSurveyDraft.missingInformation,
            rolePerspectiveMostImportant: fullSurveyDraft.rolePerspectiveMostImportant,
          },
        }),
      });
      setFullSurveyOpen(false);
      setRemainingBonusQueries((prev) => prev + 10);
      setSurveySaved(true);
    } catch {
      // optional
    }
  };

  const skipSurvey = () => {
    setSurveySkips((prev) => prev + 1);
    setFullSurveyOpen(false);
    setMiniFeedbackVisible(false);
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
          {needsSoftFeedbackBlock ? (
            <section className="mb-3 rounded-xl border border-amber-400/30 bg-amber-900/20 p-3 text-sm text-amber-100">
              LexVibe je istraživački prototip. Da bismo unapredili alat za pristup pravdi, molimo ocenite bar jedan odgovor pre nastavka.
            </section>
          ) : null}
          <ChatInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSend}
            isLoading={isLoading}
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
          {miniFeedbackVisible && lastInteractionId ? (
            <section className="mt-4 rounded-xl border border-white/10 bg-slate-900/55 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Da li vam je ovo pomoglo?</h3>
              <div className="mt-2 flex gap-2">
                {[
                  ["useful", "Korisno"],
                  ["partial", "Delimično"],
                  ["not_useful", "Nije korisno"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMiniFeedbackHelpfulness(value as "useful" | "partial" | "not_useful")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs",
                      miniFeedbackHelpfulness === value
                        ? "bg-cyan-700 text-white"
                        : "bg-slate-800 text-slate-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {miniFeedbackHelpfulness && miniFeedbackHelpfulness !== "useful" ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-slate-300">Šta je bio problem?</p>
                  <div className="flex flex-wrap gap-2">
                    {ERROR_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setMiniProblemTypes((prev) =>
                            prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option],
                          )
                        }
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px]",
                          miniProblemTypes.includes(option)
                            ? "border-cyan-400 bg-cyan-900/40 text-cyan-100"
                            : "border-slate-700 bg-slate-900/50 text-slate-300",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="w-full rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-100"
                    rows={2}
                    value={miniComment}
                    onChange={(event) => setMiniComment(event.target.value)}
                    placeholder="Kratak komentar (opciono)"
                  />
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={submitMiniFeedback}
                  disabled={!miniFeedbackHelpfulness}
                  className="rounded-md bg-cyan-700 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Sačuvaj mini feedback
                </button>
                {canSkipSurvey ? (
                  <button
                    type="button"
                    onClick={skipSurvey}
                    className="rounded-md bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    Preskoči sada
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
          {fullSurveyOpen && lastInteractionId ? (
            <section className="mt-4 rounded-xl border border-white/10 bg-slate-900/55 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Proširena evaluacija (Access to Justice)</h3>
              <p className="mt-2 text-xs text-slate-400">
                Vaša ocena pomaže istraživanju alata za pristup pravdi. Ne unosite lične podatke.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs text-slate-300">
                  Profesionalna uloga
                  <input
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={fullSurveyDraft.role}
                    onChange={(event) =>
                      setFullSurveyDraft((prev) => ({ ...prev, role: event.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Iskustvo
                  <input
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={fullSurveyDraft.yearsExperience}
                    onChange={(event) =>
                      setFullSurveyDraft((prev) => ({ ...prev, yearsExperience: event.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-slate-300 md:col-span-2">
                  Očekivanja od odgovora
                  <textarea
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    rows={2}
                    value={fullSurveyDraft.expectedAnswer}
                    onChange={(event) =>
                      setFullSurveyDraft((prev) => ({ ...prev, expectedAnswer: event.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Ukupno zadovoljstvo (1-5)
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={fullSurveyDraft.likert.overallSatisfaction ?? ""}
                    onChange={(event) =>
                      setFullSurveyDraft((prev) => ({
                        ...prev,
                        likert: {
                          ...prev.likert,
                          overallSatisfaction: Number(event.target.value) || null,
                        },
                      }))
                    }
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Ispunjenost očekivanja (1-5)
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1 text-sm"
                    value={fullSurveyDraft.likert.metExpectations ?? ""}
                    onChange={(event) =>
                      setFullSurveyDraft((prev) => ({
                        ...prev,
                        likert: {
                          ...prev.likert,
                          metExpectations: Number(event.target.value) || null,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={submitFullSurvey}
                  className="rounded-md bg-cyan-700 px-3 py-1 text-sm text-white"
                >
                  Pošalji punu anketu
                </button>
                {canSkipSurvey ? (
                  <button
                    type="button"
                    onClick={skipSurvey}
                    className="rounded-md bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    Preskoči sada
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
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
