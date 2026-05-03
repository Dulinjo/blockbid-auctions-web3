from __future__ import annotations

from importlib import reload

from api.services.entity_recognition_and_linking import build_entity_map, extract_entities
import api.services.entity_recognition_and_linking as entity_module
from api.services.legal_act_parser import LegalActParser
from api.services.legal_intake_agent import (
    INTENT_CASE_LAW_SEARCH,
    INTENT_REGULATION_LOOKUP,
    classify_intent,
)
from api.services.pis_on_demand_fetcher import PisOnDemandFetcher
from api.services.post_answer_survey import save_post_answer_survey
from api.services.query_preprocessor import preprocess_query
from api.services.research_interaction_logger import interaction_logger
from api.services.temporal_validity_checker import TemporalValidityChecker


def test_intake_classifies_regulation_lookup() -> None:
    preprocessed = preprocess_query("Koji član Zakona o radu uređuje otkazni rok?")
    entities = extract_entities(preprocessed.normalized_query, source="user_query")
    decision = classify_intent("Koji član Zakona o radu uređuje otkazni rok?", preprocessed, entities)
    assert decision.intent == INTENT_REGULATION_LOOKUP
    assert decision.needs_regulation_lookup is True


def test_intake_classifies_case_law_search() -> None:
    preprocessed = preprocess_query("Da li postoji presuda Vrhovnog kasacionog suda Rev 123/2021?")
    entities = extract_entities(preprocessed.normalized_query, source="user_query")
    decision = classify_intent(
        "Da li postoji presuda Vrhovnog kasacionog suda Rev 123/2021?",
        preprocessed,
        entities,
    )
    assert decision.intent == INTENT_CASE_LAW_SEARCH
    assert decision.needs_case_law_search is True


def test_legal_act_parser_extracts_article_paragraph_and_point() -> None:
    parser = LegalActParser()
    parsed = parser.parse(
        {
            "title": "Zakon o radu",
            "sourceUrl": "https://example.test/zakon-o-radu",
            "validFrom": "2020-01-01",
            "validTo": "",
            "status": "važeći",
            "validityConfidence": "medium",
            "rawText": (
                "Član 5\n"
                "(1) Zaposleni ima pravo na zaradu.\n"
                "1) pravo na naknadu troškova\n"
                "(2) Poslodavac je dužan da obezbedi bezbednost.\n"
            ),
        }
    )
    assert parsed["parsingConfidence"] in {"high", "medium"}
    assert parsed["articles"]
    first_article = parsed["articles"][0]
    assert first_article["articleNumber"] == "5"
    assert first_article["paragraphs"][0]["paragraphNumber"] == "1"
    assert first_article["paragraphs"][0]["points"][0]["pointNumber"] == "1"
    assert parsed["normChunks"]


def test_temporal_validity_checker_fallback_without_act() -> None:
    checker = TemporalValidityChecker()
    result = checker.check("Šta je važilo 2021. godine za otkaz?", parsed_act=None)
    assert result["validity_confidence"] in {"low", "medium", "high"}
    assert result["validity_status"] == "unknown"


def test_pis_fetcher_fallback_when_url_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("SLUZBENI_GLASNIK_API_URL", raising=False)
    fetcher = PisOnDemandFetcher()
    assert fetcher.search_relevant_act("Zakon o radu") is None
    assert fetcher.fetch_act_by_url_or_id("123", "https://example.test") is None


def test_research_logger_nonblocking_and_entity_map_shape() -> None:
    user_entities = extract_entities("Zakon o radu član 5 danas", source="user_query")
    entity_map = build_entity_map(user_entities, [], [])
    interaction_id = interaction_logger.log(
        {
            "sessionId": "test-session",
            "originalQuestion": "Test pitanje",
            "normalizedQuestion": "test pitanje",
            "detectedIntent": "REGULATION_LOOKUP",
            "confidenceScore": 0.8,
            "legalArea": "radno pravo",
            "whetherClarificationAsked": False,
            "usedRegulationLookup": True,
            "usedCaseLawSearch": False,
            "usedPISFetch": False,
            "cacheHit": False,
            "usedLegalActParser": True,
            "usedTemporalValidityChecker": True,
            "retrievedRegulations": [],
            "retrievedCases": [],
            "finalAnswer": "ok",
            "modelUsed": "test",
            "latencyMs": 1,
            "errors": [],
            "entityMap": entity_map,
        }
    )
    assert interaction_id
    assert "userQueryEntities" in entity_map
    assert "linkedArticleReferences" in entity_map


def test_survey_save_returns_shape() -> None:
    result = save_post_answer_survey(
        {
            "interactionId": "iid",
            "usefulness": "yes",
            "sourceRelevance": "partial",
            "clarity": "yes",
            "wouldUseAgain": "maybe",
            "freeComment": "test",
        }
    )
    assert "saved" in result


def test_entity_recognition_disabled_fallback(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_ENTITY_RECOGNITION", "false")
    reloaded = reload(entity_module)
    entities = reloaded.extract_entities("Zakon o radu član 5", source="user_query")
    assert entities == []
