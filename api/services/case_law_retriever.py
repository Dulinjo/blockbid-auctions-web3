from __future__ import annotations

import re
from typing import Any

from api.core.rag import rag_engine
from api.services.config import feature_enabled


class CaseLawRetriever:
    def __init__(self) -> None:
        self.enabled = feature_enabled("ENABLE_CASE_LAW_SEARCH", True)

    def search(
        self,
        query: str,
        extracted_facts: list[str] | None = None,
        initial_k: int = 50,
        reranked_k: int = 10,
        analyze_k: int = 3,
        display_k: int = 3,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if not self.enabled:
            return [], {
                "domesticCaseTopKUsed": False,
                "domesticInitialResultsCount": 0,
                "domesticRerankedResultsCount": 0,
                "domesticAnalyzedResultsCount": 0,
                "domesticDisplayedResultsCount": 0,
            }

        normalized = query.strip()
        if extracted_facts:
            normalized = f"{normalized}\nFakti: {'; '.join(extracted_facts)}"
        initial_candidates = rag_engine.search_case_law(normalized, top_k=initial_k)
        ranked = rerank_and_limit_cases(
            initial_candidates,
            query=normalized,
            extracted_facts=extracted_facts or [],
            reranked_k=reranked_k,
            analyze_k=analyze_k,
            max_in_answer=display_k,
        )
        reranked = ranked["reranked"]
        analyzed = ranked["analyzed"]
        displayed = ranked["displayed"]
        return displayed, {
            "domesticCaseTopKUsed": True,
            "domesticInitialResultsCount": len(initial_candidates),
            "domesticRerankedResultsCount": len(reranked),
            "domesticAnalyzedResultsCount": len(analyzed),
            "domesticDisplayedResultsCount": len(displayed),
        }

    def _rerank_candidates(self, query: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        query_tokens = self._tokenize(query)
        scored: list[tuple[float, dict[str, Any]]] = []
        for candidate in candidates:
            summary = str(candidate.get("summary") or "")
            citation = str(candidate.get("citationLabel") or "")
            combined_text = f"{summary} {citation}".strip()
            overlap = self._token_overlap(query_tokens, self._tokenize(combined_text))
            semantic = float(candidate.get("similarityScore") or 0.0)
            freshness = 0.05 if candidate.get("decisionDate") else 0.0
            quality = 0.05 if candidate.get("court") and candidate.get("caseNumber") else 0.0
            rerank_score = round((semantic * 0.65) + (overlap * 0.25) + freshness + quality, 3)
            row = dict(candidate)
            row["similarityScore"] = rerank_score
            if rerank_score >= 0.78:
                row["relevanceLabel"] = "high"
            elif rerank_score >= 0.56:
                row["relevanceLabel"] = "medium"
            else:
                row["relevanceLabel"] = "low"
            scored.append((rerank_score, row))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [row for _, row in scored]

    def _token_overlap(self, left: set[str], right: set[str]) -> float:
        if not left or not right:
            return 0.0
        return len(left & right) / max(len(left), 1)

    def _tokenize(self, text: str) -> set[str]:
        return {token.lower() for token in re.findall(r"[a-zA-ZčćžšđČĆŽŠĐ]{3,}", text)}


def rerank_and_limit_cases(
    rows: list[dict[str, Any]],
    query: str,
    extracted_facts: list[str],
    reranked_k: int,
    analyze_k: int,
    max_in_answer: int,
) -> dict[str, list[dict[str, Any]]]:
    retriever = CaseLawRetriever()
    joined_query = query.strip()
    if extracted_facts:
        joined_query = f"{joined_query}\nFakti: {'; '.join(extracted_facts)}"
    reranked = retriever._rerank_candidates(joined_query, rows)[: max(reranked_k, 1)]
    analyzed = reranked[: max(analyze_k, 1)]
    displayed = analyzed[: max(max_in_answer, 1)]
    return {
        "reranked": reranked,
        "analyzed": analyzed,
        "displayed": displayed,
    }

