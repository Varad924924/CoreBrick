# Core Brick

Core Brick is a construction and architectural project platform with a public
project catalogue, architect workspace, and company review workflow.

## Technology stack

- Backend: Python, FastAPI, SQLAlchemy, Alembic
- Database: PostgreSQL
- Frontend: React, TypeScript, Vite
- Authentication: JWT and password hashing
- Email verification: configurable SMTP
- Database runtime: Docker Compose

## Prerequisites

- Python 3.12
- Node.js and npm
- Docker Desktop with Docker Compose
- Git

## Initial setup

Run commands from the project root unless noted otherwise.

### 1. Configure environment variables

Copy the example configuration:

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace all placeholder values with your own local settings. Do not commit `.env`.

Use a strong, unique `JWT_SECRET_KEY` and database password.
For Gmail SMTP, use a Google App Password rather than your normal Gmail password.
Keep all credentials private.

### 2. Start PostgreSQL

```powershell
docker compose up -d postgres
```

Wait for the PostgreSQL container health check to pass.

### 3. Set up the Python backend

```powershell
Set-Location "D:\Projects\CoreBrick"

py -3.12 -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

$env:PYTHONPATH = "D:\Projects\CoreBrick\backend"

.\backend\.venv\Scripts\python.exe -m alembic upgrade head
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir backend
```

The API is available at `http://127.0.0.1:8000`.
Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

### 4. Set up the frontend

Open another PowerShell terminal:

```powershell
Set-Location "D:\Projects\CoreBrick\frontend"
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

The frontend currently uses `http://127.0.0.1:8000` as its API URL.

### 5. Create a company account

After PostgreSQL and the backend are configured, open another PowerShell terminal:

```powershell
Set-Location "D:\Projects\CoreBrick"
$env:PYTHONPATH = "D:\Projects\CoreBrick\backend"

.\backend\.venv\Scripts\python.exe .\backend\scripts\create_company.py
```

The script prompts for the company email and password.

## Architect registration status

The architect sign-up workflow currently supports requesting an email OTP and verifying it. Account completion is deliberately blocked until the required signup-fee payment verification is implemented.

Email verification, architect account approval, and project approval are separate workflow stages.

## Database migrations

Migration scripts are stored in `backend/migrations/versions`.

After reviewing a new migration, apply it with:

```powershell
$env:PYTHONPATH = "D:\Projects\CoreBrick\backend"
.\backend\.venv\Scripts\python.exe -m alembic upgrade head
```

Do not downgrade or reset a database without first confirming the impact and preserving required data.

## Tests and builds

Run backend tests from the repository root using the project's virtual environment and the test-specific configuration expected by each test.

Build the frontend with:

```powershell
Set-Location "D:\Projects\CoreBrick\frontend"
npm run build
```

Do not use production deployment credentials in local tests.

## Sensitive and generated files

The root `.gitignore` excludes local environment files, virtual environments,
frontend dependencies, uploaded project files, backups, and generated caches.

Never commit `.env`, `.env.test`, real credentials, private keys, or production
data. Use `.env.example` only for placeholder configuration.

## Current development status

Development is incremental. Deployment and final regression testing have not
yet been completed.
