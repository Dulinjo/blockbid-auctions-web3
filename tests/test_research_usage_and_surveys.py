from __future__ import annotations

from api.services.research_usage_and_surveys import (
    SurveySubmissionRequest,
    build_survey_csv,
    calculate_survey_summary,
    consume_question_quota,
    reset_session_store_for_tests,
    unlock_questions_after_survey,
)


def _valid_submission_payload() -> dict:
    return {
        "q01_professional_role": "Advokat",
        "q01_professional_role_other": "",
        "q02_years_experience": "3–5",
        "q03_direct_work_frequency": "Često",
        "q04_digital_skills_self_assessment": "Visoka",
        "q05_gender": "Muški",
        "q06_age_group": "30–39",
        "q07_education_level": "Master studije",
        "q07_education_level_other": "",
        "q08_education_field": "Pravo",
        "q08_education_field_other": "",
        "q09_work_location": "Veliki grad",
        "q10_institution_type": "Advokatura (privatni sektor)",
        "q10_institution_type_other": "",
        "q11_digital_tools_experience": "Često",
        "q12_prior_ai_tool_use": "Često",
        "q13_tested_query": "nasledio sam kucu kako da je uknjizim",
        "q14_problem_complexity": "Srednje složen",
        "q15_expected_answer": "Korake i institucije",
        "q16_correct_institution": 4,
        "q17_clear_next_institution": 5,
        "q18_no_irrelevant_institutional_referrals": 4,
        "q19_practical_orientation_usefulness": 5,
        "q20_concrete_next_step_possible": 5,
        "q21_contacts_links_eservices_useful": 4,
        "q22_answer_relevant": 5,
        "q23_information_accurate_reliable": 4,
        "q24_no_significant_inaccuracies": 4,
        "q25_clear_understandable": 5,
        "q26_structure_helps_navigation": 5,
        "q27_language_suitable_for_non_lawyer": 5,
        "q28_trust_as_initial_information": 4,
        "q29_useful_for_access_to_justice": 5,
        "q30_willing_to_use_in_practice": 5,
        "q31_overall_satisfaction": 5,
        "q32_met_expectations": 4,
        "q33_identified_correct_institution": "Da",
        "q34_relevant_contacts_or_eservices": "Delimično",
        "q35_good_enough_for_real_user": "Samo uz dodatnu proveru",
        "q36_manual_search_time": "5–15 min",
        "q37_error_types": ["Nedostaje konkretan sledeći korak", "Drugo"],
        "q37_error_types_other": "Treba više detalja o taksama",
        "q38_most_useful_part": "Jasan sled koraka",
        "q39_improvement_suggestion": "Dodati više primera",
        "q40_missing_information": "Nedostajao je rok",
        "q41_role_perspective_priority": "Pravna tačnost",
        "q41_role_perspective_priority_other": "",
    }


def test_quota_unlock_flow() -> None:
    reset_session_store_for_tests()
    sid = "quota-session"
    for _ in range(10):
        allowed, _ = consume_question_quota(sid)
        assert allowed is True
    allowed, _ = consume_question_quota(sid)
    assert allowed is False

    unlock_questions_after_survey(sid, questions=10)
    allowed, _ = consume_question_quota(sid)
    assert allowed is True


def test_submission_validation_rejects_invalid_likert() -> None:
    payload = _valid_submission_payload()
    payload["q16_correct_institution"] = 7
    try:
        SurveySubmissionRequest.model_validate(payload)
    except Exception:
        return
    raise AssertionError("Expected validation error for likert out of range")


def test_submission_validation_requires_q39() -> None:
    payload = _valid_submission_payload()
    payload["q39_improvement_suggestion"] = ""
    try:
        SurveySubmissionRequest.model_validate(payload)
    except Exception:
        return
    raise AssertionError("Expected validation error for missing q39")


def test_summary_and_csv_include_expected_fields() -> None:
    records = [
        {
            "id": "1",
            "timestamp": "2026-05-03T00:00:00Z",
            **_valid_submission_payload(),
        },
        {
            "id": "2",
            "timestamp": "2026-05-03T00:01:00Z",
            **_valid_submission_payload(),
            "q16_correct_institution": 2,
            "q33_identified_correct_institution": "Ne",
        },
    ]
    summary = calculate_survey_summary(records)
    assert summary["total_responses"] == 2
    assert "institutional_orientation" in summary["dimension_averages"]
    assert "q16_correct_institution" in summary["likert_averages"]

    csv_payload = build_survey_csv(records)
    assert "q01_professional_role" in csv_payload
    assert "q41_role_perspective_priority_other" in csv_payload
    assert "q37_error_types" in csv_payload
