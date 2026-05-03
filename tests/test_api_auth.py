from fastapi.testclient import TestClient

from api.index import app


client = TestClient(app)


def _sample_full_survey(session_id: str, tested_query: str = "test query") -> dict:
    return {
        "sessionId": session_id,
        "q01_professional_role": "Advokat",
        "q01_professional_role_other": "",
        "q02_years_experience": "3–5",
        "q03_direct_work_frequency": "Često",
        "q04_digital_skills_self_assessment": "Visoka",
        "q05_gender": "Ne želim da se izjasnim",
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
        "q13_tested_query": tested_query,
        "q14_problem_complexity": "Srednje složen",
        "q15_expected_answer": "Jasan sledeci korak",
        "q16_correct_institution": 4,
        "q17_clear_next_institution": 4,
        "q18_no_irrelevant_institutional_referrals": 4,
        "q19_practical_orientation_usefulness": 4,
        "q20_concrete_next_step_possible": 4,
        "q21_contacts_links_eservices_useful": 4,
        "q22_answer_relevant": 4,
        "q23_information_accurate_reliable": 4,
        "q24_no_significant_inaccuracies": 4,
        "q25_clear_understandable": 4,
        "q26_structure_helps_navigation": 4,
        "q27_language_suitable_for_non_lawyer": 4,
        "q28_trust_as_initial_information": 4,
        "q29_useful_for_access_to_justice": 4,
        "q30_willing_to_use_in_practice": 4,
        "q31_overall_satisfaction": 4,
        "q32_met_expectations": 4,
        "q33_identified_correct_institution": "Da",
        "q34_relevant_contacts_or_eservices": "Da",
        "q35_good_enough_for_real_user": "Samo uz dodatnu proveru",
        "q36_manual_search_time": "5–15 min",
        "q37_error_types": ["Nema značajnih problema"],
        "q37_error_types_other": "",
        "q38_most_useful_part": "Jasan opis",
        "q39_improvement_suggestion": "Dodati jos primera",
        "q40_missing_information": "",
        "q41_role_perspective_priority": "Pravna tačnost",
        "q41_role_perspective_priority_other": "",
    }


def test_upload_requires_admin_cookie() -> None:
    response = client.post(
        "/api/upload",
        files={"file": ("proba.pdf", b"dummy", "application/pdf")},
    )
    assert response.status_code == 401
    assert "autentikacija" in response.json()["detail"].lower()


def test_reindex_requires_admin_cookie() -> None:
    response = client.post("/api/reindex")
    assert response.status_code == 401
    assert "autentikacija" in response.json()["detail"].lower()


def test_upload_many_requires_admin_cookie() -> None:
    response = client.post(
        "/api/upload-multiple",
        files=[
            ("files", ("prvi.pdf", b"dummy", "application/pdf")),
            ("files", ("drugi.pdf", b"dummy", "application/pdf")),
        ],
    )
    assert response.status_code == 401
    assert "autentikacija" in response.json()["detail"].lower()


def test_chat_regulation_lookup_does_not_fall_back_to_empty_rag(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")
    monkeypatch.delenv("SLUZBENI_GLASNIK_API_URL", raising=False)

    response = client.post(
        "/api/chat",
        json={"query": "Kojim propisima je regulisan ugovor o radu?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "Baza dokumenata trenutno nije indeksirana" not in payload["answer"]
    structured = payload.get("structured", {})
    assert structured.get("intent") in {
        "REGULATION_LOOKUP",
        "LEGAL_SITUATION_ANALYSIS",
        "COMBINED_REGULATION_AND_CASE_LAW",
    }


def test_chat_explicit_echr_query_runs_without_local_index_dependency(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")

    response = client.post(
        "/api/chat",
        json={
            "query": (
                "da li je u Strazburu bilo presuda protiv Srbije zbog dugog trajanja sudskih postupaka "
                "mislim na sudjenje u razumnom roku"
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    structured = payload.get("structured", {})
    intake = structured.get("intake", {})
    assert intake.get("needsEchrCheck") is True
    assert intake.get("needsClarification") is False
    assert intake.get("routingDecision") == "run_echr_serbia_first_search"
    assert intake.get("needsCaseLawSearch") is False
    echr_debug = structured.get("echrDebug", {})
    assert echr_debug.get("echrExplicitMention") is True
    assert echr_debug.get("localCaseLawRequired") is False
    assert echr_debug.get("localIndexRequired") is False
    assert "razumnom roku" in payload.get("answer", "").lower()


def test_chat_soft_limit_blocks_11th_request_and_requires_survey(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")

    session_id = "limit-session"
    for index in range(10):
        response = client.post(
            "/api/chat",
            json={"query": f"Pitanje broj {index + 1} o ugovoru o radu", "sessionId": session_id},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload.get("rate_limited") is not True

    blocked = client.post(
        "/api/chat",
        json={"query": "Jedanaesto pitanje koje treba da bude blokirano", "sessionId": session_id},
    )
    assert blocked.status_code == 200
    payload = blocked.json()
    assert payload.get("rate_limited") is True
    assert payload.get("survey_required") is True
    assert payload.get("citations") == []
    assert "Dostigli ste broj besplatnih pitanja" in payload.get("answer", "")


def test_survey_submission_unlocks_questions_again(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")

    session_id = "unlock-session"
    for index in range(10):
        response = client.post(
            "/api/chat",
            json={"query": f"Pitanje {index + 1} za unlock tok", "sessionId": session_id},
        )
        assert response.status_code == 200

    blocked = client.post(
        "/api/chat",
        json={"query": "Sada treba survey", "sessionId": session_id},
    )
    assert blocked.status_code == 200
    assert blocked.json().get("survey_required") is True

    survey_response = client.post("/api/survey", json=_sample_full_survey(session_id, "Sada treba survey"))
    assert survey_response.status_code == 200
    survey_json = survey_response.json()
    assert survey_json.get("saved") is True
    assert survey_json.get("questions_unlocked", 0) >= 10

    resumed = client.post(
        "/api/chat",
        json={"query": "Nakon ankete treba da radi", "sessionId": session_id},
    )
    assert resumed.status_code == 200
    resumed_payload = resumed.json()
    assert resumed_payload.get("survey_required") is not True
    assert resumed_payload.get("rate_limited") is not True


def test_survey_validation_enforces_required_fields_and_likert_range() -> None:
    response = client.post(
        "/api/survey",
        json={
            "sessionId": "invalid-survey-session",
            "q01_professional_role": "Advokat",
            "q02_years_experience": "3–5",
            "q03_direct_work_frequency": "Često",
            "q04_digital_skills_self_assessment": "Visoka",
            "q13_tested_query": "Test",
            "q14_problem_complexity": "Srednje složen",
            "q15_expected_answer": "Test",
            "q16_correct_institution": 7,
            "q17_clear_next_institution": 4,
            "q18_no_irrelevant_institutional_referrals": 4,
            "q19_practical_orientation_usefulness": 4,
            "q20_concrete_next_step_possible": 4,
            "q21_contacts_links_eservices_useful": 4,
            "q22_answer_relevant": 4,
            "q23_information_accurate_reliable": 4,
            "q24_no_significant_inaccuracies": 4,
            "q25_clear_understandable": 4,
            "q26_structure_helps_navigation": 4,
            "q27_language_suitable_for_non_lawyer": 4,
            "q28_trust_as_initial_information": 4,
            "q29_useful_for_access_to_justice": 4,
            "q30_willing_to_use_in_practice": 4,
            "q31_overall_satisfaction": 4,
            "q32_met_expectations": 4,
            "q33_identified_correct_institution": "Da",
            "q34_relevant_contacts_or_eservices": "Da",
            "q35_good_enough_for_real_user": "Samo uz dodatnu proveru",
            "q36_manual_search_time": "5–15 min",
            "q37_error_types": ["Pravna nepreciznost"],
            "q39_improvement_suggestion": "",
        },
    )
    assert response.status_code == 422


def test_chat_inheritance_followup_whole_procedure_uses_orientation_not_clarification(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ENABLE_LEGAL_INTAKE_AGENT", "false")
    monkeypatch.setenv("ENABLE_E_SERVICES_GUIDE", "false")
    monkeypatch.delenv("SLUZBENI_GLASNIK_API_URL", raising=False)

    session_id = "inheritance-session"
    first = client.post(
        "/api/chat",
        json={"query": "nasledio sam kucu kako da je uknjizim", "sessionId": session_id},
    )
    assert first.status_code == 200
    first_payload = first.json()
    assert "postupak obično ide ovako" in first_payload["answer"].lower()
    assert "na koji konkretan postupak mislite" not in first_payload["answer"].lower()

    followup = client.post(
        "/api/chat",
        json={"query": "ceo postupak", "sessionId": session_id},
    )
    assert followup.status_code == 200
    payload = followup.json()
    assert "postupak obično ide ovako" in payload["answer"].lower()
    assert "na koji konkretan postupak mislite" not in payload["answer"].lower()


def test_admin_survey_endpoints_require_admin_cookie() -> None:
    surveys = client.get("/api/admin/surveys")
    csv_export = client.get("/api/admin/surveys.csv")
    json_export = client.get("/api/admin/surveys.json")
    assert surveys.status_code == 401
    assert csv_export.status_code == 401
    assert json_export.status_code == 401


def test_admin_survey_exports_work_with_admin_cookie() -> None:
    session_id = "admin-survey-export-session"
    submit = client.post("/api/survey", json=_sample_full_survey(session_id, "admin export test"))
    assert submit.status_code == 200

    cookies = {"lexvibe_admin": "ok"}
    surveys = client.get("/api/admin/surveys", cookies=cookies)
    assert surveys.status_code == 200
    surveys_payload = surveys.json()
    assert surveys_payload.get("total_count", 0) >= 1
    assert "summary" in surveys_payload
    assert "responses" in surveys_payload

    csv_export = client.get("/api/admin/surveys.csv", cookies=cookies)
    assert csv_export.status_code == 200
    assert "text/csv" in csv_export.headers.get("content-type", "")
    csv_text = csv_export.text
    assert "q01_professional_role" in csv_text
    assert "q41_role_perspective_priority_other" in csv_text

    json_export = client.get("/api/admin/surveys.json", cookies=cookies)
    assert json_export.status_code == 200
    json_payload = json_export.json()
    assert "summary" in json_payload
    assert "responses" in json_payload
