from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from api.services.config import feature_enabled


LEGAL_ACT_PATTERNS = [
    r"\bZakon o [A-Za-zČĆŽŠĐčćžšđ\s]+\b",
    r"\bUredba o [A-Za-zČĆŽŠĐčćžšđ\s]+\b",
    r"\bPravilnik o [A-Za-zČĆŽŠĐčćžšđ\s]+\b",
    r"\bOdluka o [A-Za-zČĆŽŠĐčćžšđ\s]+\b",
    r"\bNaredba o [A-Za-zČĆŽŠĐčćžšđ\s]+\b",
    r"\bZaključak o [A-Za-zČĆŽŠĐčćžšđ\s]+\b",
]

ARTICLE_REFERENCE_PATTERNS = [
    r"\bčlan(?:om)?\s+\d+[a-z]?\b",
    r"\bstav\s+\d+\b",
    r"\btačka\s+\d+\)?\b",
    r"\balineja\s+[A-Za-zčćžšđ]+\b",
]

CASE_NUMBER_PATTERNS = [
    r"\b[PKRUVG]{1,4}[A-Za-z0-9-]*\s*\d{1,5}[/-]\d{2,4}\b",
    r"\bbroj predmeta[:\s]+\S+\b",
]

COURT_KEYWORDS = [
    "Vrhovni kasacioni sud",
    "Vrhovni sud",
    "Apelacioni sud",
    "Privredni apelacioni sud",
    "Upravni sud",
    "Viši sud",
    "Osnovni sud",
]

TEMPORAL_PATTERNS = [
    r"\bdanas\b",
    r"\btrenutno\b",
    r"\bsada\b",
    r"\bpre izmena\b",
    r"\bu vreme [A-Za-zčćžšđ\s]+\b",
    r"\b\d{4}\.\s*godine\b",
    r"\b\d{1,2}\.\d{1,2}\.\d{4}\b",
]


@dataclass(slots=True)
class Entity:
    text: str
    normalized_text: str
    type: str
    start_offset: int
    end_offset: int
    confidence: float
    source: str
    linked_to: str
    linking_confidence: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "normalizedText": self.normalized_text,
            "type": self.type,
            "startOffset": self.start_offset,
            "endOffset": self.end_offset,
            "confidence": self.confidence,
            "source": self.source,
            "linkedTo": self.linked_to,
            "linkingConfidence": self.linking_confidence,
        }


def _compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(pattern, re.IGNORECASE) for pattern in patterns]


LEGAL_ACT_REGEXES = _compile_patterns(LEGAL_ACT_PATTERNS)
ARTICLE_REFERENCE_REGEXES = _compile_patterns(ARTICLE_REFERENCE_PATTERNS)
CASE_NUMBER_REGEXES = _compile_patterns(CASE_NUMBER_PATTERNS)
TEMPORAL_REGEXES = _compile_patterns(TEMPORAL_PATTERNS)


class EntityRecognitionAndLinkingService:
    def __init__(self) -> None:
        self.enabled = feature_enabled("ENABLE_ENTITY_RECOGNITION", True)

    def extract(self, text: str, source: str) -> list[dict[str, Any]]:
        if not self.enabled or not text.strip():
            return []

        entities: list[Entity] = []
        entities.extend(self._extract_pattern_entities(text, source, LEGAL_ACT_REGEXES, "LEGAL_ACT", 0.89))
        entities.extend(
            self._extract_pattern_entities(
                text, source, ARTICLE_REFERENCE_REGEXES, "ARTICLE_REFERENCE", 0.87
            )
        )
        entities.extend(self._extract_pattern_entities(text, source, CASE_NUMBER_REGEXES, "CASE_NUMBER", 0.84))
        entities.extend(self._extract_pattern_entities(text, source, TEMPORAL_REGEXES, "DATE", 0.81))
        entities.extend(self._extract_courts(text, source))

        dedup: dict[tuple[str, int, int], Entity] = {}
        for entity in entities:
            key = (entity.type, entity.start_offset, entity.end_offset)
            if key not in dedup or dedup[key].confidence < entity.confidence:
                dedup[key] = entity
        return [entity.to_dict() for entity in sorted(dedup.values(), key=lambda item: item.start_offset)]

    def build_entity_map(
        self,
        user_query_entities: list[dict[str, Any]],
        regulation_entities: list[dict[str, Any]],
        case_law_entities: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "userQueryEntities": user_query_entities,
            "regulationEntities": regulation_entities,
            "caseLawEntities": case_law_entities,
            "linkedLegalActs": [e["normalizedText"] for e in user_query_entities if e["type"] == "LEGAL_ACT"],
            "linkedCourts": [e["normalizedText"] for e in user_query_entities if e["type"] == "COURT"],
            "linkedArticleReferences": [
                e["normalizedText"] for e in user_query_entities if e["type"] == "ARTICLE_REFERENCE"
            ],
            "dates": [e["normalizedText"] for e in user_query_entities if e["type"] == "DATE"],
        }

    def _extract_pattern_entities(
        self,
        text: str,
        source: str,
        patterns: list[re.Pattern[str]],
        entity_type: str,
        confidence: float,
    ) -> list[Entity]:
        entities: list[Entity] = []
        for pattern in patterns:
            for match in pattern.finditer(text):
                raw = match.group(0).strip()
                entities.append(
                    Entity(
                        text=raw,
                        normalized_text=self._normalize_entity_text(raw),
                        type=entity_type,
                        start_offset=match.start(),
                        end_offset=match.end(),
                        confidence=confidence,
                        source=source,
                        linked_to="",
                        linking_confidence="medium",
                    )
                )
        return entities

    def _extract_courts(self, text: str, source: str) -> list[Entity]:
        entities: list[Entity] = []
        lowered = text.lower()
        for court in COURT_KEYWORDS:
            idx = lowered.find(court.lower())
            if idx == -1:
                continue
            entities.append(
                Entity(
                    text=text[idx : idx + len(court)],
                    normalized_text=self._normalize_entity_text(court),
                    type="COURT",
                    start_offset=idx,
                    end_offset=idx + len(court),
                    confidence=0.86,
                    source=source,
                    linked_to=court,
                    linking_confidence="high",
                )
            )
        return entities

    @staticmethod
    def _normalize_entity_text(text: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        return cleaned


entity_recognizer = EntityRecognitionAndLinkingService()
entity_service = entity_recognizer


def extract_entities(text: str, source: str) -> list[dict[str, Any]]:
    return entity_recognizer.extract(text, source)


def build_entity_map(
    user_query_entities: list[dict[str, Any]],
    regulation_entities: list[dict[str, Any]],
    case_law_entities: list[dict[str, Any]],
) -> dict[str, Any]:
    return entity_recognizer.build_entity_map(
        user_query_entities=user_query_entities,
        regulation_entities=regulation_entities,
        case_law_entities=case_law_entities,
    )
