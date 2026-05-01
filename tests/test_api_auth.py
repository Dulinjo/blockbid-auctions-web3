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
