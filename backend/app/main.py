
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.routers.company import router as company_router
from app.routers.architect_management import router as architect_management_router
from app.routers.architect_documents import router as architect_documents_router
from app.routers.architect_profile import router as architect_profile_router
from app.database import engine
from app.routers.auth import router as auth_router
from app.routers.architect_signup import router as architect_signup_router
from app.routers.architect_password_reset import router as architect_password_reset_router
from app.routers.projects import router as projects_router
from app.routers.company_projects import router as company_projects_router
from fastapi.middleware.cors import CORSMiddleware
from app.routers.enquiries import router as enquiries_router
from pathlib import Path
from app.routers.project_images import router as project_images_router
from app.routers.site_visits import router as site_visits_router
from app.routers.project_floors import router as project_floors_router



app = FastAPI(
    title="Core Brick API",
    description="Backend API for the Core Brick platform",
    version="0.2.0",
)
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
(UPLOAD_ROOT / "architect_photos").mkdir(parents=True, exist_ok=True)
app.mount("/uploads/architect_photos", StaticFiles(directory=str(UPLOAD_ROOT / "architect_photos")), name="architect-profile-photos")



app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(architect_signup_router)
app.include_router(architect_password_reset_router)
app.include_router(company_router)
app.include_router(architect_management_router)
app.include_router(architect_documents_router)
app.include_router(architect_profile_router)
app.include_router(projects_router)
app.include_router(company_projects_router)
app.include_router(enquiries_router)
app.include_router(project_images_router)
app.include_router(site_visits_router)
app.include_router(project_floors_router)

@app.get("/")
def root():
    return {
        "message": "Welcome to Core Brick API",
        "status": "running",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/health/database")
def database_health():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database()"))
        database_name = result.scalar_one()

    return {
        "status": "connected",
        "database": database_name,
    }
