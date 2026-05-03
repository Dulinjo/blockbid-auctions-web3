from __future__ import annotations

import csv
import io
import json
import os
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from api.core.processor import get_runtime_data_dir

SESSION_COOKIE_NAME = "lexvibe_session_id"
RATE_LIMIT_MESSAGE = (
    "Dostigli ste broj besplatnih pitanja. LexVibe je istraživački prototip, a Vaše "
    "povratne informacije nam pomažu da proverimo koliko su odgovori razumljivi, korisni i "
    "bezbedni za građane. Molimo Vas da popunite kratku evaluacionu anketu kako biste "
    "nastavili korišćenje."
)
SURVEY_SUCCESS_MESSAGE = "Hvala Vam. Možete nastaviti korišćenje LexVibe asistenta."
SURVEY_TITLE = "Anketa za evaluaciju AI agenta za pristup pravdi"
SURVEY_INTRO = (
    "Ova anketa ima za cilj procenu kvaliteta odgovora AI agenta koji korisnicima pruža "
    "informacije o nadležnim institucijama, relevantnim e-servisima i kontaktima za rešavanje "
    "pravnih problema. Molimo Vas da, na osnovu testiranog upita i odgovora sistema, ocenite "
    "kvalitet odgovora."
)
SURVEY_DISCLAIMER = (
    "LexVibe ne pruža konačan pravni savet i ne zamenjuje advokata, sud, organ uprave ili "
    "drugi nadležni organ. Anketa služi za evaluaciju istraživačkog prototipa i unapređenje "
    "pristupa pravdi."
)

FREE_QUESTIONS_PER_BLOCK = max(int(os.getenv("LEXVIBE_FREE_QUESTIONS_PER_BLOCK", "10")), 1)
UNLOCKED_QUESTIONS_PER_SURVEY = max(
    int(os.getenv("LEXVIBE_UNLOCKED_QUESTIONS_PER_SURVEY", "10")),
    1,
)

LIKERT_FIELDS = [
    "q16_correct_institution",
    "q17_clear_next_institution",
    "q18_no_irrelevant_institutional_referrals",
    "q19_practical_orientation_usefulness",
    "q20_concrete_next_step_possible",
    "q21_contacts_links_eservices_useful",
    "q22_answer_relevant",
    "q23_information_accurate_reliable",
    "q24_no_significant_inaccuracies",
    "q25_clear_understandable",
    "q26_structure_helps_navigation",
    "q27_language_suitable_for_non_lawyer",
    "q28_trust_as_initial_information",
    "q29_useful_for_access_to_justice",
    "q30_willing_to_use_in_practice",
    "q31_overall_satisfaction",
    "q32_met_expectations",
]

DIMENSIONS: dict[str, list[str]] = {
    "institutional_orientation": [
        "q16_correct_institution",
        "q17_clear_next_institution",
        "q18_no_irrelevant_institutional_referrals",
    ],
    "operational_usefulness": [
        "q19_practical_orientation_usefulness",
        "q20_concrete_next_step_possible",
        "q21_contacts_links_eservices_useful",
    ],
    "accuracy_relevance": [
        "q22_answer_relevant",
        "q23_information_accurate_reliable",
        "q24_no_significant_inaccuracies",
    ],
    "clarity_understandability": [
        "q25_clear_understandable",
        "q26_structure_helps_navigation",
        "q27_language_suitable_for_non_lawyer",
    ],
    "trust_acceptability": [
        "q28_trust_as_initial_information",
        "q29_useful_for_access_to_justice",
        "q30_willing_to_use_in_practice",
    ],
    "outcome_indicators": [
        "q31_overall_satisfaction",
        "q32_met_expectations",
    ],
}

Q33_OPTIONS = {"Da", "Delimično", "Ne"}
Q34_OPTIONS = {"Da", "Delimično", "Ne"}
Q35_OPTIONS = {"Da", "Samo uz dodatnu proveru", "Ne"}
Q36_OPTIONS = {"Manje od 5 min", "5–15 min", "15–30 min", "Više od 30 min"}
Q37_OPTIONS = {
    "Pogrešna institucija",
    "Nedostaje važna institucija",
    "Nerelevantni kontakti ili linkovi",
    "Nedostaje konkretan sledeći korak",
    "Odgovor je previše opšti",
    "Pravna nepreciznost",
    "Teško razumljiv odgovor",
    "Odgovor deluje pouzdano, ali je pogrešan",
    "Nema značajnih problema",
    "Drugo",
}

SURVEY_JSONL_PATH = get_runtime_data_dir() / "research_surveys.jsonl"

# MVP NOTE:
# In-memory session usage tracking is intentionally simple for local/dev and prototype use.
# TODO(production): move session state and quotas to Redis/Upstash/Supabase/Postgres to avoid
# resets across serverless cold starts, parallel instances, and redeploys.
_SESSION_STORE_LOCK = Lock()
_SESSION_STORE: dict[str, "SessionUsageState"] = {}


@dataclass(slots=True)
class SessionUsageState:
    remaining_questions: int = FREE_QUESTIONS_PER_BLOCK
    usage_count_total: int = 0
    surveys_submitted: int = 0
    latest_chat_query: str = ""
    latest_chat_answer: str = ""


class SurveySubmissionRequest(BaseModel):
    interactionId: str | None = None
    sessionId: str | None = None
    app_version: str | None = None

    q01_professional_role: str = Field(min_length=1)
    q01_professional_role_other: str = ""
    q02_years_experience: str = Field(min_length=1)
    q03_direct_work_frequency: str = Field(min_length=1)
    q04_digital_skills_self_assessment: str = Field(min_length=1)
    q05_gender: str = ""
    q06_age_group: str = ""
    q07_education_level: str = ""
    q07_education_level_other: str = ""
    q08_education_field: str = ""
    q08_education_field_other: str = ""
    q09_work_location: str = ""
    q10_institution_type: str = ""
    q10_institution_type_other: str = ""
    q11_digital_tools_experience: str = ""
    q12_prior_ai_tool_use: str = ""
    q13_tested_query: str = Field(min_length=1)
    q14_problem_complexity: str = Field(min_length=1)
    q15_expected_answer: str = Field(min_length=1)
    q16_correct_institution: int = Field(ge=1, le=5)
    q17_clear_next_institution: int = Field(ge=1, le=5)
    q18_no_irrelevant_institutional_referrals: int = Field(ge=1, le=5)
    q19_practical_orientation_usefulness: int = Field(ge=1, le=5)
    q20_concrete_next_step_possible: int = Field(ge=1, le=5)
    q21_contacts_links_eservices_useful: int = Field(ge=1, le=5)
    q22_answer_relevant: int = Field(ge=1, le=5)
    q23_information_accurate_reliable: int = Field(ge=1, le=5)
    q24_no_significant_inaccuracies: int = Field(ge=1, le=5)
    q25_clear_understandable: int = Field(ge=1, le=5)
    q26_structure_helps_navigation: int = Field(ge=1, le=5)
    q27_language_suitable_for_non_lawyer: int = Field(ge=1, le=5)
    q28_trust_as_initial_information: int = Field(ge=1, le=5)
    q29_useful_for_access_to_justice: int = Field(ge=1, le=5)
    q30_willing_to_use_in_practice: int = Field(ge=1, le=5)
    q31_overall_satisfaction: int = Field(ge=1, le=5)
    q32_met_expectations: int = Field(ge=1, le=5)
    q33_identified_correct_institution: str = Field(min_length=1)
    q34_relevant_contacts_or_eservices: str = Field(min_length=1)
    q35_good_enough_for_real_user: str = Field(min_length=1)
    q36_manual_search_time: str = Field(min_length=1)
    q37_error_types: list[str] = Field(min_length=1)
    q37_error_types_other: str = ""
    q38_most_useful_part: str = ""
    q39_improvement_suggestion: str = Field(min_length=1)
    q40_missing_information: str = ""
    q41_role_perspective_priority: str = ""
    q41_role_perspective_priority_other: str = ""

    @field_validator(
        "q01_professional_role",
        "q02_years_experience",
        "q03_direct_work_frequency",
        "q04_digital_skills_self_assessment",
        "q05_gender",
        "q06_age_group",
        "q07_education_level",
        "q08_education_field",
        "q09_work_location",
        "q10_institution_type",
        "q11_digital_tools_experience",
        "q12_prior_ai_tool_use",
        "q13_tested_query",
        "q14_problem_complexity",
        "q15_expected_answer",
        "q33_identified_correct_institution",
        "q34_relevant_contacts_or_eservices",
        "q35_good_enough_for_real_user",
        "q36_manual_search_time",
        "q38_most_useful_part",
        "q39_improvement_suggestion",
        "q40_missing_information",
        "q41_role_perspective_priority",
        "q01_professional_role_other",
        "q07_education_level_other",
        "q08_education_field_other",
        "q10_institution_type_other",
        "q37_error_types_other",
        "q41_role_perspective_priority_other",
        mode="before",
    )
    @classmethod
    def _strip_text(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("q37_error_types", mode="before")
    @classmethod
    def _normalize_error_types(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        unique: list[str] = []
        for item in cleaned:
            if item not in unique:
                unique.append(item)
        return unique

    @model_validator(mode="after")
    def _validate_conditional_fields(self) -> "SurveySubmissionRequest":
        if self.q33_identified_correct_institution not in Q33_OPTIONS:
            raise ValueError("Neispravna vrednost za pitanje 33.")
        if self.q34_relevant_contacts_or_eservices not in Q34_OPTIONS:
            raise ValueError("Neispravna vrednost za pitanje 34.")
        if self.q35_good_enough_for_real_user not in Q35_OPTIONS:
            raise ValueError("Neispravna vrednost za pitanje 35.")
        if self.q36_manual_search_time not in Q36_OPTIONS:
            raise ValueError("Neispravna vrednost za pitanje 36.")
        if any(value not in Q37_OPTIONS for value in self.q37_error_types):
            raise ValueError("Neispravna vrednost za pitanje 37.")
        if "Drugo" in self.q37_error_types and not self.q37_error_types_other:
            raise ValueError("Ako je u pitanju 37 izabrano 'Drugo', tekst je obavezan.")
        if self.q01_professional_role == "Drugo" and not self.q01_professional_role_other:
            raise ValueError("Ako je u pitanju 1 izabrano 'Drugo', tekst je obavezan.")
        if self.q07_education_level == "Drugo" and not self.q07_education_level_other:
            raise ValueError("Ako je u pitanju 7 izabrano 'Drugo', tekst je obavezan.")
        if self.q08_education_field == "Drugo" and not self.q08_education_field_other:
            raise ValueError("Ako je u pitanju 8 izabrano 'Drugo', tekst je obavezan.")
        if self.q10_institution_type == "Drugo" and not self.q10_institution_type_other:
            raise ValueError("Ako je u pitanju 10 izabrano 'Drugo', tekst je obavezan.")
        if (
            self.q41_role_perspective_priority == "Drugo"
            and not self.q41_role_perspective_priority_other
        ):
            raise ValueError("Ako je u pitanju 41 izabrano 'Drugo', tekst je obavezan.")
        return self


def _append_jsonl_record(path: str, payload: dict[str, Any]) -> None:
    target = get_runtime_data_dir() / path
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + os.linesep)


def _read_jsonl_records(path: str) -> list[dict[str, Any]]:
    target = get_runtime_data_dir() / path
    if not target.exists():
        return []
    rows: list[dict[str, Any]] = []
    try:
        with target.open("r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    rows.append(parsed)
    except OSError:
        return []
    return rows


def _get_or_create_session_state(session_id: str) -> SessionUsageState:
    with _SESSION_STORE_LOCK:
        state = _SESSION_STORE.get(session_id)
        if state is None:
            state = SessionUsageState()
            _SESSION_STORE[session_id] = state
        return state


def create_session_id() -> str:
    return str(uuid4())


def consume_question_quota(session_id: str) -> tuple[bool, int]:
    with _SESSION_STORE_LOCK:
        state = _SESSION_STORE.get(session_id)
        if state is None:
            state = SessionUsageState()
            _SESSION_STORE[session_id] = state
        if state.remaining_questions <= 0:
            return False, 0
        state.remaining_questions -= 1
        state.usage_count_total += 1
        return True, state.remaining_questions


def unlock_questions_after_survey(
    session_id: str, questions: int = UNLOCKED_QUESTIONS_PER_SURVEY
) -> int:
    with _SESSION_STORE_LOCK:
        state = _SESSION_STORE.get(session_id)
        if state is None:
            state = SessionUsageState()
            _SESSION_STORE[session_id] = state
        state.surveys_submitted += 1
        state.remaining_questions += max(questions, 1)
        return state.remaining_questions


def get_usage_snapshot(session_id: str) -> dict[str, Any]:
    state = _get_or_create_session_state(session_id)
    return {
        "remaining_questions": state.remaining_questions,
        "usage_count_total": state.usage_count_total,
        "surveys_submitted": state.surveys_submitted,
        "latest_chat_query": state.latest_chat_query,
        "latest_chat_answer": state.latest_chat_answer,
    }


def update_latest_chat_context(
    session_id: str,
    *,
    latest_query: str | None = None,
    latest_answer: str | None = None,
) -> None:
    with _SESSION_STORE_LOCK:
        state = _SESSION_STORE.get(session_id)
        if state is None:
            state = SessionUsageState()
            _SESSION_STORE[session_id] = state
        if latest_query is not None:
            state.latest_chat_query = latest_query.strip()
        if latest_answer is not None:
            state.latest_chat_answer = latest_answer.strip()


def build_survey_record(
    submission: SurveySubmissionRequest,
    *,
    session_id: str,
    usage_count_at_submission: int,
    latest_chat_query: str,
    latest_chat_answer: str,
    user_agent: str,
) -> dict[str, Any]:
    base = submission.model_dump()
    return {
        "id": str(uuid4()),
        "timestamp": datetime.now(UTC).isoformat(),
        "session_id": session_id,
        "usage_count_at_submission": usage_count_at_submission,
        "latest_chat_query": latest_chat_query,
        "latest_chat_answer": latest_chat_answer,
        "app_version": base.get("app_version", "") or "",
        "user_agent": user_agent or "",
        **base,
    }


def save_survey_record(record: dict[str, Any]) -> None:
    _append_jsonl_record("research_surveys.jsonl", record)


def load_survey_records() -> list[dict[str, Any]]:
    return _read_jsonl_records("research_surveys.jsonl")


def _round_or_none(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def _coerce_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if 1 <= parsed <= 5 else None


def calculate_survey_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    likert_averages: dict[str, float | None] = {}
    for field in LIKERT_FIELDS:
        values = [
            float(parsed)
            for parsed in (_coerce_int(record.get(field)) for record in records)
            if parsed is not None
        ]
        likert_averages[field] = _round_or_none(values)

    dimension_averages: dict[str, float | None] = {}
    for dimension, fields in DIMENSIONS.items():
        values = [
            float(parsed)
            for record in records
            for parsed in (_coerce_int(record.get(field)) for field in fields)
            if parsed is not None
        ]
        dimension_averages[dimension] = _round_or_none(values)

    q33_distribution = Counter(
        str(record.get("q33_identified_correct_institution", "")).strip()
        for record in records
        if str(record.get("q33_identified_correct_institution", "")).strip()
    )
    q34_distribution = Counter(
        str(record.get("q34_relevant_contacts_or_eservices", "")).strip()
        for record in records
        if str(record.get("q34_relevant_contacts_or_eservices", "")).strip()
    )
    q35_distribution = Counter(
        str(record.get("q35_good_enough_for_real_user", "")).strip()
        for record in records
        if str(record.get("q35_good_enough_for_real_user", "")).strip()
    )
    q36_distribution = Counter(
        str(record.get("q36_manual_search_time", "")).strip()
        for record in records
        if str(record.get("q36_manual_search_time", "")).strip()
    )

    error_counter: Counter[str] = Counter()
    for record in records:
        errors = record.get("q37_error_types", [])
        if isinstance(errors, list):
            for item in errors:
                text = str(item).strip()
                if text:
                    error_counter[text] += 1

    recent_feedback = [
        {
            "id": record.get("id", ""),
            "timestamp": record.get("timestamp", ""),
            "q38_most_useful_part": record.get("q38_most_useful_part", ""),
            "q39_improvement_suggestion": record.get("q39_improvement_suggestion", ""),
            "q40_missing_information": record.get("q40_missing_information", ""),
        }
        for record in sorted(
            records,
            key=lambda row: str(row.get("timestamp", "")),
            reverse=True,
        )[:12]
    ]

    return {
        "total_responses": len(records),
        "likert_averages": likert_averages,
        "dimension_averages": dimension_averages,
        "distributions": {
            "q33_identified_correct_institution": dict(q33_distribution),
            "q34_relevant_contacts_or_eservices": dict(q34_distribution),
            "q35_good_enough_for_real_user": dict(q35_distribution),
            "q36_manual_search_time": dict(q36_distribution),
        },
        "most_common_error_types": [
            {"error_type": error_type, "count": count}
            for error_type, count in error_counter.most_common(10)
        ],
        "recent_open_feedback": recent_feedback,
    }


CSV_EXPORT_FIELDS = [
    "id",
    "timestamp",
    "session_id",
    "usage_count_at_submission",
    "latest_chat_query",
    "latest_chat_answer",
    "app_version",
    "user_agent",
    "interactionId",
    "sessionId",
    "q01_professional_role",
    "q01_professional_role_other",
    "q02_years_experience",
    "q03_direct_work_frequency",
    "q04_digital_skills_self_assessment",
    "q05_gender",
    "q06_age_group",
    "q07_education_level",
    "q07_education_level_other",
    "q08_education_field",
    "q08_education_field_other",
    "q09_work_location",
    "q10_institution_type",
    "q10_institution_type_other",
    "q11_digital_tools_experience",
    "q12_prior_ai_tool_use",
    "q13_tested_query",
    "q14_problem_complexity",
    "q15_expected_answer",
    "q16_correct_institution",
    "q17_clear_next_institution",
    "q18_no_irrelevant_institutional_referrals",
    "q19_practical_orientation_usefulness",
    "q20_concrete_next_step_possible",
    "q21_contacts_links_eservices_useful",
    "q22_answer_relevant",
    "q23_information_accurate_reliable",
    "q24_no_significant_inaccuracies",
    "q25_clear_understandable",
    "q26_structure_helps_navigation",
    "q27_language_suitable_for_non_lawyer",
    "q28_trust_as_initial_information",
    "q29_useful_for_access_to_justice",
    "q30_willing_to_use_in_practice",
    "q31_overall_satisfaction",
    "q32_met_expectations",
    "q33_identified_correct_institution",
    "q34_relevant_contacts_or_eservices",
    "q35_good_enough_for_real_user",
    "q36_manual_search_time",
    "q37_error_types",
    "q37_error_types_other",
    "q38_most_useful_part",
    "q39_improvement_suggestion",
    "q40_missing_information",
    "q41_role_perspective_priority",
    "q41_role_perspective_priority_other",
]


def build_survey_csv(records: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_EXPORT_FIELDS)
    writer.writeheader()
    for record in records:
        row = {field: record.get(field, "") for field in CSV_EXPORT_FIELDS}
        errors = row.get("q37_error_types", [])
        if isinstance(errors, list):
            row["q37_error_types"] = "; ".join(str(item).strip() for item in errors if str(item).strip())
        writer.writerow(row)
    return output.getvalue()


def reset_session_store_for_tests() -> None:
    with _SESSION_STORE_LOCK:
        _SESSION_STORE.clear()
