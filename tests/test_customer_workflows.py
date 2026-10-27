
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


def login_company(client: httpx.Client) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={
            "email": required_env("COREBRICK_TEST_COMPANY_EMAIL"),
            "password": required_env("COREBRICK_TEST_COMPANY_PASSWORD"),
        },
    )

    assert response.status_code == 200, (
        f"Company login failed: HTTP {response.status_code}: "
        f"{response.text[:300]}"
    )

    token = response.json().get("access_token")
    assert token, "Company login response did not contain an access token."

    return {"Authorization": f"Bearer {token}"}


def approved_project_id(client: httpx.Client) -> str:
    response = client.get("/projects/public")
    assert response.status_code == 200

    projects = response.json()
    assert projects, "No approved public projects are available for testing."

    return str(projects[0]["id"])


def test_customer_enquiry_can_be_managed_by_company():
    suffix = uuid.uuid4().hex[:10]

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        company_headers = login_company(client)
        project_id = approved_project_id(client)

        customer_email = f"test.customer.{suffix}@example.com"
        customer_phone = f"9{uuid.uuid4().int % 1_000_000_000:09d}"
        message = f"Automated enquiry test {suffix}"

        # Submit an enquiry as a guest customer.
        create_response = client.post(
            "/enquiries",
            json={
                "project_id": project_id,
                "customer_name": f"Test Customer {suffix}",
                "customer_email": customer_email,
                "customer_phone": customer_phone,
                "subject": "Automated test enquiry",
                "message": message,
            },
        )

        assert create_response.status_code == 201, (
            f"Enquiry submission failed: HTTP "
            f"{create_response.status_code}: "
            f"{create_response.text[:400]}"
        )

        # Company must be able to retrieve the enquiry.
        list_response = client.get(
            "/company/enquiries",
            headers=company_headers,
        )
        assert list_response.status_code == 200

        enquiry = next(
            (
                item
                for item in list_response.json()
                if item.get("customer_email") == customer_email
            ),
            None,
        )

        assert enquiry is not None, (
            "Submitted enquiry was not found in the Company listing."
        )
        assert enquiry["status"] == "new"

        # Company updates the enquiry status.
        update_response = client.patch(
            f"/company/enquiries/{enquiry['id']}",
            headers=company_headers,
            json={"status": "in_progress"},
        )
        assert update_response.status_code == 200, (
            f"Enquiry status update failed: HTTP "
            f"{update_response.status_code}: "
            f"{update_response.text[:400]}"
        )

        # Verify the updated status is persisted.
        refreshed_response = client.get(
            "/company/enquiries",
            headers=company_headers,
        )
        assert refreshed_response.status_code == 200

        updated = next(
            (
                item
                for item in refreshed_response.json()
                if item.get("customer_email") == customer_email
            ),
            None,
        )

        assert updated is not None
        assert updated["status"] == "in_progress"


def test_site_visit_starts_requested_and_company_can_confirm():
    suffix = uuid.uuid4().hex[:10]

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        company_headers = login_company(client)
        project_id = approved_project_id(client)

        customer_email = f"test.visit.{suffix}@example.com"
        customer_phone = f"9{uuid.uuid4().int % 1_000_000_000:09d}"

        requested_at = (
            datetime.now(timezone.utc) + timedelta(days=7)
        ).isoformat()

        # Submit a site-visit request for the future.
        create_response = client.post(
            "/site-visits",
            json={
                "project_id": project_id,
                "customer_name": f"Test Visitor {suffix}",
                "customer_email": customer_email,
                "customer_phone": customer_phone,
                "requested_at": requested_at,
            },
        )

        assert create_response.status_code == 201, (
            f"Site-visit submission failed: HTTP "
            f"{create_response.status_code}: "
            f"{create_response.text[:400]}"
        )

        created = create_response.json()
        if "status" in created:
            assert created["status"] == "requested", (
                "A new site-visit request should not be automatically confirmed."
            )

        # Company must be able to retrieve the request.
        list_response = client.get(
            "/company/site-visits",
            headers=company_headers,
        )
        assert list_response.status_code == 200

        visit = next(
            (
                item
                for item in list_response.json()
                if item.get("customer_email") == customer_email
            ),
            None,
        )

        assert visit is not None, (
            "Submitted site visit was not found in the Company listing."
        )
        assert visit["status"] == "requested"

        notes = f"Automated test confirmation {suffix}"

        # Company confirms the visit and saves a note.
        update_response = client.patch(
            f"/company/site-visits/{visit['id']}",
            headers=company_headers,
            json={
                "status": "confirmed",
                "company_notes": notes,
            },
        )

        assert update_response.status_code == 200, (
            f"Site-visit update failed: HTTP "
            f"{update_response.status_code}: "
            f"{update_response.text[:400]}"
        )

        # Verify that the new status and notes are persisted.
        refreshed_response = client.get(
            "/company/site-visits",
            headers=company_headers,
        )
        assert refreshed_response.status_code == 200

        updated = next(
            (
                item
                for item in refreshed_response.json()
                if item.get("customer_email") == customer_email
            ),
            None,
        )

        assert updated is not None
        assert updated["status"] == "confirmed"
        assert updated.get("company_notes") == notes
