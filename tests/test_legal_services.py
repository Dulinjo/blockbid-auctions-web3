from __future__ import annotations

from importlib import reload

from api.services.entity_recognition_and_linking import build_entity_map, extract_entities
import api.services.entity_recognition_and_linking as entity_module
import api.services.echr_checker as echr_module
from api.services.echr_checker import search_echr_analogies
from api.services.legal_act_parser import LegalActParser
from api.services.legal_intake_agent import (
    INTENT_CASE_LAW_SEARCH,
    INTENT_LEGAL_SITUATION_ANALYSIS,
    INTENT_REGULATION_LOOKUP,
    classify_intent,
)
from api.services.pis_on_demand_fetcher import PisOnDemandFetcher
from api.services.post_answer_survey import save_post_answer_survey
from api.services.query_preprocessor import preprocess_query
from api.services.research_interaction_logger import interaction_logger
from api.services.temporal_validity_checker import TemporalValidityChecker
from api.services.case_law_retriever import rerank_and_limit_cases


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


def test_intake_low_confidence_prefers_clarification_over_out_of_scope(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")
    preprocessed = preprocess_query("hmm ok")
    entities = extract_entities(preprocessed.normalized_query, source="user_query")
    decision = classify_intent("hmm ok", preprocessed, entities)
    assert decision.confidence_score < 0.6
    assert decision.intent != "OUT_OF_SCOPE"
    assert decision.intent == "CLARIFICATION_NEEDED"


def test_intake_situation_in_plain_language_maps_to_legal_situation(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")
    question = "Pao sam sa trotineta koga da tuzim"
    preprocessed = preprocess_query(question)
    entities = extract_entities(preprocessed.normalized_query, source="user_query")
    decision = classify_intent(question, preprocessed, entities)
    assert decision.intent == INTENT_LEGAL_SITUATION_ANALYSIS
    assert decision.needs_regulation_lookup is True
    assert decision.needs_case_law_search is True
    assert decision.needs_echr_check is True
    assert decision.possible_regulations


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


def test_echr_checker_fallback_when_library_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_ECHR_CHECK", "true")
    result = search_echr_analogies(
        {
            "userQuestion": "Da li mi je povređeno pravo na suđenje u razumnom roku?",
            "extractedFacts": ["postupak traje 9 godina", "državni organ nije reagovao"],
            "possibleConventionArticles": ["Article 6"],
            "preferSerbiaCases": True,
            "maxResults": 2,
            "triggeredBy": "explicit_user_request",
        }
    )
    assert "echrCheckPerformed" in result
    assert "serbiaSearchPerformed" in result
    assert "echrLimitations" in result
    assert "errors" in result


def test_echr_mapping_detects_article6_for_length_of_proceedings() -> None:
    result = search_echr_analogies(
        {
            "userQuestion": "Postupak traje 8 godina i nemam delotvorni pravni lek.",
            "extractedFacts": ["dugo trajanje postupka", "nema pravnog leka"],
            "possibleConventionArticles": [],
            "preferSerbiaCases": True,
            "maxResults": 2,
            "triggeredBy": "legal_situation",
        }
    )
    article_ids = [item.get("article") for item in result.get("possibleConventionArticles", [])]
    assert "Article 6" in article_ids
    assert "Article 13" in article_ids


def test_echr_search_fallback_when_feature_disabled(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_ECHR_CHECK", "false")
    reloaded = reload(echr_module)
    result = reloaded.search_echr_analogies(
        {
            "userQuestion": "Da li je povređeno pravo na suđenje u razumnom roku?",
            "extractedFacts": ["postupak traje 7 godina"],
            "possibleConventionArticles": [],
            "preferSerbiaCases": True,
            "maxResults": 3,
            "triggeredBy": "explicit_user_request",
        }
    )
    assert result["echrCheckPerformed"] is False
    assert "isključena" in result["echrLimitations"]


def test_case_law_retriever_top_k_limits() -> None:
    rows = [
        {"similarityScore": 0.10, "summary": "A", "legalArea": "radno pravo", "court": "Apelacioni sud"},
        {"similarityScore": 0.91, "summary": "B", "legalArea": "radno pravo", "court": "Apelacioni sud"},
        {"similarityScore": 0.73, "summary": "C", "legalArea": "radno pravo", "court": "Apelacioni sud"},
        {"similarityScore": 0.51, "summary": "D", "legalArea": "radno pravo", "court": "Apelacioni sud"},
    ]
    ranked = rerank_and_limit_cases(
        rows,
        query="otkaz i rok",
        extracted_facts=["otkaz", "rok"],
        reranked_k=3,
        analyze_k=2,
        max_in_answer=1,
    )
    assert len(ranked["reranked"]) == 3
    assert len(ranked["analyzed"]) == 2
    assert len(ranked["displayed"]) == 1
    assert ranked["displayed"][0]["relevanceLabel"] in {"high", "medium", "low"}


def test_echr_top_k_counts_present() -> None:
    result = search_echr_analogies(
        {
            "userQuestion": "Da li je povređeno pravo na suđenje u razumnom roku?",
            "extractedFacts": ["postupak traje 9 godina"],
            "possibleConventionArticles": ["Article 6"],
            "preferSerbiaCases": True,
            "maxResults": 3,
            "triggeredBy": "explicit_user_request",
        }
    )
    metrics = result.get("topKMetrics", {})
    for key in (
        "serbiaHudocInitialResultsCount",
        "serbiaHudocRerankedResultsCount",
        "serbiaHudocAnalyzedResultsCount",
        "generalHudocInitialResultsCount",
        "generalHudocRerankedResultsCount",
        "generalHudocAnalyzedResultsCount",
        "echrDisplayedResultsCount",
    ):
        assert key in metrics
