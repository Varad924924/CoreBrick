import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 15.0


def test_public_projects_endpoint():
    """The public projects endpoint should be accessible."""
    response = httpx.get(
        f"{BASE_URL}/projects/public",
        timeout=TIMEOUT,
    )

    assert response.status_code == 200

    projects = response.json()
    assert isinstance(projects, list)

    # If status is exposed by the API, public projects must be approved.
    for project in projects:
        if "status" in project:
            assert project["status"] == "approved"


@pytest.mark.parametrize(
    "endpoint",
    [
        "/company/architects/pending",
        "/company/enquiries",
        "/company/site-visits",
        "/company/audit-logs",
        "/company/projects/pending",
    ],
)
def test_company_endpoints_require_authentication(endpoint):
    """Private Company endpoints must reject unauthenticated requests."""
    response = httpx.get(
        f"{BASE_URL}{endpoint}",
        timeout=TIMEOUT,
    )

    assert response.status_code in (401, 403), (
        f"{endpoint} returned {response.status_code}; "
        "expected 401 or 403 without authentication."
    )