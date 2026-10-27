import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 15.0


def get_approved_project_id(client):
    response = client.get("/projects/public", timeout=TIMEOUT)
    assert response.status_code == 200

    projects = response.json()
    assert projects, "No approved project is available for testing."

    return str(projects[0]["id"])


def submit_site_visit(client, project_id, requested_at):
    suffix = uuid.uuid4().hex[:10]

    return client.post(
        "/site-visits",
        json={
            "project_id": project_id,
            "customer_name": f"Date Test {suffix}",
            "customer_email": f"date-test-{suffix}@example.com",
            "customer_phone": f"9{uuid.uuid4().int % 1_000_000_000:09d}",
            "requested_at": requested_at,
        },
        timeout=TIMEOUT,
    )


def test_site_visit_rejects_past_date():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        project_id = get_approved_project_id(client)

        past_date = (
            datetime.now(timezone.utc) - timedelta(days=1)
        ).isoformat()

        response = submit_site_visit(client, project_id, past_date)

        assert 400 <= response.status_code < 500, (
            "A past site-visit date should be rejected, but received "
            f"HTTP {response.status_code}: {response.text[:300]}"
        )


def test_site_visit_rejects_datetime_without_timezone():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        project_id = get_approved_project_id(client)

        # Deliberately omit the timezone offset.
        naive_date = (
            datetime.now() + timedelta(days=5)
        ).isoformat(timespec="seconds")

        response = submit_site_visit(client, project_id, naive_date)

        assert 400 <= response.status_code < 500, (
            "A timezone-naive site-visit date should be rejected, but received "
            f"HTTP {response.status_code}: {response.text[:300]}"
        )
