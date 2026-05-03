from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from api.services.config import get_feature_flags
from api.services.research_interaction_logger import append_jsonl_record

SURVEY_LOG_FILE = "survey_events.jsonl"


def save_post_answer_survey(payload: dict[str, Any]) -> dict[str, Any]:
    if not get_feature_flags().enable_post_answer_survey:
        return {"saved": False, "reason": "feature_disabled"}

    record = {
        "surveyId": str(uuid4()),
        "interactionId": payload.get("interactionId", ""),
        "timestamp": datetime.now(UTC).isoformat(),
        "usefulness": payload.get("usefulness", ""),
        "sourceRelevance": payload.get("sourceRelevance", ""),
        "clarity": payload.get("clarity", ""),
        "wouldUseAgain": payload.get("wouldUseAgain", ""),
        "freeComment": payload.get("freeComment", ""),
    }
    append_jsonl_record(SURVEY_LOG_FILE, record)
    return {"saved": True, "surveyId": record["surveyId"]}
