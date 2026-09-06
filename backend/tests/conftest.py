import pytest
from fastapi.testclient import TestClient

from backend.app.main import SESSION_STORE, app


@pytest.fixture(autouse=True)
def isolate_application_state(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    SESSION_STORE.clear()
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    SESSION_STORE.clear()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
