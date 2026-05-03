from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from api.core.processor import normalize_serbian_text
from api.services.config import feature_enabled
from api.services.entity_recognition_and_linking import extract_entities

TOKEN_PATTERN = re.compile(r"[a-z0-9čćžšđ]{2,}", re.IGNORECASE)

LEMMA_OVERRIDES = {
    "zakona": "zakon",
    "zakonu": "zakon",
    "zakonom": "zakon",
    "presude": "presuda",
    "presudi": "presuda",
    "presudama": "presuda",
    "sudova": "sud",
    "sudu": "sud",
    "sudom": "sud",
    "odluke": "odluka",
    "odluci": "odluka",
}


@dataclass(slots=True)
class QueryPreprocessorResult:
    original_query: str
    normalized_query: str
    lemmas: list[str]
    pos_tags: list[str]
    expanded_query: str
    preprocessor_used: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "originalQuery": self.original_query,
            "normalizedQuery": self.normalized_query,
            "lemmas": self.lemmas,
            "posTags": self.pos_tags,
            "expandedQuery": self.expanded_query,
            "preprocessorUsed": self.preprocessor_used,
        }


def _simple_lemmatize(tokens: list[str]) -> list[str]:
    lemmas: list[str] = []
    for token in tokens:
        lower = token.lower()
        if lower in LEMMA_OVERRIDES:
            lemmas.append(LEMMA_OVERRIDES[lower])
            continue
        if lower.endswith("ima") and len(lower) > 6:
            lemmas.append(lower[:-3])
            continue
        if lower.endswith(("ama", "ima", "ovima")) and len(lower) > 7:
            lemmas.append(lower[:-3])
            continue
        if lower.endswith(("e", "a", "u")) and len(lower) > 4:
            lemmas.append(lower[:-1])
            continue
        lemmas.append(lower)
    return lemmas


def _simple_pos_tag(tokens: list[str]) -> list[str]:
    tags: list[str] = []
    for token in tokens:
        value = token.lower()
        if value.isdigit():
            tags.append("NUM")
        elif value in {"i", "ili", "te", "pa"}:
            tags.append("CONJ")
        elif value in {"u", "na", "od", "do", "za", "po", "pre", "posle"}:
            tags.append("ADP")
        elif value.endswith("ti") or value.endswith("ći"):
            tags.append("VERB")
        else:
            tags.append("NOUN")
    return tags


def preprocess_query(query: str) -> QueryPreprocessorResult:
    normalized = normalize_serbian_text(query)
    if not feature_enabled("ENABLE_QUERY_PREPROCESSOR", True):
        return QueryPreprocessorResult(
            original_query=query,
            normalized_query=normalized,
            lemmas=[],
            pos_tags=[],
            expanded_query=normalized,
            preprocessor_used=False,
        )

    tokens = TOKEN_PATTERN.findall(normalized)
    lemmas = _simple_lemmatize(tokens)
    pos_tags = _simple_pos_tag(tokens)
    entities = extract_entities(normalized, "user_query")
    expansions = [
        entity["normalizedText"]
        for entity in entities
        if entity.get("type") in {"LEGAL_ACT", "COURT", "CASE_NUMBER", "ARTICLE_REFERENCE", "DATE"}
    ]

    expanded_query = " ".join(
        part for part in [normalized, " ".join(lemmas), " ".join(expansions)] if part.strip()
    ).strip()

    return QueryPreprocessorResult(
        original_query=query,
        normalized_query=normalized,
        lemmas=lemmas,
        pos_tags=pos_tags,
        expanded_query=expanded_query or normalized,
        preprocessor_used=True,
    )
