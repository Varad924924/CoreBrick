
import os
import uuid

import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.fail(
            f"Missing {name}. Supply the test credentials in PowerShell."
        )
    return value


def login(
    client: httpx.Client,
    email: str,
    password: str,
    account_type: str,
) -> str:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 200, (
        f"{account_type} login failed with HTTP "
        f"{response.status_code}: {response.text[:300]}"
    )

    token = response.json().get("access_token")
    assert token, f"{account_type} login returned no access token."
    return token


def test_project_approval_workflow():
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

    with httpx.Client(
        base_url=BASE_URL,
        timeout=TIMEOUT,
    ) as client:
        # 1. Authenticate both roles.
        architect_token = login(
            client, architect_email, architect_password, "Architect"
        )
        company_token = login(
            client, company_email, company_password, "Company"
        )

        architect_headers = {
            "Authorization": f"Bearer {architect_token}"
        }
        company_headers = {
            "Authorization": f"Bearer {company_token}"
        }

        # 2. Create a uniquely named test project.
        title = f"AUTOMATED TEST - Approval {uuid.uuid4().hex[:8]}"

        create_response = client.post(
            "/projects",
            headers=architect_headers,
            json={
                "title": title,
                "description": "Automated project approval workflow test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )

        assert create_response.status_code == 201, (
            f"Project creation failed: HTTP "
            f"{create_response.status_code}: "
            f"{create_response.text[:500]}"
        )

        project = create_response.json()
        project_id = str(project["id"])

        assert project["status"] == "pending_review", (
            f"New project status was {project.get('status')!r}, "
            "expected 'pending_review'."
        )

        # 3. Verify that the pending project is not public.
        public_response = client.get("/projects/public")
        assert public_response.status_code == 200

        public_ids = {
            str(item["id"]) for item in public_response.json()
        }
        assert project_id not in public_ids, (
            "A project awaiting review appeared in public projects."
        )

        # 4. Verify that Company can see the pending project.
        pending_response = client.get(
            "/company/projects/pending",
            headers=company_headers,
        )
        assert pending_response.status_code == 200

        pending_projects = pending_response.json()
        assert any(
            str(item["id"]) == project_id
            for item in pending_projects
        ), "Company could not find the submitted project for review."

        # 5. Approve the project as Company.
        approval_response = client.post(
            f"/company/projects/{project_id}/approve",
            headers=company_headers,
        )
        assert approval_response.status_code == 200, (
            f"Approval failed: HTTP "
            f"{approval_response.status_code}: "
            f"{approval_response.text[:500]}"
        )

        # 6. Verify that the project is now publicly visible.
        final_response = client.get("/projects/public")
        assert final_response.status_code == 200

        approved_projects = final_response.json()
        approved_project = next(
            (
                item
                for item in approved_projects
                if str(item["id"]) == project_id
            ),
            None,
        )

        assert approved_project is not None, (
            "The approved project did not appear in public projects."
        )
        assert approved_project["status"] == "approved"

        print(f"\nWorkflow passed for test project: {title}")
        print(f"Project ID: {project_id}")
