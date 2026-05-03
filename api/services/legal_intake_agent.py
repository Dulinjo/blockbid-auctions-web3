from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

from langchain_openai import ChatOpenAI

from api.services.config import feature_enabled


INTENT_LEGAL_SITUATION_ANALYSIS = "LEGAL_SITUATION_ANALYSIS"
INTENT_REGULATION_LOOKUP = "REGULATION_LOOKUP"
INTENT_CASE_LAW_SEARCH = "CASE_LAW_SEARCH"
INTENT_COMBINED = "COMBINED_REGULATION_AND_CASE_LAW"
INTENT_CLARIFICATION_NEEDED = "CLARIFICATION_NEEDED"
INTENT_OUT_OF_SCOPE = "OUT_OF_SCOPE"


@dataclass(slots=True)
class IntakeDecision:
    intent: str
    confidence_score: float
    confidence_label: str
    legal_area: str
    user_situation_summary: str
    detected_facts: list[str]
    missing_facts: list[str]
    needs_regulation_lookup: bool
    needs_case_law_search: bool
    needs_e_services_guidance: bool
    needs_envelope_clue_analysis: bool
    needs_echr_check: bool
    needs_clarification: bool
    needs_temporal_validity_check: bool
    possible_regulations: list[str]
    possible_services: list[str]
    e_service_intent: str
    clarifying_questions: list[str]
    search_query_for_regulations: str
    search_query_for_case_law: str
    routing_decision: str
    reasoning_summary: str
    intake_source: str
    openai_intake_response: dict[str, Any] | None = None

    def to_json(self) -> dict:
        return {
            "intent": self.intent,
            "confidenceScore": round(self.confidence_score, 3),
            "confidenceLabel": self.confidence_label,
            "legalArea": self.legal_area,
            "needsClarification": self.needs_clarification,
            "userSituationSummary": self.user_situation_summary,
            "detectedFacts": self.detected_facts,
            "missingFacts": self.missing_facts,
            "needsRegulationLookup": self.needs_regulation_lookup,
            "needsCaseLawSearch": self.needs_case_law_search,
            "needsEServicesGuidance": self.needs_e_services_guidance,
            "needsEnvelopeClueAnalysis": self.needs_envelope_clue_analysis,
            "needsEchrCheck": self.needs_echr_check,
            "needsTemporalValidityCheck": self.needs_temporal_validity_check,
            "possibleRegulations": self.possible_regulations,
            "possibleServices": self.possible_services,
            "eServiceIntent": self.e_service_intent,
            "clarifyingQuestions": self.clarifying_questions,
            "searchQueryForRegulations": self.search_query_for_regulations,
            "searchQueryForCaseLaw": self.search_query_for_case_law,
            "routingDecision": self.routing_decision,
            "reasoningSummary": self.reasoning_summary,
            "intakeSource": self.intake_source,
        }


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    lower = text.lower()
    return any(term in lower for term in terms)


def _confidence_label(score: float) -> str:
    if score >= 0.77:
        return "high"
    if score >= 0.55:
        return "medium"
    return "low"


def _normalize_intent(intent: str) -> str:
    value = str(intent or "").strip().upper()
    aliases = {
        "COMBINED": INTENT_COMBINED,
        "COMBINED_REGULATION_AND_CASE_LAW": INTENT_COMBINED,
        "LEGAL_SITUATION_ANALYSIS": INTENT_LEGAL_SITUATION_ANALYSIS,
        "REGULATION_LOOKUP": INTENT_REGULATION_LOOKUP,
        "CASE_LAW_SEARCH": INTENT_CASE_LAW_SEARCH,
        "CLARIFICATION_NEEDED": INTENT_CLARIFICATION_NEEDED,
        "OUT_OF_SCOPE": INTENT_OUT_OF_SCOPE,
    }
    return aliases.get(value, INTENT_CLARIFICATION_NEEDED)


def _parse_json_from_text(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        payload = json.loads(cleaned)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _safe_list_str(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    rows: list[str] = []
    for item in value:
        if isinstance(item, (str, int, float)):
            text = str(item).strip()
            if text:
                rows.append(text)
    return rows


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _safe_score(value: Any, default: float = 0.55) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        score = default
    return max(0.0, min(score, 1.0))


def _default_routing(intent: str) -> str:
    return (
        "combined_pipeline"
        if intent == INTENT_COMBINED
        else "regulation_pipeline"
        if intent == INTENT_REGULATION_LOOKUP
        else "case_law_pipeline"
        if intent == INTENT_CASE_LAW_SEARCH
        else "situation_pipeline"
        if intent == INTENT_LEGAL_SITUATION_ANALYSIS
        else "clarification"
        if intent == INTENT_CLARIFICATION_NEEDED
        else "out_of_scope"
    )


def _infer_legal_area(text: str) -> str:
    lowered = text.lower()
    if _contains_any(lowered, ("rad", "otkaz", "zaposlen")):
        return "radno pravo"
    if _contains_any(lowered, ("ugovor", "obligacion", "štet", "stet", "odgovornost", "trotinet")):
        return "naknada štete / saobraćaj / odgovornost"
    if _contains_any(lowered, ("kriv", "kz", "kž", "kazn")):
        return "krivično pravo"
    if _contains_any(lowered, ("parnič", "parnic", "tužb", "tuzb")):
        return "parnično pravo"
    return "opšte pravo"


def _infer_possible_regulations(question: str, legal_area: str) -> list[str]:
    lowered = question.lower()
    if "radno pravo" in legal_area:
        return ["Zakon o radu"]
    if _contains_any(lowered, ("trotinet", "saobra", "steta", "šteta", "odgovornost", "tužim", "tuzim")):
        return [
            "Zakon o obligacionim odnosima",
            "Zakon o bezbednosti saobraćaja na putevima",
        ]
    if "krivično pravo" in legal_area:
        return ["Krivični zakonik", "Zakonik o krivičnom postupku"]
    if "parnično pravo" in legal_area:
        return ["Zakon o parničnom postupku"]
    return []


def _infer_e_service_intent(question: str) -> str:
    lowered = question.lower()
    if _contains_any(lowered, ("euprava", "portal", "prijavim", "ulogujem", "tehnič", "tehnic")):
        return "technical_support"
    if _contains_any(
        lowered,
        (
            "koverta",
            "dopis",
            "rešenje",
            "resenje",
            "poziv",
            "broj predmeta",
            "posl. br",
            "upisnik",
            "stiglo",
            "tok predmeta",
        ),
    ):
        return "received_letter_or_case_number"
    if _contains_any(lowered, ("status predmeta", "gde da proverim", "kome da se obratim", "pisarnica")):
        return "status_check_or_registry"
    if _contains_any(lowered, ("nasilje", "preti", "bojim se", "hitno")):
        return "urgent_safety"
    return ""


def _infer_possible_services(question: str, legal_area: str) -> list[str]:
    lowered = question.lower()
    services: list[str] = []
    if _contains_any(lowered, ("umro", "preminuo", "ostavina", "nasledstvo")):
        services.append("SRV-001")
    if _contains_any(lowered, ("nasilje", "preti", "bojim se", "hitno")):
        services.append("SRV-002")
    if _contains_any(
        lowered,
        ("koverta", "broj predmeta", "posl. br", "upisnik", "status predmeta", "resenje", "rešenje"),
    ):
        services.append("SRV-003")
    if _contains_any(lowered, ("euprava", "portal", "tehnič", "tehnic", "prijavim", "ulogujem")):
        services.append("SRV-003")
    if "radno pravo" in legal_area and "SRV-003" not in services:
        services.append("SRV-003")
    return services[:4]


def _contains_echr_reference(text: str) -> bool:
    return _contains_any(
        text,
        (
            "echr",
            "esljp",
            "hudoc",
            "strazbur",
            "strasbourg",
            "evropski sud za ljudska prava",
            "evropska konvencija",
            "konvencija",
        ),
    )


def _has_human_rights_dimension(text: str) -> bool:
    return _contains_any(
        text,
        (
            "ljudska prava",
            "policija",
            "pritvor",
            "diskrimin",
            "privatnost",
            "sloboda izrazavanja",
            "sloboda izražavanja",
            "duzina postupka",
            "dugo traje",
            "razumnom roku",
            "delotvorni pravni lek",
            "efikasan pravni lek",
        ),
    )


def _is_ambiguous_delivery_phrase(text: str) -> bool:
    normalized = " ".join(text.split())
    return normalized in {"tok predmeta", "stiglo mi je nesto", "stiglo mi je nešto"} or _contains_any(
        normalized,
        ("stiglo mi je nesto", "stiglo mi je nešto"),
    )


def _build_envelope_clarifying_questions() -> list[str]:
    return [
        "Koji organ piše na dopisu ili koverti?",
        "Da li postoji broj predmeta / Posl. br. / Broj?",
        "Koji je tip akta: poziv, rešenje, presuda, obaveštenje ili zaključak?",
    ]


def _apply_contextual_overrides(decision: IntakeDecision, question: str) -> IntakeDecision:
    text = question.lower()
    mentions_echr = _contains_echr_reference(text)
    envelope_like = bool(
        re.search(r"\b[apu]\s*[-]?\s*\d{1,6}\s*/\s*(19|20)\d{2}\b", text)
        or any(
            token in text
            for token in ("koverta", "dopis", "posl. br", "broj predmeta", "rešenje", "resenje")
        )
    )
    ambiguous_delivery = _is_ambiguous_delivery_phrase(text)
    e_service_intent = decision.e_service_intent or _infer_e_service_intent(question)

    if e_service_intent == "urgent_safety":
        decision.intent = INTENT_LEGAL_SITUATION_ANALYSIS
        decision.confidence_score = max(decision.confidence_score, 0.9)
        decision.confidence_label = _confidence_label(decision.confidence_score)
        decision.needs_regulation_lookup = False
        decision.needs_case_law_search = False
        decision.needs_e_services_guidance = True
        decision.needs_envelope_clue_analysis = False
        decision.needs_clarification = False
        decision.clarifying_questions = []

    if e_service_intent == "technical_support":
        decision.intent = INTENT_LEGAL_SITUATION_ANALYSIS
        decision.confidence_score = max(decision.confidence_score, 0.82)
        decision.confidence_label = _confidence_label(decision.confidence_score)
        decision.needs_regulation_lookup = False
        decision.needs_case_law_search = False
        decision.needs_e_services_guidance = True
        decision.needs_clarification = False
        decision.clarifying_questions = []

    if envelope_like:
        decision.needs_envelope_clue_analysis = True
        decision.needs_e_services_guidance = True
        if e_service_intent in {"received_letter_or_case_number", "status_check_or_registry"}:
            decision.needs_case_law_search = False
            decision.needs_regulation_lookup = False
            if decision.intent in {INTENT_CASE_LAW_SEARCH, INTENT_OUT_OF_SCOPE}:
                decision.intent = INTENT_LEGAL_SITUATION_ANALYSIS

    if ambiguous_delivery:
        decision.intent = INTENT_CLARIFICATION_NEEDED
        decision.confidence_score = min(decision.confidence_score, 0.58)
        decision.confidence_label = _confidence_label(decision.confidence_score)
        decision.needs_clarification = True
        decision.needs_case_law_search = False
        decision.needs_regulation_lookup = False
        decision.needs_e_services_guidance = True
        decision.needs_envelope_clue_analysis = True
        decision.clarifying_questions = _build_envelope_clarifying_questions()

    if mentions_echr:
        if decision.intent in {INTENT_CLARIFICATION_NEEDED, INTENT_OUT_OF_SCOPE}:
            decision.intent = INTENT_CASE_LAW_SEARCH
        decision.needs_case_law_search = True
        decision.needs_echr_check = True
        decision.needs_clarification = False
        decision.clarifying_questions = []
        decision.confidence_score = max(decision.confidence_score, 0.84)
        decision.confidence_label = _confidence_label(decision.confidence_score)

    if decision.intent == INTENT_CLARIFICATION_NEEDED and not decision.clarifying_questions:
        decision.clarifying_questions = [
            "Da li želite analizu pravne situacije, pronalazak propisa, sudsku praksu ili kombinovano?",
        ]
    if decision.intent == INTENT_CLARIFICATION_NEEDED:
        decision.needs_clarification = True
    return decision


def _apply_low_confidence_guard(decision: IntakeDecision) -> IntakeDecision:
    if decision.confidence_score >= 0.6:
        return decision
    if decision.intent == INTENT_OUT_OF_SCOPE:
        decision.intent = INTENT_CLARIFICATION_NEEDED
    decision.needs_clarification = True
    if not decision.clarifying_questions:
        decision.clarifying_questions = [
            "Možete li ukratko pojasniti pravni kontekst (šta se desilo, kada i ko su strane)?",
        ]
    decision.routing_decision = "clarification"
    return decision


def _build_openai_prompt(
    question: str,
    normalized_query: str,
    entities: list[dict[str, Any]],
) -> str:
    entity_rows = [
        {
            "type": item.get("type", ""),
            "text": item.get("text", ""),
            "normalizedText": item.get("normalizedText", ""),
        }
        for item in entities[:12]
    ]
    return (
        "Analiziraj korisničko pitanje za legal routing.\n"
        "Vrati ISKLJUCIVO validan JSON bez markdown teksta.\n"
        "Dozvoljeni intenti: LEGAL_SITUATION_ANALYSIS, REGULATION_LOOKUP, "
        "CASE_LAW_SEARCH, COMBINED_REGULATION_AND_CASE_LAW, CLARIFICATION_NEEDED, OUT_OF_SCOPE.\n"
        "Ako confidenceScore < 0.6, needsClarification mora biti true.\n"
        "Ne vraćaj objašnjenja van JSON-a.\n\n"
        f"originalQuestion: {question}\n"
        f"normalizedQuestion: {normalized_query}\n"
        f"entities: {json.dumps(entity_rows, ensure_ascii=False)}\n\n"
        "JSON shape:\n"
        "{\n"
        '  "intent": "",\n'
        '  "legalArea": "",\n'
        '  "confidenceScore": 0.0,\n'
        '  "needsClarification": false,\n'
        '  "clarifyingQuestions": [],\n'
        '  "needsRegulationLookup": false,\n'
        '  "needsCaseLawSearch": false,\n'
        '  "needsEServicesGuidance": false,\n'
        '  "needsEnvelopeClueAnalysis": false,\n'
        '  "needsEchrCheck": false,\n'
        '  "possibleRegulations": [],\n'
        '  "possibleServices": [],\n'
        '  "searchQueryForRegulations": "",\n'
        '  "searchQueryForCaseLaw": "",\n'
        '  "eServiceIntent": "",\n'
        '  "routingDecision": ""\n'
        "}\n"
    )


def _classify_with_openai(
    question: str,
    preprocessed: Any,
    entities: list[dict[str, Any]],
) -> IntakeDecision | None:
    if not feature_enabled("ENABLE_LEGAL_INTAKE_AGENT", True):
        return None
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model_name = os.getenv("LEGAL_INTAKE_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    prompt = _build_openai_prompt(question, preprocessed.normalized_query, entities)
    try:
        model = ChatOpenAI(model=model_name, temperature=0, api_key=api_key)
        response = model.invoke(prompt)
    except Exception:
        return None

    payload = _parse_json_from_text(str(getattr(response, "content", "") or ""))
    if not payload:
        return None

    intent = _normalize_intent(payload.get("intent", ""))
    legal_area = str(payload.get("legalArea", "")).strip() or _infer_legal_area(question)
    confidence = _safe_score(payload.get("confidenceScore"), 0.58)
    needs_clarification = _safe_bool(payload.get("needsClarification"), confidence < 0.6)
    clarifying_questions = _safe_list_str(payload.get("clarifyingQuestions"))
    possible_regulations = _safe_list_str(payload.get("possibleRegulations"))
    if not possible_regulations:
        possible_regulations = _infer_possible_regulations(question, legal_area)

    detected_facts = [str(entity.get("text", "")).strip() for entity in entities if entity.get("text")]
    needs_regulation_lookup = _safe_bool(
        payload.get("needsRegulationLookup"),
        intent in {INTENT_REGULATION_LOOKUP, INTENT_COMBINED, INTENT_LEGAL_SITUATION_ANALYSIS},
    )
    needs_case_law_search = _safe_bool(
        payload.get("needsCaseLawSearch"),
        intent in {INTENT_CASE_LAW_SEARCH, INTENT_COMBINED, INTENT_LEGAL_SITUATION_ANALYSIS},
    )
    needs_echr_check = _safe_bool(
        payload.get("needsEchrCheck"),
        intent in {INTENT_LEGAL_SITUATION_ANALYSIS, INTENT_CASE_LAW_SEARCH, INTENT_COMBINED},
    )

    search_reg = str(payload.get("searchQueryForRegulations", "")).strip()
    search_case = str(payload.get("searchQueryForCaseLaw", "")).strip()
    if needs_regulation_lookup and not search_reg:
        search_reg = preprocessed.expanded_query or preprocessed.normalized_query
    if needs_case_law_search and not search_case:
        search_case = preprocessed.expanded_query or preprocessed.normalized_query

    return IntakeDecision(
        intent=intent,
        confidence_score=confidence,
        confidence_label=_confidence_label(confidence),
        legal_area=legal_area,
        user_situation_summary=preprocessed.normalized_query[:280],
        detected_facts=detected_facts[:12],
        missing_facts=[],
        needs_regulation_lookup=needs_regulation_lookup,
        needs_case_law_search=needs_case_law_search,
        needs_e_services_guidance=_safe_bool(
            payload.get("needsEServicesGuidance"),
            _infer_e_service_intent(question) != "",
        ),
        needs_envelope_clue_analysis=_safe_bool(
            payload.get("needsEnvelopeClueAnalysis"),
            bool(
                re.search(
                    r"\b[apu]\s*[-]?\s*\d{1,6}\s*/\s*(19|20)\d{2}\b",
                    question.lower(),
                )
                or any(
                    token in question.lower()
                    for token in ("koverta", "dopis", "posl. br", "broj predmeta", "rešenje", "resenje")
                )
            ),
        ),
        needs_echr_check=needs_echr_check,
        needs_clarification=needs_clarification,
        needs_temporal_validity_check=needs_regulation_lookup,
        possible_regulations=possible_regulations[:6],
        possible_services=_safe_list_str(payload.get("possibleServices"))[:6]
        or _infer_possible_services(question, legal_area),
        e_service_intent=str(payload.get("eServiceIntent", "")).strip() or _infer_e_service_intent(question),
        clarifying_questions=clarifying_questions[:3],
        search_query_for_regulations=search_reg,
        search_query_for_case_law=search_case,
        routing_decision=str(payload.get("routingDecision", "")).strip() or _default_routing(intent),
        reasoning_summary="OpenAI legal intake analiza.",
        intake_source="openai",
        openai_intake_response=payload,
    )


def _classify_with_heuristics(
    question: str,
    preprocessed: Any,
    entities: list[dict[str, Any]],
) -> IntakeDecision:
    text = preprocessed.normalized_query.lower()
    detected_facts = [str(entity.get("text", "")) for entity in entities[:10]]

    regulation_terms = (
        "zakon",
        "propis",
        "član",
        "clan",
        "stav",
        "tačka",
        "obaveza",
        "rok",
        "zabrana",
    )
    case_terms = (
        "presuda",
        "sudska praksa",
        "odluka",
        "rev",
        "kž",
        "kz",
        "kako su sudovi",
        "sličnih presuda",
        "slicnih presuda",
    )
    situation_terms = (
        "šta mogu",
        "sta mogu",
        "da li imam pravo",
        "da li je zakonito",
        "šta da radim",
        "sta da radim",
        "imam problem",
        "tužim",
        "tuzim",
        "šteta",
        "steta",
    )

    wants_regulations = _contains_any(text, regulation_terms) or any(
        entity.get("type") == "LEGAL_ACT" for entity in entities
    )
    wants_case_law = _contains_any(text, case_terms)
    legal_situation = _contains_any(text, situation_terms)
    legal_area = _infer_legal_area(text)
    e_service_intent = _infer_e_service_intent(question)
    possible_services = _infer_possible_services(question, legal_area)
    mentions_echr = _contains_echr_reference(text)
    human_rights_dimension = _has_human_rights_dimension(text)
    envelope_like = bool(
        re.search(r"\b[apu]\s*[-]?\s*\d{1,6}\s*/\s*(19|20)\d{2}\b", question.lower())
        or any(
            token in question.lower()
            for token in (
                "koverta",
                "dopis",
                "posl. br",
                "broj predmeta",
                "rešenje",
                "resenje",
                "stiglo mi je",
            )
        )
    )

    intent = INTENT_CLARIFICATION_NEEDED
    score = 0.45
    reasoning = "Nedovoljno signala za sigurno usmeravanje."

    if wants_regulations and wants_case_law:
        intent = INTENT_COMBINED
        score = 0.85
        reasoning = "Pitanje istovremeno traži propis i sudsku praksu."
    elif wants_case_law:
        intent = INTENT_CASE_LAW_SEARCH
        score = 0.82
        reasoning = "Detektovani izrazi i entiteti upućuju na sudsku praksu."
    elif wants_regulations:
        intent = INTENT_REGULATION_LOOKUP
        score = 0.82
        reasoning = "Detektovani izrazi i entiteti upućuju na propise."
    elif mentions_echr:
        intent = INTENT_CASE_LAW_SEARCH
        score = 0.84
        reasoning = "Detektovano je eksplicitno pominjanje ECHR/Strazbur konteksta."
    elif legal_situation or e_service_intent or possible_services:
        if _contains_any(text, ("stiglo mi je nesto", "stiglo mi je nešto", "stiglo mi je")) and not envelope_like:
            intent = INTENT_CLARIFICATION_NEEDED
            score = 0.55
            reasoning = "Potreban je dodatni kontekst o dopisu/pošiljaocu pre usmeravanja."
        else:
            intent = INTENT_LEGAL_SITUATION_ANALYSIS
            score = 0.76
            reasoning = "Opis životne situacije sugeriše pravnu analizu i praktično usmeravanje."
    elif legal_situation:
        intent = INTENT_LEGAL_SITUATION_ANALYSIS
        score = 0.74
        reasoning = "Opis životne situacije sugeriše pravnu analizu slučaja."
    elif len(question.split()) < 4:
        intent = INTENT_CLARIFICATION_NEEDED
        score = 0.3
        reasoning = "Upit je previše kratak za pouzdanu klasifikaciju."
    elif not _contains_any(
        text,
        (
            "pravo",
            "zakon",
            "sud",
            "presuda",
            "ugovor",
            "rad",
            "obligacion",
            "kriv",
            "parnič",
            "tuž",
            "tuz",
            "nasled",
            "ostavin",
            "predmet",
            "koverta",
            "euprava",
            "uprava",
            "preti",
            "nasilje",
        ),
    ):
        intent = INTENT_OUT_OF_SCOPE
        score = 0.82
        reasoning = "Upit ne deluje kao pravno pitanje."

    confidence_label = _confidence_label(score)
    needs_clarification = confidence_label == "low"
    clarifying_questions: list[str] = []
    missing_facts: list[str] = []
    if confidence_label == "low":
        clarifying_questions = [
            "Da li želite analizu pravne situacije, pronalazak propisa, sudsku praksu ili kombinovano?",
        ]
    elif confidence_label == "medium":
        clarifying_questions = [
            "Razumeo sam pravac upita. Da li želite da uključim i sudsku praksu u odgovor?",
        ]

    if not any(entity.get("type") == "DATE" for entity in entities):
        missing_facts.append("Relevantan datum događaja ili period primene.")
    if intent in {INTENT_CASE_LAW_SEARCH, INTENT_COMBINED} and not any(
        entity.get("type") in {"COURT", "CASE_NUMBER"} for entity in entities
    ):
        missing_facts.append("Naziv suda ili broj predmeta (ako je poznat).")

    search_query_reg = (
        preprocessed.expanded_query
        if wants_regulations or intent in {INTENT_COMBINED, INTENT_LEGAL_SITUATION_ANALYSIS}
        else ""
    )
    search_query_cases = (
        preprocessed.expanded_query
        if wants_case_law or intent in {INTENT_COMBINED, INTENT_CASE_LAW_SEARCH}
        else ""
    )
    possible_regulations = _infer_possible_regulations(question, legal_area)
    needs_e_services_guidance = e_service_intent != "" or _contains_any(
        text,
        (
            "gde da proverim",
            "kome da se obratim",
            "koverta",
            "broj predmeta",
            "euprava",
            "prijavim",
            "ulogujem",
            "umro",
            "preminuo",
            "nasledstvo",
            "ostavina",
            "bojim se",
            "nasilje",
            "preti",
            "hitno",
            "tok predmeta",
            "stiglo",
        ),
    )
    needs_envelope_clue_analysis = envelope_like
    needs_regulation_lookup = intent in {INTENT_REGULATION_LOOKUP, INTENT_COMBINED}
    needs_case_law_search = intent in {INTENT_CASE_LAW_SEARCH, INTENT_COMBINED}

    if intent == INTENT_LEGAL_SITUATION_ANALYSIS:
        if e_service_intent in {
            "technical_support",
            "status_check_or_registry",
            "received_letter_or_case_number",
            "urgent_safety",
        }:
            needs_regulation_lookup = False
            needs_case_law_search = False
            search_query_reg = ""
            search_query_cases = ""
        else:
            needs_regulation_lookup = True
            needs_case_law_search = True

    if mentions_echr:
        needs_case_law_search = True
        if not search_query_cases:
            search_query_cases = preprocessed.expanded_query

    if e_service_intent == "urgent_safety":
        needs_regulation_lookup = False
        needs_case_law_search = False
        search_query_reg = ""
        search_query_cases = ""

    needs_echr_check = mentions_echr or (
        intent
        in {
            INTENT_LEGAL_SITUATION_ANALYSIS,
            INTENT_CASE_LAW_SEARCH,
            INTENT_COMBINED,
        }
        and human_rights_dimension
    )

    if _is_ambiguous_delivery_phrase(text):
        intent = INTENT_CLARIFICATION_NEEDED
        score = 0.58
        confidence_label = _confidence_label(score)
        needs_clarification = True
        needs_regulation_lookup = False
        needs_case_law_search = False
        needs_e_services_guidance = True
        needs_envelope_clue_analysis = True
        reasoning = "Potreban je dodatni kontekst o dokumentu i pošiljaocu."
        clarifying_questions = _build_envelope_clarifying_questions()

    return IntakeDecision(
        intent=intent,
        confidence_score=score,
        confidence_label=confidence_label,
        legal_area=legal_area,
        user_situation_summary=preprocessed.normalized_query[:280],
        detected_facts=detected_facts,
        missing_facts=missing_facts[:3],
        needs_regulation_lookup=needs_regulation_lookup,
        needs_case_law_search=needs_case_law_search,
        needs_e_services_guidance=needs_e_services_guidance,
        needs_envelope_clue_analysis=needs_envelope_clue_analysis,
        needs_echr_check=needs_echr_check,
        needs_clarification=needs_clarification,
        needs_temporal_validity_check=needs_regulation_lookup,
        possible_regulations=possible_regulations,
        possible_services=possible_services,
        e_service_intent=e_service_intent,
        clarifying_questions=clarifying_questions[:3],
        search_query_for_regulations=search_query_reg,
        search_query_for_case_law=search_query_cases,
        routing_decision=_default_routing(intent),
        reasoning_summary=reasoning,
        intake_source="heuristic",
    )


def classify_intent(
    question: str,
    preprocessed: Any,
    entities: list[dict[str, Any]],
) -> IntakeDecision:
    openai_decision = _classify_with_openai(question, preprocessed, entities)
    if openai_decision is not None:
        return _apply_low_confidence_guard(_apply_contextual_overrides(openai_decision, question))
    heuristic_decision = _classify_with_heuristics(question, preprocessed, entities)
    return _apply_low_confidence_guard(_apply_contextual_overrides(heuristic_decision, question))
