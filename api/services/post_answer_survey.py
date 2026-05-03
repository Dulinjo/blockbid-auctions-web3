from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import uuid4

from api.services.config import get_feature_flags
from api.services.research_interaction_logger import append_jsonl_record

SURVEY_LOG_FILE = "survey_events.jsonl"


def _redact_sensitive(value: str) -> str:
    text = value or ""
    text = re.sub(r"\b\d{13}\b", "[REDACTED_JMBG]", text)
    text = re.sub(r"\b\d{8,}\b", "[REDACTED_LONG_NUMBER]", text)
    text = re.sub(
        r"[\w\.-]+@[\w\.-]+\.\w+",
        "[REDACTED_EMAIL]",
        text,
        flags=re.IGNORECASE,
    )
    return text.strip()


def _to_int_or_none(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if 1 <= parsed <= 5:
        return parsed
    return None


def save_post_answer_survey(payload: dict[str, Any]) -> dict[str, Any]:
    if not get_feature_flags().enable_post_answer_survey:
        return {"saved": False, "reason": "feature_disabled"}

    survey_type = str(payload.get("surveyType") or "mini")
    trigger_reason = str(payload.get("triggerReason") or "after_answer")
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    socio = (
        payload.get("socioDemographics")
        if isinstance(payload.get("socioDemographics"), dict)
        else {}
    )
    tested_case = payload.get("testedCase") if isinstance(payload.get("testedCase"), dict) else {}
    likert_raw = payload.get("likert") if isinstance(payload.get("likert"), dict) else {}
    objective = (
        payload.get("objectiveAssessment")
        if isinstance(payload.get("objectiveAssessment"), dict)
        else {}
    )
    open_feedback = (
        payload.get("openFeedback") if isinstance(payload.get("openFeedback"), dict) else {}
    )

    likert = {
        key: _to_int_or_none(likert_raw.get(key))
        for key in (
            "institutionalGuidance1",
            "institutionalGuidance2",
            "institutionalGuidance3",
            "operationalUsefulness1",
            "operationalUsefulness2",
            "operationalUsefulness3",
            "accuracyRelevance1",
            "accuracyRelevance2",
            "accuracyRelevance3",
            "clarity1",
            "clarity2",
            "clarity3",
            "trust1",
            "trust2",
            "trust3",
            "overallSatisfaction",
            "metExpectations",
        )
    }

    record = {
        "surveyId": str(uuid4()),
        "interactionId": payload.get("interactionId", ""),
        "sessionId": payload.get("sessionId", ""),
        "timestamp": datetime.now(UTC).isoformat(),
        "surveyType": survey_type,
        "triggerReason": trigger_reason,
        "profile": {
            "role": str(profile.get("role", "")),
            "yearsExperience": str(profile.get("yearsExperience", "")),
            "worksWithCitizensFrequency": str(profile.get("worksWithCitizensFrequency", "")),
            "digitalSkills": str(profile.get("digitalSkills", "")),
        },
        "socioDemographics": {
            "gender": str(socio.get("gender", "")),
            "ageGroup": str(socio.get("ageGroup", "")),
            "educationLevel": str(socio.get("educationLevel", "")),
            "educationField": str(socio.get("educationField", "")),
            "institutionType": str(socio.get("institutionType", "")),
            "usedAiToolsBefore": str(socio.get("usedAiToolsBefore", "")),
        },
        "testedCase": {
            "originalQuestion": _redact_sensitive(str(tested_case.get("originalQuestion", ""))),
            "detectedIntent": str(tested_case.get("detectedIntent", "")),
            "legalArea": str(tested_case.get("legalArea", "")),
            "sourcesUsed": tested_case.get("sourcesUsed", []) if isinstance(tested_case.get("sourcesUsed"), list) else [],
            "caseComplexity": str(tested_case.get("caseComplexity", "")),
            "expectedAnswer": _redact_sensitive(str(tested_case.get("expectedAnswer", ""))),
        },
        "likert": likert,
        "objectiveAssessment": {
            "identifiedRightInstitution": str(objective.get("identifiedRightInstitution", "")),
            "offeredRelevantContactsOrServices": str(objective.get("offeredRelevantContactsOrServices", "")),
            "goodEnoughForRealUser": str(objective.get("goodEnoughForRealUser", "")),
            "manualSearchTimeEstimate": str(objective.get("manualSearchTimeEstimate", "")),
        },
        "errors": payload.get("errors", []) if isinstance(payload.get("errors"), list) else [],
        "openFeedback": {
            "mostUseful": _redact_sensitive(str(open_feedback.get("mostUseful", ""))),
            "whatToImprove": _redact_sensitive(str(open_feedback.get("whatToImprove", ""))),
            "missingInformation": _redact_sensitive(str(open_feedback.get("missingInformation", ""))),
            "rolePerspectiveMostImportant": str(
                open_feedback.get("rolePerspectiveMostImportant", "")
            ),
        },
        "miniFeedback": {
            "helpfulness": str(payload.get("helpfulness", payload.get("usefulness", ""))),
            "problemTypes": payload.get("problemTypes", []) if isinstance(payload.get("problemTypes"), list) else [],
            "freeComment": _redact_sensitive(str(payload.get("freeComment", ""))),
        },
        "usefulness": payload.get("usefulness", ""),
        "sourceRelevance": payload.get("sourceRelevance", ""),
        "clarity": payload.get("clarity", ""),
        "wouldUseAgain": payload.get("wouldUseAgain", ""),
        "freeComment": _redact_sensitive(str(payload.get("freeComment", ""))),
    }
    append_jsonl_record(SURVEY_LOG_FILE, record)
    return {"saved": True, "surveyId": record["surveyId"]}
