import os
import uuid

import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.fail(f"Missing required environment variable: {name}")
    return value


def login(client, email, password, account_type):
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 200, (
        f"{account_type} login failed: HTTP "
        f"{response.status_code}: {response.text[:300]}"
    )

    token = response.json().get("access_token")
    assert token, f"{account_type} login returned no access token."
    return token


def test_project_rejection_workflow():
    architect_email = get_required_env(
        "COREBRICK_TEST_ARCHITECT_EMAIL"
    )
    architect_password = get_required_env(
        "COREBRICK_TEST_ARCHITECT_PASSWORD"
    )
    company_email = get_required_env(
        "COREBRICK_TEST_COMPANY_EMAIL"
    )
    company_password = get_required_env(
        "COREBRICK_TEST_COMPANY_PASSWORD"
    )

    rejection_notes = (
        "Automated test: please add complete project specifications."
    )

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        architect_token = login(
            client,
            architect_email,
            architect_password,
            "Architect",
        )
        company_token = login(
            client,
            company_email,
            company_password,
            "Company",
        )

        architect_headers = {
            "Authorization": f"Bearer {architect_token}"
        }
        company_headers = {
            "Authorization": f"Bearer {company_token}"
        }

        # 1. Architect creates a new project.
        title = f"AUTOMATED TEST - Rejection {uuid.uuid4().hex[:8]}"

        create_response = client.post(
            "/projects",
            headers=architect_headers,
            json={
                "title": title,
                "description": "Automated rejection workflow test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )

        assert create_response.status_code == 201, (
            f"Project creation failed: HTTP "
            f"{create_response.status_code}: "
            f"{create_response.text[:400]}"
        )

        project = create_response.json()
        project_id = str(project["id"])

        assert project["status"] == "pending_review"

        # 2. Company rejects the project and supplies review notes.
        reject_response = client.post(
            f"/company/projects/{project_id}/reject",
            headers=company_headers,
            json={"notes": rejection_notes},
        )

        assert reject_response.status_code == 200, (
            f"Rejection failed: HTTP {reject_response.status_code}: "
            f"{reject_response.text[:400]}"
        )

        # 3. Confirm the rejected project is not publicly visible.
        public_response = client.get("/projects/public")
        assert public_response.status_code == 200

        public_projects = public_response.json()
        assert not any(
            str(item["id"]) == project_id
            for item in public_projects
        ), "Rejected project appeared in public projects."

        # 4. Confirm it is no longer in the pending review queue.
        pending_response = client.get(
            "/company/projects/pending",
            headers=company_headers,
        )
        assert pending_response.status_code == 200

        pending_projects = pending_response.json()
        assert not any(
            str(item["id"]) == project_id
            for item in pending_projects
        ), "Rejected project remains in the pending review queue."

        # 5. Verify rejection status and feedback from the Architect view.
        mine_response = client.get(
            "/projects/mine",
            headers=architect_headers,
        )
        assert mine_response.status_code == 200

        own_projects = mine_response.json()
        rejected_project = next(
            (
                item for item in own_projects
                if str(item["id"]) == project_id
            ),
            None,
        )

        assert rejected_project is not None, (
            "Architect cannot find the rejected project in their projects."
        )
        assert rejected_project["status"] == "rejected"

        # If the API exposes review_notes, verify the submitted feedback.
        if "review_notes" in rejected_project:
            assert rejected_project["review_notes"] == rejection_notes

        print(f"\nRejection workflow passed: {title}")
        print(f"Project ID: {project_id}")