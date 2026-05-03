from __future__ import annotations

import io
import time
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from api.core.processor import (
    DocumentProcessingError,
    StoredDocument,
    ensure_documents_dir,
    parse_and_normalize_file,
    persist_upload,
)
from api.core.rag import rag_engine
from api.services.case_law_retriever import CaseLawRetriever
from api.services.config import get_feature_flags, get_retrieval_limits
from api.services.echr_checker import search_echr_analogies
from api.services.e_services_guide import search_e_services_guide
from api.services.entity_recognition_and_linking import entity_service
from api.services.legal_act_parser import LegalActParser
from api.services.legal_intake_agent import (
    INTENT_LEGAL_SITUATION_ANALYSIS,
    INTENT_CASE_LAW_SEARCH,
    INTENT_CLARIFICATION_NEEDED,
    INTENT_COMBINED,
    INTENT_OUT_OF_SCOPE,
    INTENT_REGULATION_LOOKUP,
    classify_intent,
)
from api.services.norm_analyzer import NormAnalyzer
from api.services.pis_on_demand_fetcher import PisOnDemandFetcher
from api.services.post_answer_survey import save_post_answer_survey
from api.services.query_preprocessor import preprocess_query
from api.services.research_interaction_logger import interaction_logger
from api.services.temporal_validity_checker import TemporalValidityChecker

app = FastAPI(title="LexVibe API", version="1.0.0")

RESEARCH_NOTICE = (
    "Vaše pitanje, odgovor sistema i dobrovoljna ocena mogu biti sačuvani "
    "u anonimizovanom obliku radi istraživanja i unapređenja sistema. "
    "Ne unosite osetljive lične podatke."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str = Field(min_length=3, max_length=3000)
    sessionId: str | None = None


class MiniFeedbackRequest(BaseModel):
    interactionId: str
    sessionId: str
    helpfulness: str
    problemTypes: list[str] = Field(default_factory=list)
    freeComment: str = ""


class UploadResponse(BaseModel):
    status: str
    filename: str
    chunks_added: int


class BatchUploadResponse(BaseModel):
    status: str
    uploaded: list[UploadResponse]
    failed: list[dict]


class ReindexResponse(BaseModel):
    status: str
    chunks_indexed: int
    files_processed: int


class ChatResponse(BaseModel):
    answer: str
    citations: list[dict]
    structured: dict | None = None
    interactionId: str | None = None
    surveyEnabled: bool = False
    researchNotice: str | None = None


class SurveyRequest(BaseModel):
    interactionId: str
    usefulness: str
    sourceRelevance: str
    clarity: str
    wouldUseAgain: str
    freeComment: str = ""


class SurveyResponse(BaseModel):
    status: str
    saved: bool
    surveyId: str | None = None


class StatsResponse(BaseModel):
    total_decisions: int
    total_courts: int
    top_courts: list[dict]
    total_law_gazette_items: int


def _format_eservice_section(recommendations: list[dict]) -> str:
    if not recommendations:
        return ""
    lines: list[str] = [
        "Gde možete proveriti / šta možete uraditi online:",
    ]
    for item in recommendations[:2]:
        name = str(item.get("serviceName") or "Servis")
        institution = str(item.get("institution") or "Nadležna institucija")
        url = str(item.get("serviceUrl") or item.get("url") or "").strip()
        instruction = str(
            item.get("readyInstruction") or item.get("readyToUseInstructionCopy") or ""
        ).strip()
        prep = str(item.get("prepareBefore") or item.get("whatUserCanPrepare") or "").strip()
        eid = str(item.get("needsEid") or item.get("needs_eid") or "nije poznato")
        fee = str(item.get("possibleFeeInfo") or item.get("possible_fee_info") or "nije navedeno")
        lines.append(f"- {name} ({institution})")
        if instruction:
            lines.append(f"  - Šta možete uraditi: {instruction}")
        if prep:
            lines.append(f"  - Pripremite: {prep}")
        lines.append(f"  - eID: {eid}; taksa: {fee}")
        if url:
            lines.append(f"  - Link: {url}")
    return "\n".join(lines)


def _format_contact_section(contacts: list[dict]) -> str:
    if not contacts:
        return ""
    lines: list[str] = ["Kome možete da se obratite:"]
    for row in contacts[:2]:
        org_name = str(row.get("orgName") or row.get("institution") or "Kontakt")
        contact_type = str(row.get("contactType") or "kontakt")
        contact_value = str(
            row.get("phone")
            or row.get("email")
            or row.get("portalUrl")
            or row.get("fallbackIfUnreachable")
            or ""
        ).strip()
        script = str(row.get("scriptForAgentCopy") or "").strip()
        lines.append(f"- {org_name} ({contact_type})")
        if contact_value:
            lines.append(f"  - Kontakt: {contact_value}")
        if script:
            lines.append(f"  - Napomena: {script}")
    return "\n".join(lines)


def _format_unexpected_upload_error(exc: Exception) -> str:
    return (
        "Dokument nije moguće obraditi. Proverite da li fajl sadrži čitljiv tekst i "
        f"nije oštećen. Detalj: {exc}"
    )


def _assert_admin_authorized(request: Request) -> None:
    admin_cookie = request.cookies.get("lexvibe_admin")
    if admin_cookie != "ok":
        raise HTTPException(status_code=401, detail="Administratorska autentikacija je obavezna.")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": "lexvibe-api"}


@app.get("/api/stats", response_model=StatsResponse)
async def stats() -> StatsResponse:
    return StatsResponse(**rag_engine.get_dashboard_stats())


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    started = time.perf_counter()
    session_id = payload.sessionId or str(uuid4())
    flags = get_feature_flags()
    k_config = get_retrieval_limits()

    preprocessed = preprocess_query(payload.query)
    query_for_retrieval = preprocessed.expanded_query or preprocessed.normalized_query
    query_entities = entity_service.extract(preprocessed.normalized_query, source="user_query")
    intake = classify_intent(payload.query, preprocessed, query_entities)
    openai_response = intake.openai_intake_response or intake.to_json()
    print(
        "[legal-intake-debug]",
        {
            "originalQuestion": payload.query,
            "openAiIntakeResponse": openai_response,
            "detectedIntent": intake.intent,
            "routingDecision": intake.routing_decision,
        },
    )

    if intake.intent == INTENT_CLARIFICATION_NEEDED:
        answer = (
            intake.clarifying_questions[0]
            if intake.clarifying_questions
            else (
                "Da li želite da analiziram pravnu situaciju, pronađem propis, "
                "sudsku praksu ili kombinovani odgovor?"
            )
        )
        interaction_id = interaction_logger.log(
            {
                "sessionId": session_id,
                "originalQuestion": payload.query,
                "normalizedQuestion": preprocessed.normalized_query,
                "detectedIntent": intake.intent,
                "confidenceScore": intake.confidence_score,
                "legalArea": intake.legal_area,
                "openAiIntakeResponse": openai_response,
                "whetherClarificationAsked": True,
                "usedRegulationLookup": False,
                "usedCaseLawSearch": False,
                "usedPISFetch": False,
                "cacheHit": False,
                "usedLegalActParser": False,
                "usedTemporalValidityChecker": False,
                "retrievedRegulations": [],
                "retrievedCases": [],
                "finalAnswer": answer,
                "modelUsed": "routing-only",
                "latencyMs": int((time.perf_counter() - started) * 1000),
                "errors": [],
                "entityMap": entity_service.build_entity_map(query_entities, [], []),
            }
        )
        print(
            "[legal-routing-debug]",
            {
                "originalQuestion": payload.query,
                "detectedIntent": intake.intent,
                "routingDecision": intake.routing_decision,
                "pisLookupCalled": False,
                "caseLawSearchCalled": False,
            },
        )
        return ChatResponse(
            answer=answer,
            citations=[],
            structured={"intent": intake.intent, "intake": intake.to_json()},
            interactionId=interaction_id,
            surveyEnabled=flags.enable_post_answer_survey,
            researchNotice=RESEARCH_NOTICE,
        )

    if intake.intent == INTENT_OUT_OF_SCOPE and intake.confidence_score >= 0.6:
        answer = (
            "Pitanje deluje van pravnog domena ove aplikacije. "
            "Postavite pravno pitanje ili navedite pravni kontekst."
        )
        interaction_id = interaction_logger.log(
            {
                "sessionId": session_id,
                "originalQuestion": payload.query,
                "normalizedQuestion": preprocessed.normalized_query,
                "detectedIntent": intake.intent,
                "confidenceScore": intake.confidence_score,
                "legalArea": intake.legal_area,
                "openAiIntakeResponse": openai_response,
                "whetherClarificationAsked": False,
                "usedRegulationLookup": False,
                "usedCaseLawSearch": False,
                "usedPISFetch": False,
                "cacheHit": False,
                "usedLegalActParser": False,
                "usedTemporalValidityChecker": False,
                "retrievedRegulations": [],
                "retrievedCases": [],
                "finalAnswer": answer,
                "modelUsed": "routing-only",
                "latencyMs": int((time.perf_counter() - started) * 1000),
                "errors": [],
                "entityMap": entity_service.build_entity_map(query_entities, [], []),
            }
        )
        print(
            "[legal-routing-debug]",
            {
                "originalQuestion": payload.query,
                "detectedIntent": intake.intent,
                "routingDecision": intake.routing_decision,
                "pisLookupCalled": False,
                "caseLawSearchCalled": False,
            },
        )
        return ChatResponse(
            answer=answer,
            citations=[],
            structured={"intent": intake.intent, "intake": intake.to_json()},
            interactionId=interaction_id,
            surveyEnabled=flags.enable_post_answer_survey,
            researchNotice=RESEARCH_NOTICE,
        )

    pis_fetcher = PisOnDemandFetcher()
    legal_parser = LegalActParser()
    temporal_checker = TemporalValidityChecker()
    case_law_retriever = CaseLawRetriever()
    norm_analyzer = NormAnalyzer()

    regulation_rows: list[dict] = []
    regulation_entities: list[dict] = []
    case_rows: list[dict] = []
    case_entities: list[dict] = []
    e_services_rows: list[dict] = []
    e_services_contacts: list[dict] = []
    e_services_envelope_clues: list[dict] = []
    e_services_topk = {
        "eServicesInitialResultsCount": 0,
        "eServicesRerankedResultsCount": 0,
        "eServicesDisplayedResultsCount": 0,
    }
    echr_result: dict = {
        "echrCheckPerformed": False,
        "possibleConventionArticles": [],
        "serbiaSearchPerformed": False,
        "serbiaSimilarCaseFound": False,
        "serbiaCondemnedOrViolationFound": False,
        "serbiaCasesFound": [],
        "otherEchrAnalogies": [],
        "echrAnalysis": "",
        "echrLimitations": "",
        "errors": [],
        "echrTriggeredBy": "",
        "hudocQuerySerbia": "",
        "hudocQueryGeneral": "",
        "echrAnalogyConfidence": "low",
        "serbiaHudocInitialResultsCount": 0,
        "serbiaHudocRerankedResultsCount": 0,
        "serbiaHudocAnalyzedResultsCount": 0,
        "generalHudocInitialResultsCount": 0,
        "generalHudocRerankedResultsCount": 0,
        "generalHudocAnalyzedResultsCount": 0,
        "echrDisplayedResultsCount": 0,
    }
    citations: list[dict] = []
    cache_hit = False
    used_pis_fetch = False
    errors: list[str] = []
    fallbacks_used: list[str] = []

    try:
        should_use_regulation = bool(intake.needs_regulation_lookup)
        if should_use_regulation:
            hit = pis_fetcher.search_relevant_act(intake.search_query_for_regulations or query_for_retrieval)
            if hit:
                used_pis_fetch = True
                cached = pis_fetcher.get_cached_act_if_fresh(hit["act_id"])
                if cached:
                    cache_hit = True
                    fetched_payload = {
                        "actId": cached.act_id,
                        "title": cached.title,
                        "sourceUrl": cached.source_url,
                        "validFrom": cached.valid_from,
                        "validTo": cached.valid_to,
                        "status": cached.status,
                        "validityConfidence": cached.validity_confidence,
                        "rawText": cached.raw_text,
                        "rawHtml": cached.raw_html,
                        **cached.metadata,
                    }
                else:
                    fetched = pis_fetcher.fetch_act_by_url_or_id(hit["act_id"], hit["source_url"])
                    fetched_payload = (
                        {
                            "actId": fetched.act_id,
                            "title": fetched.title,
                            "sourceUrl": fetched.source_url,
                            "validFrom": fetched.valid_from,
                            "validTo": fetched.valid_to,
                            "status": fetched.status,
                            "validityConfidence": fetched.validity_confidence,
                            "rawText": fetched.raw_text,
                            "rawHtml": fetched.raw_html,
                            **fetched.metadata,
                        }
                        if fetched
                        else None
                    )
                if fetched_payload:
                    parsed = (
                        legal_parser.parse(fetched_payload)
                        if flags.enable_legal_act_parser
                        else {
                            "actTitle": fetched_payload.get("title", ""),
                            "sourceUrl": fetched_payload.get("sourceUrl", ""),
                            "normChunks": [],
                            "parsingConfidence": "low",
                            "validFrom": fetched_payload.get("validFrom", ""),
                            "validTo": fetched_payload.get("validTo", ""),
                            "status": fetched_payload.get("status", "unknown"),
                            "validityConfidence": fetched_payload.get("validityConfidence", "low"),
                        }
                    )
                    validity = temporal_checker.check(payload.query, parsed)
                    chunks = parsed.get("normChunks", []) or []
                    regulation_rows = [
                        {
                            "citationLabel": chunk.get("citation_label", ""),
                            "sourceUrl": chunk.get("source_url", parsed.get("sourceUrl", "")),
                            "text": chunk.get("norm_text", ""),
                            "validityStatus": validity.get("validity_status", parsed.get("status", "unknown")),
                            "validityConfidence": validity.get(
                                "validity_confidence",
                                chunk.get("validity_confidence", "low"),
                            ),
                        }
                        for chunk in chunks[:6]
                    ]
                    if not regulation_rows:
                        regulation_rows = [
                            {
                                "citationLabel": parsed.get("actTitle", ""),
                                "sourceUrl": parsed.get("sourceUrl", ""),
                                "text": fetched_payload.get("rawText", "")[:800],
                                "validityStatus": validity.get("validity_status", parsed.get("status", "unknown")),
                                "validityConfidence": validity.get("validity_confidence", "low"),
                            }
                        ]
                    regulation_entities = entity_service.extract(
                        "\n".join(row.get("text", "") for row in regulation_rows), source="regulation"
                    )
                    citations.extend(
                        {
                            "source": row.get("sourceUrl", ""),
                            "chunk": idx + 1,
                            "confidence": 0.75,
                            "vector_score": 0.0,
                            "bm25_score": 0.0,
                            "hybrid_score": 0.0,
                            "court": "",
                            "decision_number": row.get("citationLabel", ""),
                            "excerpt": row.get("text", "")[:260],
                        }
                        for idx, row in enumerate(regulation_rows)
                    )

        should_use_case_law = bool(intake.needs_case_law_search)
        domestic_topk = {
            "domesticCaseTopKUsed": should_use_case_law,
            "domesticInitialResultsCount": 0,
            "domesticRerankedResultsCount": 0,
            "domesticAnalyzedResultsCount": 0,
            "domesticDisplayedResultsCount": 0,
            "hudocTopKUsed": False,
        }
        if should_use_case_law:
            case_rows, domestic_topk = case_law_retriever.search(
                intake.search_query_for_case_law or query_for_retrieval,
                extracted_facts=intake.detected_facts,
                initial_k=k_config.domestic_case_initial_k,
                reranked_k=k_config.domestic_case_reranked_k,
                analyze_k=k_config.domestic_case_analyze_k,
                display_k=k_config.max_domestic_cases_in_answer,
            )
            case_entities = entity_service.extract(
                "\n".join(case.get("summary", "") for case in case_rows), source="case_law"
            )
            citations.extend(
                {
                    "source": case.get("sourceUrl", ""),
                    "chunk": 0,
                    "confidence": case.get("similarityScore", 0.0),
                    "vector_score": case.get("similarityScore", 0.0),
                    "bm25_score": 0.0,
                    "hybrid_score": case.get("similarityScore", 0.0),
                    "court": case.get("court", ""),
                    "decision_number": case.get("caseNumber", ""),
                    "excerpt": case.get("summary", "")[:260],
                }
                for case in case_rows
            )

        should_use_e_services = bool(
            flags.enable_e_services_guide
            and (intake.needs_e_services_guidance or intake.needs_envelope_clue_analysis)
        )
        if should_use_e_services:
            e_services_result = search_e_services_guide(
                {
                    "userQuestion": payload.query,
                    "detectedIntent": intake.intent,
                    "legalArea": intake.legal_area,
                    "extractedEntities": query_entities,
                    "eServiceIntent": intake.e_service_intent,
                    "topK": 10,
                }
            )
            maybe_services = e_services_result.get("services", [])
            maybe_contacts = e_services_result.get("contacts", [])
            maybe_envelope = e_services_result.get("envelopeClues", [])
            e_services_rows = maybe_services if isinstance(maybe_services, list) else []
            e_services_contacts = maybe_contacts if isinstance(maybe_contacts, list) else []
            e_services_envelope_clues = maybe_envelope if isinstance(maybe_envelope, list) else []
            topk_metrics = e_services_result.get("topKMetrics", {})
            if isinstance(topk_metrics, dict):
                e_services_topk.update(topk_metrics)

        echr_should_run = bool(intake.needs_echr_check)
        if echr_should_run:
            echr_result = search_echr_analogies(
                {
                    "userQuestion": payload.query,
                    "extractedFacts": intake.detected_facts,
                    "possibleConventionArticles": [],
                    "preferSerbiaCases": True,
                    "maxResults": k_config.max_echr_cases_in_answer,
                    "serbiaInitialK": k_config.serbia_hudoc_initial_k,
                    "serbiaRerankedK": k_config.serbia_hudoc_reranked_k,
                    "serbiaAnalyzeK": k_config.serbia_hudoc_analyze_k,
                    "generalInitialK": k_config.general_hudoc_initial_k,
                    "generalRerankedK": k_config.general_hudoc_reranked_k,
                    "generalAnalyzeK": k_config.general_hudoc_analyze_k,
                    "triggeredBy": (
                        "explicit_user_request"
                        if any(
                            token in payload.query.lower()
                            for token in (
                                "echr",
                                "esljp",
                                "hudoc",
                                "strasbourg",
                                "evropski sud za ljudska prava",
                                "evropska konvencija",
                            )
                        )
                        else "legal_situation"
                        if intake.intent == INTENT_LEGAL_SITUATION_ANALYSIS
                        else "case_law_search"
                        if intake.intent == INTENT_CASE_LAW_SEARCH
                        else "combined_answer"
                    ),
                }
            )
            topk_metrics = echr_result.get("topKMetrics", {})
            if isinstance(topk_metrics, dict):
                echr_result.update(topk_metrics)
        print(
            "[legal-routing-debug]",
            {
                "originalQuestion": payload.query,
                "detectedIntent": intake.intent,
                "routingDecision": intake.routing_decision,
                "pisLookupCalled": should_use_regulation,
                "caseLawSearchCalled": should_use_case_law,
            },
        )

        legal_intent = intake.intent in {
            INTENT_LEGAL_SITUATION_ANALYSIS,
            INTENT_REGULATION_LOOKUP,
            INTENT_CASE_LAW_SEARCH,
            INTENT_COMBINED,
        }
        should_skip_generic_rag_fallback = (
            legal_intent or should_use_regulation or should_use_case_law or should_use_e_services
        )

        if (
            not regulation_rows
            and not case_rows
            and not e_services_rows
            and not should_skip_generic_rag_fallback
        ):
            fallback = rag_engine.answer(query_for_retrieval)
            answer = fallback["answer"]
            citations = fallback.get("citations", [])
            fallbacks_used.append("rag-engine-answer")
            structured = {
                "intent": intake.intent,
                "intake": intake.to_json(),
                "fallbackUsed": True,
            }
        else:
            analysis = norm_analyzer.analyze(
                user_summary=intake.user_situation_summary,
                regulation_rows=regulation_rows,
                case_rows=case_rows,
                e_services_rows=e_services_rows,
            )
            answer_parts = [
                analysis.short_answer,
                analysis.analysis,
            ]
            if should_use_case_law and not case_rows:
                fallbacks_used.append("continued-without-case-law")
                answer_parts.append(
                    "Nisam pronašao dovoljno relevantnu sudsku praksu u dostupnoj lokalnoj bazi, "
                    "ali mogu da vas usmerim kroz relevantan propis, moguće praktične korake i dostupne e-servise."
                )
            if should_use_regulation and not regulation_rows:
                fallbacks_used.append("pis-lookup-unavailable-or-empty")
                answer_parts.append(
                    "Relevantan propis trenutno nije potvrđen iz PIS izvora. "
                    "Ako želite, mogu da pokušam uži upit po tačnom nazivu propisa ili članu."
                )
                if intake.possible_regulations:
                    suggested = ", ".join(intake.possible_regulations[:3])
                    answer_parts.append(
                        f"Mogući relevantni propisi za proveru: {suggested} (nije potvrđeno iz PIS izvora)."
                    )
            if intake.needs_envelope_clue_analysis and not e_services_rows:
                answer_parts.append(
                    "Da bih vas precizno usmerio, pošaljite samo podatke koji su vidljivi na dopisu/koverti: "
                    "1) koji organ piše, 2) da li postoji broj predmeta/Posl. br./Broj, "
                    "3) tip akta (poziv, rešenje, presuda, obaveštenje)."
                )
            e_services_section = _format_eservice_section(e_services_rows)
            if e_services_section:
                answer_parts.append(e_services_section)
            contacts_section = _format_contact_section(e_services_contacts)
            if contacts_section:
                answer_parts.append(contacts_section)
            disclaimer = (
                "Odgovor je informativan i ne predstavlja pravni savet."
            )
            answer = "\n\n".join(part for part in answer_parts if part)
            answer = f"{answer}\n\n{disclaimer}"
            echr_section = ""
            if echr_result.get("echrCheckPerformed"):
                if echr_result.get("serbiaSimilarCaseFound") and echr_result.get(
                    "serbiaCondemnedOrViolationFound"
                ):
                    echr_section = (
                        "\n\nProvera prakse Evropskog suda za ljudska prava:\n"
                        "U HUDOC praksi postoji predmet protiv Srbije koji može biti relevantna analogija "
                        "i u njemu je utvrđena povreda Konvencije. Potrebno je detaljno uporediti činjenice.\n"
                    )
                elif echr_result.get("serbiaSimilarCaseFound"):
                    echr_section = (
                        "\n\nProvera prakse Evropskog suda za ljudska prava:\n"
                        "Postoji predmet protiv Srbije sa delimičnom sličnošću, ali ishod nije nužno povreda "
                        "Konvencije. Potrebno je pažljivo uporediti činjenični okvir.\n"
                    )
                elif echr_result.get("otherEchrAnalogies"):
                    echr_section = (
                        "\n\nProvera prakse Evropskog suda za ljudska prava:\n"
                        "Nisam našao dovoljno blizak predmet protiv Srbije, ali postoje relevantni evropski "
                        "standardi iz predmeta protiv drugih država.\n"
                    )
                else:
                    echr_section = (
                        "\n\nProvera prakse Evropskog suda za ljudska prava:\n"
                        "Na osnovu dostupne HUDOC pretrage nisam pronašao dovoljno pouzdanu analognu praksu.\n"
                    )
            if echr_result.get("errors") and echr_should_run:
                echr_section = (
                    "\n\nProvera prakse Evropskog suda za ljudska prava trenutno nije dostupna.\n"
                )
            elif echr_result.get("echrCheckPerformed"):
                echr_section = (
                    f"{echr_section}\nProvera je izvršena kroz ciljanu top-k HUDOC pretragu. "
                    "Prvo su provereni predmeti protiv Srbije, a zatim, ako nije pronađena dovoljna "
                    "analogija, šira praksa Evropskog suda za ljudska prava.\n"
                )
            if case_rows:
                answer = (
                    f"{answer}\n\nPrikazujem najrelevantnije pronađene odluke prema dostupnoj top-k pretrazi."
                )
            answer = f"{answer}{echr_section}"
            structured = {
                "intent": intake.intent,
                "intake": intake.to_json(),
                "continuedWithoutCaseLaw": bool(should_use_case_law and not case_rows),
                "shortAnswer": analysis.short_answer,
                "relevantRegulations": analysis.regulation_rows,
                "similarCases": analysis.case_rows,
                "eServices": {
                    "recommendedServices": e_services_rows,
                    "recommendedContacts": e_services_contacts,
                    "envelopeClues": e_services_envelope_clues,
                    "topKMetrics": e_services_topk,
                },
                "analysis": analysis.analysis,
                "limitations": analysis.limitations,
                "echrCheck": {
                    "echrCheckPerformed": echr_result.get("echrCheckPerformed", False),
                    "possibleConventionArticles": echr_result.get(
                        "possibleConventionArticles", []
                    ),
                    "serbiaSearchPerformed": echr_result.get("serbiaSearchPerformed", False),
                    "serbiaSimilarCaseFound": echr_result.get("serbiaSimilarCaseFound", False),
                    "serbiaCondemnedOrViolationFound": echr_result.get(
                        "serbiaCondemnedOrViolationFound", False
                    ),
                    "serbiaCasesFound": echr_result.get("serbiaCasesFound", []),
                    "otherEchrAnalogies": echr_result.get("otherEchrAnalogies", []),
                    "echrAnalysis": echr_result.get("echrAnalysis", ""),
                    "echrLimitations": echr_result.get("echrLimitations", ""),
                    "errors": echr_result.get("errors", []),
                },
                "topK": {
                    **domestic_topk,
                    **e_services_topk,
                    "hudocTopKUsed": bool(echr_result.get("echrCheckPerformed", False)),
                    "serbiaHudocInitialResultsCount": echr_result.get(
                        "serbiaHudocInitialResultsCount", 0
                    ),
                    "serbiaHudocRerankedResultsCount": echr_result.get(
                        "serbiaHudocRerankedResultsCount", 0
                    ),
                    "serbiaHudocAnalyzedResultsCount": echr_result.get(
                        "serbiaHudocAnalyzedResultsCount", 0
                    ),
                    "generalHudocInitialResultsCount": echr_result.get(
                        "generalHudocInitialResultsCount", 0
                    ),
                    "generalHudocRerankedResultsCount": echr_result.get(
                        "generalHudocRerankedResultsCount", 0
                    ),
                    "generalHudocAnalyzedResultsCount": echr_result.get(
                        "generalHudocAnalyzedResultsCount", 0
                    ),
                    "echrDisplayedResultsCount": echr_result.get("echrDisplayedResultsCount", 0),
                },
            }

        interaction_id = interaction_logger.log(
            {
                "sessionId": session_id,
                "originalQuestion": payload.query,
                "normalizedQuestion": preprocessed.normalized_query,
                "detectedIntent": intake.intent,
                "confidenceScore": intake.confidence_score,
                "legalArea": intake.legal_area,
                "needsRegulationLookup": bool(intake.needs_regulation_lookup),
                "needsCaseLawSearch": bool(intake.needs_case_law_search),
                "needsEServicesGuidance": bool(intake.needs_e_services_guidance),
                "openAiIntakeResponse": openai_response,
                "whetherClarificationAsked": False,
                "pisLookupAttempted": bool(should_use_regulation),
                "pisLookupSuccess": bool(regulation_rows),
                "usedRegulationLookup": bool(regulation_rows),
                "caseLawSearchAttempted": bool(should_use_case_law),
                "usedCaseLawSearch": bool(case_rows),
                "caseLawResultsFound": len(case_rows),
                "usedPISFetch": used_pis_fetch,
                "cacheHit": cache_hit,
                "usedLegalActParser": flags.enable_legal_act_parser,
                "usedTemporalValidityChecker": flags.enable_temporal_validity_check,
                "retrievedRegulations": regulation_rows,
                "retrievedCases": case_rows,
                "continuedWithoutCaseLaw": bool(should_use_case_law and not case_rows),
                "eServicesGuidanceUsed": bool(e_services_rows),
                "recommendedServiceIds": [
                    row.get("serviceId")
                    for row in e_services_rows
                    if isinstance(row, dict) and row.get("serviceId")
                ],
                "fallbacksUsed": fallbacks_used,
                "finalAnswer": answer,
                "modelUsed": "gpt-4o-mini",
                "latencyMs": int((time.perf_counter() - started) * 1000),
                "errors": errors,
                "echrCheckPerformed": echr_result.get("echrCheckPerformed", False),
                "echrTriggeredBy": echr_result.get("echrTriggeredBy", ""),
                "possibleConventionArticles": echr_result.get("possibleConventionArticles", []),
                "serbiaSearchPerformed": echr_result.get("serbiaSearchPerformed", False),
                "serbiaSimilarCaseFound": echr_result.get("serbiaSimilarCaseFound", False),
                "serbiaCondemnedOrViolationFound": echr_result.get(
                    "serbiaCondemnedOrViolationFound", False
                ),
                "hudocQuerySerbia": echr_result.get("hudocQuerySerbia", ""),
                "hudocQueryGeneral": echr_result.get("hudocQueryGeneral", ""),
                "serbiaCasesFound": echr_result.get("serbiaCasesFound", []),
                "otherEchrCasesFound": echr_result.get("otherEchrAnalogies", []),
                "echrAnalogyConfidence": echr_result.get("echrAnalogyConfidence", "low"),
                "echrErrors": echr_result.get("errors", []),
                "domesticCaseTopKUsed": domestic_topk.get("domesticCaseTopKUsed", False),
                "domesticInitialResultsCount": domestic_topk.get("domesticInitialResultsCount", 0),
                "domesticRerankedResultsCount": domestic_topk.get("domesticRerankedResultsCount", 0),
                "domesticAnalyzedResultsCount": domestic_topk.get("domesticAnalyzedResultsCount", 0),
                "domesticDisplayedResultsCount": domestic_topk.get("domesticDisplayedResultsCount", 0),
                "eServicesInitialResultsCount": e_services_topk.get(
                    "eServicesInitialResultsCount", 0
                ),
                "eServicesRerankedResultsCount": e_services_topk.get(
                    "eServicesRerankedResultsCount", 0
                ),
                "eServicesDisplayedResultsCount": e_services_topk.get(
                    "eServicesDisplayedResultsCount", 0
                ),
                "hudocTopKUsed": bool(echr_result.get("echrCheckPerformed", False)),
                "serbiaHudocInitialResultsCount": echr_result.get(
                    "serbiaHudocInitialResultsCount", 0
                ),
                "serbiaHudocRerankedResultsCount": echr_result.get(
                    "serbiaHudocRerankedResultsCount", 0
                ),
                "serbiaHudocAnalyzedResultsCount": echr_result.get(
                    "serbiaHudocAnalyzedResultsCount", 0
                ),
                "generalHudocInitialResultsCount": echr_result.get(
                    "generalHudocInitialResultsCount", 0
                ),
                "generalHudocRerankedResultsCount": echr_result.get(
                    "generalHudocRerankedResultsCount", 0
                ),
                "generalHudocAnalyzedResultsCount": echr_result.get(
                    "generalHudocAnalyzedResultsCount", 0
                ),
                "echrDisplayedResultsCount": echr_result.get("echrDisplayedResultsCount", 0),
                "entityMap": entity_service.build_entity_map(
                    query_entities,
                    regulation_entities,
                    case_entities,
                ),
            }
        )

        return ChatResponse(
            answer=answer,
            citations=citations[:8],
            structured=structured,
            interactionId=interaction_id,
            surveyEnabled=flags.enable_post_answer_survey,
            researchNotice=RESEARCH_NOTICE,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Greška pri obradi upita: {exc}",
        ) from exc


@app.post("/api/survey", response_model=SurveyResponse)
async def save_survey(payload: SurveyRequest) -> SurveyResponse:
    try:
        result = save_post_answer_survey(
            {
                "interactionId": payload.interactionId,
                "usefulness": payload.usefulness,
                "sourceRelevance": payload.sourceRelevance,
                "clarity": payload.clarity,
                "wouldUseAgain": payload.wouldUseAgain,
                "freeComment": payload.freeComment,
            }
        )
        return SurveyResponse(
            status="ok",
            saved=bool(result.get("saved")),
            surveyId=result.get("surveyId"),
        )
    except Exception:
        # Survey is optional and must not break chat flow.
        return SurveyResponse(status="ok", saved=False, surveyId=None)


@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    _assert_admin_authorized(request)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nedostaje naziv fajla.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Otpremljeni dokument je prazan.")

    ensure_documents_dir()
    try:
        destination = persist_upload(file.filename, raw_bytes)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Storage nije dostupan za upis dokumenata na ovoj instanci. "
                "Za produkciju koristite trajni storage (npr. Supabase Storage/S3)."
            ),
        ) from exc

    try:
        parsed = parse_and_normalize_file(file.filename, io.BytesIO(raw_bytes))
        chunks_added = rag_engine.add_documents([parsed])
    except DocumentProcessingError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=_format_unexpected_upload_error(exc),
        ) from exc

    return UploadResponse(status="ok", filename=file.filename, chunks_added=chunks_added)


@app.post("/api/upload-multiple", response_model=BatchUploadResponse)
async def upload_multiple_documents(
    request: Request, files: list[UploadFile] = File(...)
) -> BatchUploadResponse:
    _assert_admin_authorized(request)
    if not files:
        raise HTTPException(status_code=400, detail="Nijedan fajl nije prosleđen.")

    uploaded: list[UploadResponse] = []
    failed: list[dict] = []

    ensure_documents_dir()

    for file in files:
        if not file.filename:
            failed.append({"filename": "", "detail": "Nedostaje naziv fajla."})
            continue

        raw_bytes = await file.read()
        if not raw_bytes:
            failed.append({"filename": file.filename, "detail": "Otpremljeni dokument je prazan."})
            continue

        try:
            destination = persist_upload(file.filename, raw_bytes)
        except OSError:
            failed.append(
                {
                    "filename": file.filename,
                    "detail": (
                        "Storage nije dostupan za upis dokumenata na ovoj instanci. "
                        "Za produkciju koristite trajni storage (npr. Supabase Storage/S3)."
                    ),
                }
            )
            continue
        try:
            parsed = parse_and_normalize_file(file.filename, io.BytesIO(raw_bytes))
            chunks_added = rag_engine.add_documents([parsed])
            uploaded.append(
                UploadResponse(status="ok", filename=file.filename, chunks_added=chunks_added)
            )
        except DocumentProcessingError as exc:
            destination.unlink(missing_ok=True)
            failed.append({"filename": file.filename, "detail": str(exc)})
        except Exception as exc:
            destination.unlink(missing_ok=True)
            failed.append(
                {
                    "filename": file.filename,
                    "detail": _format_unexpected_upload_error(exc),
                }
            )

    return BatchUploadResponse(status="ok", uploaded=uploaded, failed=failed)


@app.post("/api/reindex", response_model=ReindexResponse)
async def reindex_documents(request: Request) -> ReindexResponse:
    _assert_admin_authorized(request)
    try:
        documents_dir = ensure_documents_dir()
        stored_documents: list[StoredDocument] = []
        for path in documents_dir.iterdir():
            if path.is_file():
                with path.open("rb") as handle:
                    stored_documents.append(parse_and_normalize_file(path.name, handle))

        chunks_indexed = rag_engine.rebuild_index(stored_documents)
        return ReindexResponse(
            status="ok",
            chunks_indexed=chunks_indexed,
            files_processed=len(stored_documents),
        )
    except DocumentProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reindeksiranje nije uspelo: {exc}") from exc
