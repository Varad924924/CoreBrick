import os
import uuid

import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0


def required_env(name):
    value = os.getenv(name)
    if not value:
        pytest.fail(f"Missing environment variable: {name}")
    return value


def login(client, email, password, role):
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, (
        f"{role} login failed: HTTP {response.status_code}"
    )

    token = response.json().get("access_token")
    assert token
    return {"Authorization": f"Bearer {token}"}


def test_project_rejection_is_recorded_in_audit_history():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        architect_headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Architect",
        )
        company_headers = login(
            client,
            required_env("COREBRICK_TEST_COMPANY_EMAIL"),
            required_env("COREBRICK_TEST_COMPANY_PASSWORD"),
            "Company",
        )

        # Create a new development project.
        title = f"AUTOMATED TEST - Audit {uuid.uuid4().hex[:8]}"

        created = client.post(
            "/projects",
            headers=architect_headers,
            json={
                "title": title,
                "description": "Audit history integrity test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )
        assert created.status_code == 201, created.text[:300]

        project_id = str(created.json()["id"])
        assert created.json()["status"] == "pending_review"

        # Company rejects the project.
        rejected = client.post(
            f"/company/projects/{project_id}/reject",
            headers=company_headers,
            json={"notes": "Automated audit test: project rejected."},
        )
        assert rejected.status_code == 200, rejected.text[:300]

        # Fetch the audit history.
        audit_response = client.get(
            "/company/audit-logs",
            headers=company_headers,
        )
        assert audit_response.status_code == 200

        logs = audit_response.json()
        if isinstance(logs, dict):
            logs = logs.get("items", [])

        assert isinstance(logs, list)

        matching = [
            entry for entry in logs
            if str(entry.get("entity_id")) == project_id
            and entry.get("action") == "project.rejected"
        ]

        assert matching, (
            "No project.rejected audit entry was found for the rejected project."
        )

        entry = matching[0]
        assert entry.get("entity_type") == "project"

        details = entry.get("details") or {}
        if "from_status" in details:
            assert details["from_status"] == "pending_review"
        if "to_status" in details:
            assert details["to_status"] == "rejected"

        print(f"\nRejection audit test passed for project: {project_id}")