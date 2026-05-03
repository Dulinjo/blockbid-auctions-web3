from __future__ import annotations

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
        top_k: int = 6,
    ) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        normalized = query.strip()
        if extracted_facts:
            normalized = f"{normalized}\nFakti: {'; '.join(extracted_facts)}"
        return rag_engine.search_case_law(normalized, top_k=top_k)

