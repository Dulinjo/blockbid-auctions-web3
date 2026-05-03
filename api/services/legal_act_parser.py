from __future__ import annotations

import re
from dataclasses import asdict
from dataclasses import dataclass
from typing import Any

from api.core.processor import normalize_serbian_text

ARTICLE_RE = re.compile(r"^\s*član\s+(\d+[a-z]?)\.?\s*$", re.IGNORECASE)
PARAGRAPH_RE = re.compile(r"^\s*\((\d+)\)\s+")
POINT_RE = re.compile(r"^\s*(\d+)\)\s+")
ALINEA_RE = re.compile(r"^\s*[-–]\s+")
INTERNAL_REF_RE = re.compile(
    r"(član(?:om)?\s+\d+[a-z]?(?:\.\s*stav\s+\d+)?|stav\s+\d+|tačka\s+\d+)",
    re.IGNORECASE,
)
EXTERNAL_REF_RE = re.compile(
    r"(zakon[ao]?\s+o\s+[a-zčćžšđ0-9 \-]+|uredb[ae]\s+o\s+[a-zčćžšđ0-9 \-]+)",
    re.IGNORECASE,
)


@dataclass(slots=True)
class ParsedNormChunk:
    chunk_id: str
    act_title: str
    act_type: str
    article_number: str
    paragraph_number: str
    point_number: str
    source_url: str
    citation_label: str
    references: list[str]
    norm_text: str
    valid_from: str
    valid_to: str
    validity_confidence: str
    parsing_confidence: str


class LegalActParser:
    def parse(self, fetched_act: dict[str, Any]) -> dict[str, Any]:
        raw_text = str(fetched_act.get("rawText", "")).strip()
        title = str(fetched_act.get("title") or "Nepoznati propis")
        act_type = self._infer_act_type(title)
        source_url = str(fetched_act.get("sourceUrl", ""))

        if not raw_text:
            return {
                "actTitle": title,
                "actType": act_type,
                "source": "PIS",
                "sourceUrl": source_url,
                "officialGazette": str(fetched_act.get("officialGazette", "")),
                "publicationDate": str(fetched_act.get("publicationDate", "")),
                "effectiveDate": str(fetched_act.get("effectiveDate", "")),
                "validFrom": str(fetched_act.get("validFrom", "")),
                "validTo": str(fetched_act.get("validTo", "")),
                "status": str(fetched_act.get("status", "unknown")),
                "parsingConfidence": "low",
                "articles": [],
                "unparsedText": [],
                "normChunks": [],
            }

        normalized = normalize_serbian_text(raw_text)
        lines = [line.strip() for line in normalized.split("\n") if line.strip()]

        articles: list[dict[str, Any]] = []
        current_article: dict[str, Any] | None = None
        current_paragraph: dict[str, Any] | None = None
        unparsed: list[str] = []

        for line in lines:
            article_match = ARTICLE_RE.match(line)
            if article_match:
                current_article = {
                    "articleNumber": article_match.group(1),
                    "articleTitle": "",
                    "articleText": "",
                    "paragraphs": [],
                    "references": [],
                }
                articles.append(current_article)
                current_paragraph = None
                continue

            if not current_article:
                unparsed.append(line)
                continue

            paragraph_match = PARAGRAPH_RE.match(line)
            point_match = POINT_RE.match(line)

            if paragraph_match:
                paragraph_number = paragraph_match.group(1)
                text = PARAGRAPH_RE.sub("", line).strip()
                current_paragraph = {
                    "paragraphNumber": paragraph_number,
                    "text": text,
                    "points": [],
                    "alinije": [],
                    "references": self._extract_references(text),
                }
                current_article["paragraphs"].append(current_paragraph)
            elif point_match and current_paragraph:
                point_number = point_match.group(1)
                text = POINT_RE.sub("", line).strip()
                current_paragraph["points"].append(
                    {"pointNumber": point_number, "text": text, "subpoints": []}
                )
            elif ALINEA_RE.match(line) and current_paragraph:
                current_paragraph["alinije"].append(ALINEA_RE.sub("", line).strip())
            else:
                if current_paragraph:
                    current_paragraph["text"] = f"{current_paragraph['text']} {line}".strip()
                    current_paragraph["references"] = self._extract_references(current_paragraph["text"])
                else:
                    current_article["articleText"] = f"{current_article['articleText']} {line}".strip()

        norm_chunks = self._to_norm_chunks(
            title=title,
            act_type=act_type,
            source_url=source_url,
            valid_from=str(fetched_act.get("validFrom", "")),
            valid_to=str(fetched_act.get("validTo", "")),
            validity_confidence=str(fetched_act.get("validityConfidence", "low")),
            articles=articles,
        )

        confidence = "high" if articles else "low"
        return {
            "actTitle": title,
            "actType": act_type,
            "source": "PIS",
            "sourceUrl": source_url,
            "officialGazette": str(fetched_act.get("officialGazette", "")),
            "publicationDate": str(fetched_act.get("publicationDate", "")),
            "effectiveDate": str(fetched_act.get("effectiveDate", "")),
            "validFrom": str(fetched_act.get("validFrom", "")),
            "validTo": str(fetched_act.get("validTo", "")),
            "status": str(fetched_act.get("status", "unknown")),
            "parsingConfidence": confidence,
            "articles": articles,
            "unparsedText": unparsed,
            "normChunks": [asdict(chunk) for chunk in norm_chunks],
        }

    def _infer_act_type(self, title: str) -> str:
        lowered = title.lower()
        if "zakon" in lowered:
            return "zakon"
        if "uredba" in lowered:
            return "uredba"
        if "pravilnik" in lowered:
            return "pravilnik"
        if "odluka" in lowered:
            return "odluka"
        return "propis"

    def _extract_references(self, text: str) -> list[str]:
        refs = []
        refs.extend(match.group(0).strip() for match in INTERNAL_REF_RE.finditer(text))
        refs.extend(match.group(0).strip() for match in EXTERNAL_REF_RE.finditer(text))
        seen: set[str] = set()
        deduped: list[str] = []
        for ref in refs:
            lowered = ref.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            deduped.append(ref)
        return deduped

    def _to_norm_chunks(
        self,
        *,
        title: str,
        act_type: str,
        source_url: str,
        valid_from: str,
        valid_to: str,
        validity_confidence: str,
        articles: list[dict[str, Any]],
    ) -> list[ParsedNormChunk]:
        chunks: list[ParsedNormChunk] = []
        counter = 1
        for article in articles:
            article_number = str(article.get("articleNumber", ""))
            paragraphs = article.get("paragraphs") or []
            if not paragraphs:
                text = str(article.get("articleText", "")).strip()
                if not text:
                    continue
                citation = f"{title}, član {article_number}"
                chunks.append(
                    ParsedNormChunk(
                        chunk_id=f"norm-{counter}",
                        act_title=title,
                        act_type=act_type,
                        article_number=article_number,
                        paragraph_number="",
                        point_number="",
                        source_url=source_url,
                        citation_label=citation,
                        references=self._extract_references(text),
                        norm_text=text,
                        valid_from=valid_from,
                        valid_to=valid_to,
                        validity_confidence=validity_confidence,
                        parsing_confidence="medium",
                    )
                )
                counter += 1
                continue

            for paragraph in paragraphs:
                paragraph_number = str(paragraph.get("paragraphNumber", "")).strip()
                base_text = str(paragraph.get("text", "")).strip()
                points = paragraph.get("points") or []
                if not points:
                    citation = (
                        f"{title}, član {article_number}, stav {paragraph_number}"
                        if paragraph_number
                        else f"{title}, član {article_number}"
                    )
                    chunks.append(
                        ParsedNormChunk(
                            chunk_id=f"norm-{counter}",
                            act_title=title,
                            act_type=act_type,
                            article_number=article_number,
                            paragraph_number=paragraph_number,
                            point_number="",
                            source_url=source_url,
                            citation_label=citation,
                            references=list(paragraph.get("references") or []),
                            norm_text=base_text,
                            valid_from=valid_from,
                            valid_to=valid_to,
                            validity_confidence=validity_confidence,
                            parsing_confidence="high",
                        )
                    )
                    counter += 1
                    continue

                for point in points:
                    point_number = str(point.get("pointNumber", "")).strip()
                    point_text = str(point.get("text", "")).strip()
                    full_text = f"{base_text} {point_text}".strip()
                    citation = (
                        f"{title}, član {article_number}, stav {paragraph_number}, tačka {point_number}"
                    )
                    chunks.append(
                        ParsedNormChunk(
                            chunk_id=f"norm-{counter}",
                            act_title=title,
                            act_type=act_type,
                            article_number=article_number,
                            paragraph_number=paragraph_number,
                            point_number=point_number,
                            source_url=source_url,
                            citation_label=citation,
                            references=self._extract_references(full_text),
                            norm_text=full_text,
                            valid_from=valid_from,
                            valid_to=valid_to,
                            validity_confidence=validity_confidence,
                            parsing_confidence="high",
                        )
                    )
                    counter += 1
        return chunks
