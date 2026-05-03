from fastapi.testclient import TestClient

from api.index import app


client = TestClient(app)


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


def test_survey_endpoint_is_non_blocking() -> None:
    response = client.post(
        "/api/survey",
        json={
            "interactionId": "test-interaction",
            "usefulness": "yes",
            "sourceRelevance": "yes",
            "clarity": "yes",
            "wouldUseAgain": "yes",
            "freeComment": "ok",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "saved" in payload


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
