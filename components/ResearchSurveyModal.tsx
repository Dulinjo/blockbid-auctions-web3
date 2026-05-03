"use client";

import { useEffect, useMemo, useState } from "react";

type SurveySubmissionPayload = {
  interactionId?: string;
  sessionId?: string;
  app_version?: string;
  q01_professional_role: string;
  q01_professional_role_other: string;
  q02_years_experience: string;
  q03_direct_work_frequency: string;
  q04_digital_skills_self_assessment: string;
  q05_gender: string;
  q06_age_group: string;
  q07_education_level: string;
  q07_education_level_other: string;
  q08_education_field: string;
  q08_education_field_other: string;
  q09_work_location: string;
  q10_institution_type: string;
  q10_institution_type_other: string;
  q11_digital_tools_experience: string;
  q12_prior_ai_tool_use: string;
  q13_tested_query: string;
  q14_problem_complexity: string;
  q15_expected_answer: string;
  q16_correct_institution: number;
  q17_clear_next_institution: number;
  q18_no_irrelevant_institutional_referrals: number;
  q19_practical_orientation_usefulness: number;
  q20_concrete_next_step_possible: number;
  q21_contacts_links_eservices_useful: number;
  q22_answer_relevant: number;
  q23_information_accurate_reliable: number;
  q24_no_significant_inaccuracies: number;
  q25_clear_understandable: number;
  q26_structure_helps_navigation: number;
  q27_language_suitable_for_non_lawyer: number;
  q28_trust_as_initial_information: number;
  q29_useful_for_access_to_justice: number;
  q30_willing_to_use_in_practice: number;
  q31_overall_satisfaction: number;
  q32_met_expectations: number;
  q33_identified_correct_institution: string;
  q34_relevant_contacts_or_eservices: string;
  q35_good_enough_for_real_user: string;
  q36_manual_search_time: string;
  q37_error_types: string[];
  q37_error_types_other: string;
  q38_most_useful_part: string;
  q39_improvement_suggestion: string;
  q40_missing_information: string;
  q41_role_perspective_priority: string;
  q41_role_perspective_priority_other: string;
};
export type ResearchSurveyValues = SurveySubmissionPayload;

type ResearchSurveyModalProps = {
  isOpen: boolean;
  interactionId?: string | null;
  sessionId?: string | null;
  latestUserQuery?: string;
  latestAssistantAnswer?: string;
  surveyTitle: string;
  surveyIntro: string;
  surveyDisclaimer: string;
  onSubmitSuccess: (questionsUnlocked: number) => void;
  onClose?: () => void;
};

const likertQuestions: Array<{ key: keyof SurveySubmissionPayload; label: string }> = [
  { key: "q16_correct_institution", label: "Sistem me je uputio na odgovarajuću nadležnu instituciju." },
  { key: "q17_clear_next_institution", label: "Jasno je kome korisnik treba dalje da se obrati." },
  { key: "q18_no_irrelevant_institutional_referrals", label: "Odgovor ne sadrži zbunjujuća ili nerelevantna institucionalna upućivanja." },
  { key: "q19_practical_orientation_usefulness", label: "Odgovor je koristan za praktičnu orijentaciju korisnika." },
  { key: "q20_concrete_next_step_possible", label: "Na osnovu odgovora moguće je preduzeti konkretan sledeći korak." },
  { key: "q21_contacts_links_eservices_useful", label: "Ponuđeni kontakti, linkovi ili e-servisi su upotrebljivi." },
  { key: "q22_answer_relevant", label: "Odgovor je relevantan za postavljeno pitanje." },
  { key: "q23_information_accurate_reliable", label: "Informacije u odgovoru deluju tačno i pouzdano." },
  { key: "q24_no_significant_inaccuracies", label: "U odgovoru nema značajnih netačnosti ili konfuznih elemenata." },
  { key: "q25_clear_understandable", label: "Odgovor je formulisan jasno i razumljivo." },
  { key: "q26_structure_helps_navigation", label: "Struktura odgovora olakšava snalaženje." },
  { key: "q27_language_suitable_for_non_lawyer", label: "Jezik odgovora je primeren korisniku koji nije pravni stručnjak." },
  { key: "q28_trust_as_initial_information", label: "Imao/la bih poverenja da ovaj odgovor koristim kao početnu informaciju." },
  { key: "q29_useful_for_access_to_justice", label: "Ovakav alat može biti koristan za unapređenje pristupa pravdi." },
  { key: "q30_willing_to_use_in_practice", label: "Bio/la bih spreman/na da koristim ovakav sistem u praksi kao pomoćni alat." },
  { key: "q31_overall_satisfaction", label: "U celini, zadovoljan/na sam odgovorom sistema." },
  { key: "q32_met_expectations", label: "Odgovor sistema je ispunio moja očekivanja." },
];

const errorOptions = [
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

const defaultState = (latestUserQuery: string): SurveySubmissionPayload => ({
  q01_professional_role: "",
  q01_professional_role_other: "",
  q02_years_experience: "",
  q03_direct_work_frequency: "",
  q04_digital_skills_self_assessment: "",
  q05_gender: "",
  q06_age_group: "",
  q07_education_level: "",
  q07_education_level_other: "",
  q08_education_field: "",
  q08_education_field_other: "",
  q09_work_location: "",
  q10_institution_type: "",
  q10_institution_type_other: "",
  q11_digital_tools_experience: "",
  q12_prior_ai_tool_use: "",
  q13_tested_query: latestUserQuery,
  q14_problem_complexity: "",
  q15_expected_answer: "",
  q16_correct_institution: 0,
  q17_clear_next_institution: 0,
  q18_no_irrelevant_institutional_referrals: 0,
  q19_practical_orientation_usefulness: 0,
  q20_concrete_next_step_possible: 0,
  q21_contacts_links_eservices_useful: 0,
  q22_answer_relevant: 0,
  q23_information_accurate_reliable: 0,
  q24_no_significant_inaccuracies: 0,
  q25_clear_understandable: 0,
  q26_structure_helps_navigation: 0,
  q27_language_suitable_for_non_lawyer: 0,
  q28_trust_as_initial_information: 0,
  q29_useful_for_access_to_justice: 0,
  q30_willing_to_use_in_practice: 0,
  q31_overall_satisfaction: 0,
  q32_met_expectations: 0,
  q33_identified_correct_institution: "",
  q34_relevant_contacts_or_eservices: "",
  q35_good_enough_for_real_user: "",
  q36_manual_search_time: "",
  q37_error_types: [],
  q37_error_types_other: "",
  q38_most_useful_part: "",
  q39_improvement_suggestion: "",
  q40_missing_information: "",
  q41_role_perspective_priority: "",
  q41_role_perspective_priority_other: "",
});
export const RESEARCH_SURVEY_DEFAULTS: ResearchSurveyValues = defaultState("");

const sectionTitles = [
  "I. Profil ispitanika",
  "I.a Socio-demografski podaci",
  "II. Podaci o testiranom slučaju",
  "III–IV. Procena odgovora (Likert 1–5)",
  "V–VIII. Objektivna procena i otvorena pitanja",
];

export function ResearchSurveyModal({
  isOpen,
  interactionId,
  sessionId,
  latestUserQuery,
  latestAssistantAnswer,
  surveyTitle,
  surveyIntro,
  surveyDisclaimer,
  onSubmitSuccess,
  onClose,
}: ResearchSurveyModalProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<SurveySubmissionPayload>(defaultState(latestUserQuery || ""));

  const progress = useMemo(() => Math.round(((step + 1) / sectionTitles.length) * 100), [step]);

  useEffect(() => {
    if (!isOpen || !latestUserQuery) {
      return;
    }
    setState((prev) => {
      if (prev.q13_tested_query.trim()) {
        return prev;
      }
      return { ...prev, q13_tested_query: latestUserQuery };
    });
  }, [isOpen, latestUserQuery]);

  if (!isOpen) {
    return null;
  }

  const updateField = <K extends keyof SurveySubmissionPayload>(key: K, value: SurveySubmissionPayload[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const validateCurrentStep = () => {
    if (step === 0) {
      return Boolean(
        state.q01_professional_role &&
          state.q02_years_experience &&
          state.q03_direct_work_frequency &&
          state.q04_digital_skills_self_assessment,
      );
    }
    if (step === 2) {
      return Boolean(state.q13_tested_query && state.q14_problem_complexity && state.q15_expected_answer);
    }
    if (step === 3) {
      return likertQuestions.every((item) => Number(state[item.key]) >= 1 && Number(state[item.key]) <= 5);
    }
    if (step === 4) {
      return Boolean(
        state.q33_identified_correct_institution &&
          state.q34_relevant_contacts_or_eservices &&
          state.q35_good_enough_for_real_user &&
          state.q36_manual_search_time &&
          state.q37_error_types.length > 0 &&
          state.q39_improvement_suggestion,
      );
    }
    return true;
  };

  const nextStep = () => {
    if (!validateCurrentStep()) {
      setError("Molimo popunite obavezna polja pre nastavka.");
      return;
    }
    setError("");
    setStep((prev) => Math.min(prev + 1, sectionTitles.length - 1));
  };

  const prevStep = () => {
    setError("");
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const toggleErrorType = (label: string) => {
    setState((prev) => ({
      ...prev,
      q37_error_types: prev.q37_error_types.includes(label)
        ? prev.q37_error_types.filter((row) => row !== label)
        : [...prev.q37_error_types, label],
    }));
  };

  const submitSurvey = async () => {
    if (!validateCurrentStep()) {
      setError("Molimo popunite obavezna polja pre slanja ankete.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...state,
          interactionId: interactionId || undefined,
          sessionId: sessionId || undefined,
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || "",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.detail?.[0]?.msg || payload?.detail || "Anketa nije sačuvana.");
      }
      const payload = (await response.json()) as { questions_unlocked?: number };
      onSubmitSuccess(Number(payload.questions_unlocked || 10));
      setState(defaultState(latestUserQuery || ""));
      setStep(0);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Greška pri slanju ankete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{surveyTitle}</h2>
            <p className="mt-1 text-sm text-slate-300">{surveyIntro}</p>
            <p className="mt-2 text-xs text-amber-200">{surveyDisclaimer}</p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200"
            >
              Zatvori
            </button>
          ) : null}
        </div>
        {latestAssistantAnswer ? (
          <div className="mb-4 rounded border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-300">
            <p className="font-semibold text-slate-200">Kontekst poslednjeg odgovora sistema (opciono):</p>
            <p className="mt-1 whitespace-pre-wrap">{latestAssistantAnswer}</p>
          </div>
        ) : null}
        <div className="mb-4">
          <p className="mb-1 text-xs text-slate-400">{sectionTitles[step]}</p>
          <div className="h-2 w-full rounded bg-slate-700">
            <div className="h-2 rounded bg-cyan-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Napredak: {progress}%</p>
        </div>

        {step === 0 ? (
          <section className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              1. Vaša profesionalna uloga *
              <select
                className="mt-1 w-full rounded bg-slate-800 px-2 py-1"
                value={state.q01_professional_role}
                onChange={(event) => updateField("q01_professional_role", event.target.value)}
              >
                <option value="">Izaberite</option>
                <option>Pružalac besplatne pravne pomoći</option>
                <option>Službenik za nadzor nad BPP</option>
                <option>Zaposleni u kontakt centru Ministarstva pravde</option>
                <option>Zaposleni u sudu (pravna pomoć)</option>
                <option>Advokat</option>
                <option>Drugo</option>
              </select>
            </label>
            {state.q01_professional_role === "Drugo" ? (
              <label className="text-xs text-slate-300">
                Precizirajte ulogu *
                <input
                  className="mt-1 w-full rounded bg-slate-800 px-2 py-1"
                  value={state.q01_professional_role_other}
                  onChange={(event) => updateField("q01_professional_role_other", event.target.value)}
                />
              </label>
            ) : null}
            <label className="text-xs text-slate-300">
              2. Godine iskustva u oblasti *
              <select
                className="mt-1 w-full rounded bg-slate-800 px-2 py-1"
                value={state.q02_years_experience}
                onChange={(event) => updateField("q02_years_experience", event.target.value)}
              >
                <option value="">Izaberite</option>
                <option>0–2</option>
                <option>3–5</option>
                <option>6–10</option>
                <option>10+</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              3. Koliko često radite direktno sa građanima/strankama *
              <select
                className="mt-1 w-full rounded bg-slate-800 px-2 py-1"
                value={state.q03_direct_work_frequency}
                onChange={(event) => updateField("q03_direct_work_frequency", event.target.value)}
              >
                <option value="">Izaberite</option>
                <option>Svakodnevno</option>
                <option>Često</option>
                <option>Povremeno</option>
                <option>Retko</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              4. Samoprocena digitalnih veština *
              <select
                className="mt-1 w-full rounded bg-slate-800 px-2 py-1"
                value={state.q04_digital_skills_self_assessment}
                onChange={(event) => updateField("q04_digital_skills_self_assessment", event.target.value)}
              >
                <option value="">Izaberite</option>
                <option>Niska</option>
                <option>Srednja</option>
                <option>Visoka</option>
              </select>
            </label>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              5. Pol
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q05_gender} onChange={(event) => updateField("q05_gender", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Muški</option>
                <option>Ženski</option>
                <option>Ne želim da se izjasnim</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              6. Starosna grupa
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q06_age_group} onChange={(event) => updateField("q06_age_group", event.target.value)}>
                <option value="">Izaberite</option>
                <option>18–29</option>
                <option>30–39</option>
                <option>40–49</option>
                <option>50–59</option>
                <option>60+</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              7. Nivo obrazovanja
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q07_education_level} onChange={(event) => updateField("q07_education_level", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Osnovne studije</option>
                <option>Master studije</option>
                <option>Doktorske studije</option>
                <option>Drugo</option>
              </select>
            </label>
            {state.q07_education_level === "Drugo" ? (
              <label className="text-xs text-slate-300">
                Precizirajte nivo obrazovanja
                <input className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q07_education_level_other} onChange={(event) => updateField("q07_education_level_other", event.target.value)} />
              </label>
            ) : null}
            <label className="text-xs text-slate-300">
              8. Oblast obrazovanja
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q08_education_field} onChange={(event) => updateField("q08_education_field", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Pravo</option>
                <option>Društvene nauke</option>
                <option>Tehničke nauke</option>
                <option>Drugo</option>
              </select>
            </label>
            {state.q08_education_field === "Drugo" ? (
              <label className="text-xs text-slate-300">
                Precizirajte oblast
                <input className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q08_education_field_other} onChange={(event) => updateField("q08_education_field_other", event.target.value)} />
              </label>
            ) : null}
            <label className="text-xs text-slate-300">
              9. Mesto rada
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q09_work_location} onChange={(event) => updateField("q09_work_location", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Veliki grad</option>
                <option>Srednji grad</option>
                <option>Malo mesto/opština</option>
                <option>Ruralno područje</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              10. Tip institucije
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q10_institution_type} onChange={(event) => updateField("q10_institution_type", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Državna institucija</option>
                <option>Lokalna samouprava</option>
                <option>Sud</option>
                <option>Advokatura (privatni sektor)</option>
                <option>NGO / organizacija civilnog društva</option>
                <option>Drugo</option>
              </select>
            </label>
            {state.q10_institution_type === "Drugo" ? (
              <label className="text-xs text-slate-300">
                Precizirajte tip institucije
                <input className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q10_institution_type_other} onChange={(event) => updateField("q10_institution_type_other", event.target.value)} />
              </label>
            ) : null}
            <label className="text-xs text-slate-300">
              11. Iskustvo sa digitalnim alatima u radu
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q11_digital_tools_experience} onChange={(event) => updateField("q11_digital_tools_experience", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Veoma malo</option>
                <option>Povremeno</option>
                <option>Često</option>
                <option>Svakodnevno</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              12. Da li ste ranije koristili AI alate, npr. ChatGPT
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q12_prior_ai_tool_use} onChange={(event) => updateField("q12_prior_ai_tool_use", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Ne</option>
                <option>Povremeno</option>
                <option>Često</option>
              </select>
            </label>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-3">
            <label className="text-xs text-slate-300">
              13. Tekst upita koji ste postavili chatbot-u *
              <textarea className="mt-1 w-full rounded bg-slate-800 px-2 py-1" rows={3} value={state.q13_tested_query} onChange={(event) => updateField("q13_tested_query", event.target.value)} />
            </label>
            <label className="text-xs text-slate-300">
              14. Kako biste opisali pravni problem *
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q14_problem_complexity} onChange={(event) => updateField("q14_problem_complexity", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Jednostavan</option>
                <option>Srednje složen</option>
                <option>Složen</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              15. Šta ste očekivali kao odgovor *
              <textarea className="mt-1 w-full rounded bg-slate-800 px-2 py-1" rows={3} value={state.q15_expected_answer} onChange={(event) => updateField("q15_expected_answer", event.target.value)} />
            </label>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-3">
            <p className="text-xs text-slate-400">Skala: 1 – uopšte se ne slažem, 5 – u potpunosti se slažem</p>
            {likertQuestions.map((item) => (
              <div key={item.key as string} className="rounded border border-slate-700 p-2">
                <p className="mb-1 text-xs text-slate-200">{item.label}</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => updateField(item.key, score as never)}
                      className={`rounded px-3 py-1 text-xs ${Number(state[item.key]) === score ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300"}`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {step === 4 ? (
          <section className="grid gap-3">
            <label className="text-xs text-slate-300">
              33. Da li je sistem identifikovao pravu nadležnu instituciju? *
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q33_identified_correct_institution} onChange={(event) => updateField("q33_identified_correct_institution", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Da</option>
                <option>Delimično</option>
                <option>Ne</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              34. Da li su ponuđeni relevantni kontakti ili e-servisi? *
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q34_relevant_contacts_or_eservices} onChange={(event) => updateField("q34_relevant_contacts_or_eservices", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Da</option>
                <option>Delimično</option>
                <option>Ne</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              35. Da li biste ovaj odgovor smatrali dovoljno dobrim za stvarnog korisnika? *
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q35_good_enough_for_real_user} onChange={(event) => updateField("q35_good_enough_for_real_user", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Da</option>
                <option>Samo uz dodatnu proveru</option>
                <option>Ne</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              36. Koliko vremena bi Vam trebalo da ručno pronađete ove informacije? *
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q36_manual_search_time} onChange={(event) => updateField("q36_manual_search_time", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Manje od 5 min</option>
                <option>5–15 min</option>
                <option>15–30 min</option>
                <option>Više od 30 min</option>
              </select>
            </label>
            <div>
              <p className="mb-2 text-xs text-slate-300">37. Koje vrste problema u odgovoru ste uočili? *</p>
              <div className="flex flex-wrap gap-2">
                {errorOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleErrorType(option)}
                    className={`rounded border px-2 py-1 text-[11px] ${state.q37_error_types.includes(option) ? "border-cyan-300 bg-cyan-900/40 text-cyan-100" : "border-slate-700 bg-slate-800 text-slate-300"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            {state.q37_error_types.includes("Drugo") ? (
              <label className="text-xs text-slate-300">
                Precizirajte "Drugo"
                <input className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q37_error_types_other} onChange={(event) => updateField("q37_error_types_other", event.target.value)} />
              </label>
            ) : null}
            <label className="text-xs text-slate-300">
              38. Šta je u odgovoru bilo najkorisnije?
              <textarea className="mt-1 w-full rounded bg-slate-800 px-2 py-1" rows={2} value={state.q38_most_useful_part} onChange={(event) => updateField("q38_most_useful_part", event.target.value)} />
            </label>
            <label className="text-xs text-slate-300">
              39. Šta biste unapredili u odgovoru? *
              <textarea className="mt-1 w-full rounded bg-slate-800 px-2 py-1" rows={2} value={state.q39_improvement_suggestion} onChange={(event) => updateField("q39_improvement_suggestion", event.target.value)} />
            </label>
            <label className="text-xs text-slate-300">
              40. Da li postoji važna informacija koja nedostaje?
              <textarea className="mt-1 w-full rounded bg-slate-800 px-2 py-1" rows={2} value={state.q40_missing_information} onChange={(event) => updateField("q40_missing_information", event.target.value)} />
            </label>
            <label className="text-xs text-slate-300">
              41. Iz perspektive Vaše uloge, šta je najvažnije u odgovoru
              <select className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q41_role_perspective_priority} onChange={(event) => updateField("q41_role_perspective_priority", event.target.value)}>
                <option value="">Izaberite</option>
                <option>Pravna tačnost</option>
                <option>Pravilno upućivanje na instituciju</option>
                <option>Jasnoća za građane</option>
                <option>Praktična upotrebljivost</option>
                <option>Poverenje u odgovor</option>
                <option>Drugo</option>
              </select>
            </label>
            {state.q41_role_perspective_priority === "Drugo" ? (
              <label className="text-xs text-slate-300">
                Precizirajte prioritet
                <input className="mt-1 w-full rounded bg-slate-800 px-2 py-1" value={state.q41_role_perspective_priority_other} onChange={(event) => updateField("q41_role_perspective_priority_other", event.target.value)} />
              </label>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={prevStep} disabled={step === 0 || saving} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-200 disabled:opacity-40">
            Nazad
          </button>
          {step < sectionTitles.length - 1 ? (
            <button type="button" onClick={nextStep} disabled={saving} className="rounded bg-cyan-700 px-4 py-1.5 text-sm text-white">
              Sledeći korak
            </button>
          ) : (
            <button type="button" onClick={submitSurvey} disabled={saving} className="rounded bg-emerald-700 px-4 py-1.5 text-sm text-white disabled:opacity-50">
              {saving ? "Slanje..." : "Pošalji anketu"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
