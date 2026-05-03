from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import os
from pathlib import Path
from typing import Any

import httpx

from api.services.config import feature_enabled
from api.core.processor import get_runtime_data_dir


@dataclass(slots=True)
class RegulationFetchResult:
    act_id: str
    title: str
    source_url: str
    retrieved_at: str
    valid_from: str | None
    valid_to: str | None
    status: str
    validity_confidence: str
    raw_text: str
    raw_html: str
    metadata: dict[str, Any]


class PisOnDemandFetcher:
    def __init__(self) -> None:
        cache_dir = get_runtime_data_dir() / "pis-cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir = cache_dir
        self.api_url = os.getenv("SLUZBENI_GLASNIK_API_URL", "").strip()
        self.api_key = os.getenv("SLUZBENI_GLASNIK_API_KEY", "").strip()
        self.cache_ttl = timedelta(hours=12)
        self.enabled = feature_enabled("ENABLE_PIS_ON_DEMAND_FETCH", True)

    def _cache_path(self, act_id: str) -> Path:
        safe_id = "".join(ch for ch in act_id if ch.isalnum() or ch in {"-", "_"})
        return self.cache_dir / f"{safe_id}.json"

    def get_cached_act_if_fresh(self, act_id: str) -> RegulationFetchResult | None:
        path = self._cache_path(act_id)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
        retrieved_at_raw = payload.get("retrievedAt")
        if not isinstance(retrieved_at_raw, str):
            return None
        try:
            retrieved_at = datetime.fromisoformat(retrieved_at_raw)
        except ValueError:
            return None
        if datetime.now(UTC) - retrieved_at > self.cache_ttl:
            return None
        return self._payload_to_result(payload)

    def cache_fetched_act(self, result: RegulationFetchResult) -> None:
        payload = {
            "actId": result.act_id,
            "title": result.title,
            "sourceUrl": result.source_url,
            "retrievedAt": result.retrieved_at,
            "validFrom": result.valid_from,
            "validTo": result.valid_to,
            "status": result.status,
            "validityConfidence": result.validity_confidence,
            "rawText": result.raw_text,
            "rawHtml": result.raw_html,
            "parsedStructure": {},
            "metadata": result.metadata,
        }
        self._cache_path(result.act_id).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def search_relevant_act(self, query: str) -> dict[str, str] | None:
        if not self.enabled or not self.api_url:
            return None
        endpoint = f"{self.api_url.rstrip('/')}/search"
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            response = httpx.get(endpoint, params={"q": query}, headers=headers, timeout=6)
            response.raise_for_status()
            payload = response.json()
        except Exception:
            return None
        items = payload.get("items", []) if isinstance(payload, dict) else []
        if not items or not isinstance(items[0], dict):
            return None
        best = items[0]
        act_id = str(best.get("id") or best.get("actId") or "").strip()
        title = str(best.get("title") or "").strip()
        source_url = str(best.get("url") or best.get("sourceUrl") or "").strip()
        if not act_id or not title or not source_url:
            return None
        return {"act_id": act_id, "title": title, "source_url": source_url}

    def extract_act_metadata(self, raw_response: dict[str, Any]) -> dict[str, Any]:
        return {
            "officialGazette": raw_response.get("officialGazette"),
            "publicationDate": raw_response.get("publicationDate"),
            "effectiveDate": raw_response.get("effectiveDate"),
            "status": raw_response.get("status"),
        }

    def extract_validity_metadata(self, raw_response: dict[str, Any]) -> dict[str, Any]:
        valid_from = raw_response.get("validFrom")
        valid_to = raw_response.get("validTo")
        status = str(raw_response.get("status") or "unknown")
        confidence = "low"
        if valid_from and status:
            confidence = "medium"
        if valid_from and status and raw_response.get("normLevelValidity"):
            confidence = "high"
        return {
            "valid_from": valid_from,
            "valid_to": valid_to,
            "status": status,
            "validity_confidence": confidence,
        }

    def mark_validity_confidence(self, confidence: str) -> str:
        if confidence in {"high", "medium", "low"}:
            return confidence
        return "low"

    def fetch_act_by_url_or_id(self, act_id: str, source_url: str) -> RegulationFetchResult | None:
        if not self.enabled:
            return None
        cached = self.get_cached_act_if_fresh(act_id)
        if cached is not None:
            return cached

        if not self.api_url:
            return None
        endpoint = f"{self.api_url.rstrip('/')}/acts/{act_id}"
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            response = httpx.get(endpoint, headers=headers, timeout=8)
            response.raise_for_status()
            payload = response.json()
        except Exception:
            return None

        if not isinstance(payload, dict):
            return None

        validity = self.extract_validity_metadata(payload)
        result = RegulationFetchResult(
            act_id=act_id,
            title=str(payload.get("title") or ""),
            source_url=str(payload.get("sourceUrl") or source_url),
            retrieved_at=datetime.now(UTC).isoformat(),
            valid_from=validity["valid_from"],
            valid_to=validity["valid_to"],
            status=validity["status"],
            validity_confidence=self.mark_validity_confidence(validity["validity_confidence"]),
            raw_text=str(payload.get("text") or ""),
            raw_html=str(payload.get("html") or ""),
            metadata=self.extract_act_metadata(payload),
        )
        self.cache_fetched_act(result)
        return result

    def _payload_to_result(self, payload: dict[str, Any]) -> RegulationFetchResult:
        return RegulationFetchResult(
            act_id=str(payload.get("actId") or ""),
            title=str(payload.get("title") or ""),
            source_url=str(payload.get("sourceUrl") or ""),
            retrieved_at=str(payload.get("retrievedAt") or datetime.now(UTC).isoformat()),
            valid_from=payload.get("validFrom"),
            valid_to=payload.get("validTo"),
            status=str(payload.get("status") or "unknown"),
            validity_confidence=str(payload.get("validityConfidence") or "low"),
            raw_text=str(payload.get("rawText") or ""),
            raw_html=str(payload.get("rawHtml") or ""),
            metadata=payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
        )


pis_fetcher = PisOnDemandFetcher()
