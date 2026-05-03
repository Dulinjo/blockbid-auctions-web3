from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from api.services.config import feature_enabled

TEMPORAL_KEYWORDS = (
    "danas",
    "trenutno",
    "sada",
    "u vreme",
    "pre izmena",
    "kada je važio",
)
YEAR_PATTERN = re.compile(r"(19|20)\d{2}")


class TemporalValidityChecker:
    def __init__(self) -> None:
        self.enabled = feature_enabled("ENABLE_TEMPORAL_VALIDITY_CHECK", True)

    def _extract_target_date(self, query: str) -> dict[str, Any]:
        lower = query.lower()
        years = YEAR_PATTERN.findall(query)
        matched_years = re.findall(r"(?:19|20)\d{2}", query)
        has_temporal_context = any(keyword in lower for keyword in TEMPORAL_KEYWORDS) or bool(matched_years)
        if "danas" in lower or "trenutno" in lower or "sada" in lower:
            return {
                "target_date": datetime.now(UTC).date().isoformat(),
                "temporal_context": "current",
                "has_temporal_context": has_temporal_context,
            }
        if matched_years:
            return {
                "target_date": f"{matched_years[0]}-12-31",
                "temporal_context": "historical",
                "has_temporal_context": has_temporal_context,
            }
        return {
            "target_date": datetime.now(UTC).date().isoformat(),
            "temporal_context": "current",
            "has_temporal_context": has_temporal_context,
        }

    def check(self, query: str, parsed_act: dict[str, Any] | None) -> dict[str, Any]:
        if not self.enabled:
            return {
                "enabled": False,
                "target_date": None,
                "temporal_context": None,
                "validity_status": "unknown",
                "validity_confidence": "low",
                "note": "Temporal validity checker is disabled.",
            }

        temporal_data = self._extract_target_date(query)
        if not parsed_act:
            return {
                "enabled": True,
                **temporal_data,
                "validity_status": "unknown",
                "validity_confidence": "low",
                "note": "Nema dovoljno podataka o propisu za proveru važenja.",
            }

        status = str(parsed_act.get("status") or "unknown")
        valid_from = parsed_act.get("validFrom")
        valid_to = parsed_act.get("validTo")
        confidence = str(parsed_act.get("validityConfidence") or "low")
        note = (
            "Provera važenja izvršena na nivou propisa. "
            "Važenje konkretne norme (član/stav/tačka) nije uvek dostupno."
        )
        if not valid_from and not valid_to:
            confidence = "low"
            note = "Nisu dostupni pouzdani podaci o važenju za relevantni datum."

        return {
            "enabled": True,
            **temporal_data,
            "validity_status": status,
            "validity_confidence": confidence,
            "valid_from": valid_from,
            "valid_to": valid_to,
            "note": note,
        }
