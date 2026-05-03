from __future__ import annotations

from dataclasses import dataclass
from typing import Any


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
    needs_temporal_validity_check: bool
    clarifying_questions: list[str]
    search_query_for_regulations: str
    search_query_for_case_law: str
    routing_decision: str
    reasoning_summary: str

    def to_json(self) -> dict:
        return {
            "intent": self.intent,
            "confidenceScore": round(self.confidence_score, 3),
            "confidenceLabel": self.confidence_label,
            "legalArea": self.legal_area,
            "userSituationSummary": self.user_situation_summary,
            "detectedFacts": self.detected_facts,
            "missingFacts": self.missing_facts,
            "needsRegulationLookup": self.needs_regulation_lookup,
            "needsCaseLawSearch": self.needs_case_law_search,
            "needsTemporalValidityCheck": self.needs_temporal_validity_check,
            "clarifyingQuestions": self.clarifying_questions,
            "searchQueryForRegulations": self.search_query_for_regulations,
            "searchQueryForCaseLaw": self.search_query_for_case_law,
            "routingDecision": self.routing_decision,
            "reasoningSummary": self.reasoning_summary,
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


def classify_intent(
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
        "broj predmeta",
        "kako su sudovi",
    )
    situation_terms = (
        "šta mogu",
        "sta mogu",
        "da li imam pravo",
        "da li je zakonito",
        "šta da radim",
        "sta da radim",
        "imam problem",
    )

    wants_regulations = _contains_any(text, regulation_terms) or any(
        entity.get("type") == "LEGAL_ACT" for entity in entities
    )
    wants_case_law = _contains_any(text, case_terms) or any(
        entity.get("type") in {"COURT", "CASE_NUMBER"} for entity in entities
    )
    legal_situation = _contains_any(text, situation_terms)

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
        ),
    ):
        intent = INTENT_OUT_OF_SCOPE
        score = 0.9
        reasoning = "Upit ne deluje kao pravno pitanje."

    confidence_label = _confidence_label(score)
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

    search_query_reg = preprocessed.expanded_query if wants_regulations or intent == INTENT_COMBINED else ""
    search_query_cases = preprocessed.expanded_query if wants_case_law or intent == INTENT_COMBINED else ""

    routing = (
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

    legal_area = "opšte pravo"
    if _contains_any(text, ("rad", "otkaz", "zaposlen")):
        legal_area = "radno pravo"
    elif _contains_any(text, ("ugovor", "obligacion", "štet", "stet")):
        legal_area = "obligaciono pravo"
    elif _contains_any(text, ("kriv", "kz", "kž", "kazn")):
        legal_area = "krivično pravo"
    elif _contains_any(text, ("parnič", "parnic", "tužb", "tuzb")):
        legal_area = "parnično pravo"

    return IntakeDecision(
        intent=intent,
        confidence_score=score,
        confidence_label=confidence_label,
        legal_area=legal_area,
        user_situation_summary=preprocessed.normalized_query[:280],
        detected_facts=detected_facts,
        missing_facts=missing_facts[:3],
        needs_regulation_lookup=intent
        in {INTENT_REGULATION_LOOKUP, INTENT_COMBINED, INTENT_LEGAL_SITUATION_ANALYSIS},
        needs_case_law_search=intent
        in {INTENT_CASE_LAW_SEARCH, INTENT_COMBINED, INTENT_LEGAL_SITUATION_ANALYSIS},
        needs_temporal_validity_check=intent
        in {
            INTENT_REGULATION_LOOKUP,
            INTENT_COMBINED,
            INTENT_LEGAL_SITUATION_ANALYSIS,
        },
        clarifying_questions=clarifying_questions[:3],
        search_query_for_regulations=search_query_reg,
        search_query_for_case_law=search_query_cases,
        routing_decision=routing,
        reasoning_summary=reasoning,
    )
