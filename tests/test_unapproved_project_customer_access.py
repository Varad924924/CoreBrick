import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0


def required_env(name: str) -> str:
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


def assert_customer_requests_blocked(client, project_id, suffix):
    customer = {
        "customer_name": f"Test Customer {suffix}",
        "customer_email": f"blocked-{suffix}@example.com",
        "customer_phone": f"9{uuid.uuid4().int % 1_000_000_000:09d}",
    }

    enquiry = client.post(
        "/enquiries",
        json={
            **customer,
            "project_id": project_id,
            "subject": "Unapproved project test",
            "message": "This enquiry should be rejected.",
        },
    )
    assert 400 <= enquiry.status_code < 500, (
        f"Enquiry for unapproved project was not rejected: "
        f"HTTP {enquiry.status_code}"
    )

    visit = client.post(
        "/site-visits",
        json={
            **customer,
            "customer_email": f"visit-{suffix}@example.com",
            "project_id": project_id,
            "requested_at": (
                datetime.now(timezone.utc) + timedelta(days=7)
            ).isoformat(),
        },
    )
    assert 400 <= visit.status_code < 500, (
        f"Site visit for unapproved project was not rejected: "
        f"HTTP {visit.status_code}"
    )


def test_customers_cannot_submit_requests_for_pending_or_rejected_projects():
    suffix = uuid.uuid4().hex[:10]

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

        # Create a project that is awaiting review.
        created = client.post(
            "/projects",
            headers=architect_headers,
            json={
                "title": f"AUTOMATED TEST - Unapproved {suffix}",
                "description": "Customer access security test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )
        assert created.status_code == 201, created.text[:300]

        project_id = str(created.json()["id"])
        assert created.json()["status"] == "pending_review"

        # Enquiries and visits must be rejected while pending.
        assert_customer_requests_blocked(client, project_id, suffix + "p")

        # Company rejects the project.
        rejected = client.post(
            f"/company/projects/{project_id}/reject",
            headers=company_headers,
            json={"notes": "Automated test: project rejected."},
        )
        assert rejected.status_code == 200, rejected.text[:300]

        # Enquiries and visits must also be rejected after rejection.
        assert_customer_requests_blocked(client, project_id, suffix + "r")

        # Confirm the rejected project is not publicly listed.
        public_response = client.get("/projects/public")
        assert public_response.status_code == 200
        assert not any(
            str(item["id"]) == project_id
            for item in public_response.json()
        )