from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from api.services.config import feature_enabled

ECHR_EXPLICIT_TERMS = (
    "echr",
    "esljp",
    "european court of human rights",
    "evropski sud za ljudska prava",
    "strasbourg",
    "strazbur",
    "hudoc",
    "evropska konvencija",
    "evropsku konvenciju",
    "konvencija",
    "ljudska prava",
)

ECHR_TRIGGER_TERMS = (
    "pritvor",
    "lišavanje slobode",
    "lisenje slobode",
    "policija",
    "diskriminacija",
    "privatnost",
    "izražavanja",
    "izrazavanja",
    "duzina postupka",
    "razumnom roku",
    "delotvorni pravni lek",
    "imovina",
    "eksproprijacija",
    "sudjenje",
    "sudenje",
    "državni organ",
    "drzavni organ",
)

ARTICLE_RULES: list[tuple[str, str, tuple[str, ...]]] = [
    ("Article 2", "pravo na život", ("život", "ubistvo", "smrt", "smrtni ishod")),
    (
        "Article 3",
        "zabrana mučenja i nečovečnog postupanja",
        ("policijsko nasilje", "mučenje", "ponižavajuće", "ponizavajuce", "zlostavljanje"),
    ),
    ("Article 5", "pravo na slobodu i bezbednost", ("pritvor", "zadržavanje", "lisenje slobode")),
    (
        "Article 6",
        "pravo na pravično suđenje",
        (
            "suđenje",
            "sudjenje",
            "razumnom roku",
            "duzina postupka",
            "dugo trajanje postupka",
            "postupak traje",
            "izvrsenje presude",
        ),
    ),
    ("Article 8", "privatni i porodični život", ("privatnost", "nadzor", "telefon", "poruke", "dom")),
    ("Article 9", "sloboda misli i veroispovesti", ("veroispovest", "religija", "savest")),
    ("Article 10", "sloboda izražavanja", ("izrazavanja", "izražavanja", "mediji", "govor")),
    ("Article 11", "sloboda okupljanja i udruživanja", ("okupljanja", "udruživanja", "protest")),
    ("Article 13", "delotvorni pravni lek", ("delotvorni pravni lek", "nema pravnog leka")),
    ("Article 14", "zabrana diskriminacije", ("diskriminacija", "nejednako postupanje")),
    ("Protocol No. 1 Article 1", "zaštita imovine", ("imovina", "eksproprijacija", "oduzimanje")),
    ("Protocol No. 1 Article 2", "pravo na obrazovanje", ("obrazovanje", "škola", "skola")),
    ("Protocol No. 1 Article 3", "pravo na slobodne izbore", ("izbori", "glasanje")),
]


@dataclass(slots=True)
class EchrSearchInput:
    user_question: str
    extracted_facts: list[str]
    possible_convention_articles: list[str] | None = None
    prefer_serbia_cases: bool = True
    max_results: int = 3
    serbia_initial_k: int = 20
    serbia_reranked_k: int = 5
    serbia_analyze_k: int = 3
    general_initial_k: int = 20
    general_reranked_k: int = 5
    general_analyze_k: int = 3


def _normalize_violation(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "unknown"
    if "violation" in text and "no violation" not in text:
        return "violation"
    if "no violation" in text:
        return "no_violation"
    if "inadmiss" in text:
        return "inadmissible"
    if "struck out" in text:
        return "struck_out"
    if "friendly settlement" in text:
        return "friendly_settlement"
    return "unknown"


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _float_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _article_slug(article: str) -> str:
    match = re.search(r"\d+", article)
    if article.startswith("Protocol No. 1 Article ") and match:
        return f"p1-{match.group(0)}"
    if match:
        return match.group(0)
    return article


def _build_hudoc_query(articles: list[str], text_terms: str, respondent: str | None = None) -> str:
    parts: list[str] = []
    if respondent:
        parts.append(f'respondent:"{respondent}"')
    if articles:
        article_tokens = [f"article:{_article_slug(article)}" for article in articles]
        parts.append("(" + " OR ".join(article_tokens) + ")")
    if text_terms:
        parts.append(f'"{text_terms}"')
    return " AND ".join(parts)


def _extract_articles(question: str, facts: list[str]) -> list[dict[str, Any]]:
    text = f"{question}\n{' '.join(facts)}".lower()
    rows: list[dict[str, Any]] = []
    for article, right, terms in ARTICLE_RULES:
        matched = [term for term in terms if term in text]
        if not matched:
            continue
        confidence = "high" if len(matched) >= 2 else "medium"
        rows.append(
            {
                "article": article,
                "right": right,
                "reason": f"Detektovani termini: {', '.join(matched[:3])}",
                "confidence": confidence,
            }
        )
    if not rows:
        return []
    return rows


def _build_echr_search_query(question: str, article_rows: list[dict[str, Any]]) -> str:
    lowered = question.lower()
    base_terms = ["Serbia"]
    if any(
        term in lowered
        for term in (
            "razumnom roku",
            "dugo trajanje postupka",
            "duzina postupka",
            "dužina postupka",
            "reasonable time",
            "length of proceedings",
        )
    ):
        base_terms.extend(["length of proceedings", "reasonable time"])
    seen: set[str] = set()
    for row in article_rows:
        article = str(row.get("article", "")).strip()
        if not article:
            continue
        token = article.replace("Protocol No. 1 ", "").strip()
        if token in seen:
            continue
        seen.add(token)
        base_terms.append(token)
    return " ".join(base_terms)


def _is_echr_relevant(question: str, facts: list[str], entities: list[dict[str, Any]]) -> tuple[bool, str]:
    lowered = question.lower()
    if any(term in lowered for term in ECHR_EXPLICIT_TERMS):
        return True, "explicit_user_request"
    if any(term in lowered for term in ECHR_TRIGGER_TERMS):
        return True, "legal_situation"
    if any(entity.get("type") in {"COURT", "INSTITUTION", "DATE"} for entity in entities):
        facts_joined = " ".join(facts).lower()
        if any(term in facts_joined for term in ECHR_TRIGGER_TERMS):
            return True, "case_law_search"
    return False, ""


def _row_get(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row[key] not in {None, ""}:
            return row[key]
    return None


class EchrChecker:
    def __init__(self) -> None:
        self.enabled = feature_enabled("ENABLE_ECHR_CHECK", True)
        self._echr_available = False
        self._get_echr = None
        self._load_error = ""
        if self.enabled:
            self._load_library()

    def _load_library(self) -> None:
        try:
            from echr_extractor import get_echr  # type: ignore

            self._get_echr = get_echr
            self._echr_available = True
        except Exception as exc:  # pragma: no cover - depends on runtime package
            self._load_error = str(exc)
            self._echr_available = False

    def search_echr_analogies(self, payload: EchrSearchInput) -> dict[str, Any]:
        serbia_initial_k = max(int(getattr(payload, "serbia_initial_k", 20) or 20), 1)
        serbia_reranked_k = max(int(getattr(payload, "serbia_reranked_k", 5) or 5), 1)
        serbia_analyze_k = max(int(getattr(payload, "serbia_analyze_k", 3) or 3), 1)
        general_initial_k = max(int(getattr(payload, "general_initial_k", 20) or 20), 1)
        general_reranked_k = max(int(getattr(payload, "general_reranked_k", 5) or 5), 1)
        general_analyze_k = max(int(getattr(payload, "general_analyze_k", 3) or 3), 1)
        max_cases_in_answer = max(int(getattr(payload, "max_results", 3) or 3), 1)
        base_result = {
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
            "otherEchrCasesFound": [],
            "echrAnalogyConfidence": "low",
            "searchQueryForEchr": "",
            "topKMetrics": {
                "serbiaHudocInitialResultsCount": 0,
                "serbiaHudocRerankedResultsCount": 0,
                "serbiaHudocAnalyzedResultsCount": 0,
                "generalHudocInitialResultsCount": 0,
                "generalHudocRerankedResultsCount": 0,
                "generalHudocAnalyzedResultsCount": 0,
                "echrDisplayedResultsCount": 0,
            },
        }
        if not self.enabled:
            base_result["echrLimitations"] = (
                "Provera prakse Evropskog suda za ljudska prava je trenutno isključena."
            )
            return base_result

        possible_articles = _extract_articles(payload.user_question, payload.extracted_facts)
        explicit_articles = payload.possible_convention_articles or []
        if explicit_articles:
            known = {item["article"] for item in possible_articles}
            for article in explicit_articles:
                if article in known:
                    continue
                possible_articles.append(
                    {
                        "article": article,
                        "right": "ručno prosleđen član",
                        "reason": "Prosleđeno iz internog mapiranja.",
                        "confidence": "medium",
                    }
                )
        base_result["possibleConventionArticles"] = possible_articles
        base_result["searchQueryForEchr"] = _build_echr_search_query(
            payload.user_question,
            possible_articles,
        )

        text_entities = [
            {"type": "DATE"} if re.search(r"(19|20)\d{2}", payload.user_question) else {}
        ]
        is_relevant, triggered_by = _is_echr_relevant(
            payload.user_question,
            payload.extracted_facts,
            text_entities,
        )
        base_result["echrTriggeredBy"] = triggered_by
        if not is_relevant:
            base_result["echrLimitations"] = "ECHR provera nije prepoznata kao relevantna za ovaj upit."
            return base_result

        base_result["echrCheckPerformed"] = True
        if not self._echr_available or self._get_echr is None:
            base_result["errors"].append(
                self._load_error or "echr-extractor nije dostupan u okruženju."
            )
            base_result["echrLimitations"] = (
                "Prepoznao sam da pitate za praksu Evropskog suda za ljudska prava o pravu na suđenje u "
                "razumnom roku. Automatska HUDOC provera trenutno nije dostupna, ali ovo se tipično vezuje "
                "za član 6 Evropske konvencije, a često i član 13 u vezi sa delotvornim pravnim lekom."
            )
            return base_result

        article_list = [item["article"] for item in possible_articles]
        terms_source = (payload.user_question + " " + " ".join(payload.extracted_facts)).strip()
        words = [token for token in re.findall(r"[a-zA-Z]{4,}", terms_source) if token]
        terms = " ".join(words[:8])

        serbia_query = _build_hudoc_query(article_list, terms, respondent="Serbia")
        general_query = _build_hudoc_query(article_list, terms, respondent=None)
        base_result["hudocQuerySerbia"] = serbia_query
        base_result["hudocQueryGeneral"] = general_query

        try:
            serbia_initial_rows = self._query_hudoc(
                serbia_query,
                limit=max(serbia_initial_k, payload.max_results, 3),
            )
            base_result["serbiaSearchPerformed"] = True
            serbia_cases_all = [
                self._format_case_row(row, default_state="Serbia") for row in serbia_initial_rows
            ]
            serbia_cases_reranked = self._rerank_cases(
                payload.user_question,
                payload.extracted_facts,
                article_list,
                serbia_cases_all,
                serbia_reranked_k,
            )
            serbia_cases_analyzed = serbia_cases_reranked[:serbia_analyze_k]
            base_result["serbiaCasesFound"] = serbia_cases_analyzed[
                : min(payload.max_results, max_cases_in_answer)
            ]
            base_result["serbiaSimilarCaseFound"] = bool(base_result["serbiaCasesFound"])
            base_result["serbiaCondemnedOrViolationFound"] = any(
                case["violation"] == "violation" for case in base_result["serbiaCasesFound"]
            )

            other_cases: list[dict[str, Any]] = []
            if not base_result["serbiaSimilarCaseFound"]:
                general_initial_rows = self._query_hudoc(
                    general_query,
                    limit=max(general_initial_k, payload.max_results, 3),
                )
                general_cases_all: list[dict[str, Any]] = []
                for row in general_initial_rows:
                    case = self._format_case_row(row, default_state="")
                    if case["respondentState"].lower() == "serbia":
                        continue
                    general_cases_all.append(case)
                other_cases = self._rerank_cases(
                    payload.user_question,
                    payload.extracted_facts,
                    article_list,
                    general_cases_all,
                    general_reranked_k,
                )
                analyzed_other = other_cases[:general_analyze_k]
                base_result["otherEchrAnalogies"] = analyzed_other[
                    : min(payload.max_results, max_cases_in_answer)
                ]
            else:
                general_initial_rows = []
                other_cases = []
            base_result["otherEchrCasesFound"] = base_result["otherEchrAnalogies"]

            displayed = len(base_result["serbiaCasesFound"]) + len(base_result["otherEchrAnalogies"])
            base_result["topKMetrics"] = {
                "serbiaHudocInitialResultsCount": len(serbia_initial_rows),
                "serbiaHudocRerankedResultsCount": len(serbia_cases_reranked),
                "serbiaHudocAnalyzedResultsCount": len(serbia_cases_analyzed),
                "generalHudocInitialResultsCount": len(general_initial_rows),
                "generalHudocRerankedResultsCount": len(other_cases),
                "generalHudocAnalyzedResultsCount": min(
                    len(other_cases),
                    general_analyze_k,
                ),
                "echrDisplayedResultsCount": min(displayed, max_cases_in_answer),
            }

            base_result["echrAnalysis"] = self._build_analysis(base_result)
            base_result["echrLimitations"] = (
                "HUDOC rezultati su korišćeni kao analogija; potrebna je detaljna pravna analiza činjenica."
            )
            base_result["echrAnalogyConfidence"] = self._confidence_label(base_result)
            return base_result
        except Exception as exc:  # pragma: no cover - external network path
            base_result["errors"].append(str(exc))
            base_result["echrLimitations"] = (
                "Prepoznao sam da pitate za praksu Evropskog suda za ljudska prava o pravu na suđenje u "
                "razumnom roku. Automatska HUDOC provera trenutno nije dostupna, ali ovo se tipično vezuje "
                "za član 6 Evropske konvencije, a često i član 13 u vezi sa delotvornim pravnim lekom."
            )
            return base_result

    def _rerank_cases(
        self,
        user_question: str,
        extracted_facts: list[str],
        possible_articles: list[str],
        cases: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        query = f"{user_question} {' '.join(extracted_facts)}".lower()
        fact_tokens = [token for token in re.findall(r"[a-zA-ZčćžšđČĆŽŠĐ]{3,}", query)]
        article_tokens = {token.lower() for token in possible_articles}
        reranked: list[dict[str, Any]] = []
        for case in cases:
            text_blob = " ".join(
                [
                    str(case.get("caseTitle", "")),
                    str(case.get("conclusion", "")),
                    " ".join(str(item) for item in case.get("articles", [])),
                    str(case.get("respondentState", "")),
                ]
            ).lower()
            overlap = sum(1 for token in fact_tokens if token in text_blob)
            score = float(case.get("relevanceScore", 0.0))
            score += min(overlap / 20.0, 0.25)
            case_articles = {str(item).lower() for item in case.get("articles", [])}
            if article_tokens and case_articles.intersection(article_tokens):
                score += 0.15
            if str(case.get("respondentState", "")).lower() == "serbia":
                score += 0.1
            if case.get("violation") == "violation":
                score += 0.05
            case["relevanceScore"] = round(min(score, 1.0), 3)
            reranked.append(case)
        reranked.sort(key=lambda item: float(item.get("relevanceScore", 0.0)), reverse=True)
        return reranked[: max(top_k, 1)]

    def _query_hudoc(self, query_payload: str, limit: int) -> list[dict[str, Any]]:
        assert self._get_echr is not None
        frame = self._get_echr(  # type: ignore[misc]
            query_payload=query_payload,
            language=["ENG"],
            count=limit,
            save_file="n",
        )
        rows: list[dict[str, Any]] = []
        if hasattr(frame, "to_dict"):
            try:
                rows = frame.to_dict(orient="records")  # type: ignore[assignment]
            except Exception:
                rows = []
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict)]

    def _format_case_row(self, row: dict[str, Any], default_state: str) -> dict[str, Any]:
        respondent = _to_text(_row_get(row, "respondent", "respondentState", "respondentstate")) or default_state
        title = _to_text(_row_get(row, "docname", "caseTitle", "title"))
        app_no = _to_text(_row_get(row, "appno", "applicationnumber", "applicationNumber"))
        decision_date = _to_text(_row_get(row, "judgementdate", "decisionDate", "date"))
        articles_raw = _to_text(_row_get(row, "article", "articles"))
        conclusion = _to_text(_row_get(row, "conclusion", "violation"))
        violation_value = _normalize_violation(_row_get(row, "violation", "conclusion"))
        item_id = _to_text(_row_get(row, "itemid", "id"))
        raw_url = _to_text(_row_get(row, "url"))
        url = raw_url or (f"https://hudoc.echr.coe.int/eng?i={item_id}" if item_id else "")
        importance = _float_or_zero(_row_get(row, "importance", "score", "relevance"))
        relevance = round(min(max(importance / 4.0 if importance > 0 else 0.58, 0.0), 1.0), 3)
        articles = [part.strip() for part in re.split(r"[;,]+", articles_raw) if part.strip()]
        return {
            "caseTitle": title,
            "applicationNumber": app_no,
            "decisionDate": decision_date,
            "respondentState": respondent,
            "articles": articles,
            "conclusion": conclusion,
            "violation": violation_value,
            "url": url,
            "whyAnalogous": "Slična činjenična i pravna pitanja prema HUDOC pretrazi.",
            "importantDifferences": "Potrebno je uporediti specifične domaće procesne činjenice i dokazni kontekst.",
            "relevanceScore": relevance,
        }

    def _build_analysis(self, result: dict[str, Any]) -> str:
        serbia_cases = result.get("serbiaCasesFound", [])
        other_cases = result.get("otherEchrAnalogies", [])
        if serbia_cases and result.get("serbiaCondemnedOrViolationFound"):
            return (
                "Pronađena je relevantna praksa protiv Srbije sa utvrđenom povredom Konvencije "
                "u srodnom činjeničnom okviru."
            )
        if serbia_cases:
            return (
                "Pronađen je predmet protiv Srbije sa delimičnom analogijom, ali bez jasne potvrde "
                "povrede Konvencije u istim okolnostima."
            )
        if other_cases:
            return (
                "Nisu pronađeni dovoljno slični predmeti protiv Srbije; prikazan je evropski standard "
                "na osnovu predmeta protiv drugih država."
            )
        return "Na osnovu dostupne HUDOC pretrage nije pronađena pouzdana analogija."

    def _confidence_label(self, result: dict[str, Any]) -> str:
        serbia_cases = result.get("serbiaCasesFound", [])
        if serbia_cases:
            top_score = max(float(case.get("relevanceScore", 0.0)) for case in serbia_cases)
            if top_score >= 0.75:
                return "high"
            if top_score >= 0.55:
                return "medium"
            return "low"
        other_cases = result.get("otherEchrAnalogies", [])
        if other_cases:
            return "medium"
        return "low"


echr_checker = EchrChecker()


def search_echr_analogies(payload: dict[str, Any]) -> dict[str, Any]:
    prepared = EchrSearchInput(
        user_question=str(payload.get("userQuestion", "")),
        extracted_facts=[
            str(item) for item in payload.get("extractedFacts", []) if isinstance(item, (str, int, float))
        ],
        possible_convention_articles=[
            str(item)
            for item in payload.get("possibleConventionArticles", [])
            if isinstance(item, (str, int, float))
        ],
        prefer_serbia_cases=bool(payload.get("preferSerbiaCases", True)),
        max_results=max(int(payload.get("maxResults", 3) or 3), 1),
        serbia_initial_k=max(int(payload.get("serbiaInitialK", 20) or 20), 1),
        serbia_reranked_k=max(int(payload.get("serbiaRerankedK", 5) or 5), 1),
        serbia_analyze_k=max(int(payload.get("serbiaAnalyzeK", 3) or 3), 1),
        general_initial_k=max(int(payload.get("generalInitialK", 20) or 20), 1),
        general_reranked_k=max(int(payload.get("generalRerankedK", 5) or 5), 1),
        general_analyze_k=max(int(payload.get("generalAnalyzeK", 3) or 3), 1),
    )
    result = echr_checker.search_echr_analogies(prepared)
    triggered_by = str(payload.get("triggeredBy", "")).strip()
    if triggered_by:
        result["echrTriggeredBy"] = triggered_by
    return result

