import { useEffect, useState, type FormEvent } from "react";
import "./corebrick-dashboard-theme.css";

const API_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "corebrick_company_access_token";

const ENQUIRY_STATUSES = [
  "new",
  "in_progress",
  "contacted",
  "resolved",
  "closed",
] as const;

const SITE_VISIT_STATUSES = [
  "requested",
  "confirmed",
  "rescheduled",
  "completed",
  "cancelled",
] as const;

type Tab = "enquiries" | "architects" | "projects" | "site-visits" | "audit-logs";
type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
type SiteVisitStatus = (typeof SITE_VISIT_STATUSES)[number];
type ReviewAction = "approve" | "reject";

type CompanyEnquiry = {
  id: string;
  project_id: string | null;
  project_title: string | null;
  customer_profile_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  subject: string | null;
  message: string;
  status: EnquiryStatus | string;
  created_at: string;
  updated_at: string;
};

type ArchitectApplication = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  bio: string | null;
  approval_status: string;
  account_created_at: string;
};

type CompanyProject = {
  id: string;
  title: string;
  description: string | null;
  property_type: string;
  city: string;
  state: string;
  area_sqft: number | null;
  building_type: string | null;
  architectural_style: string | null;
  bhk: number | null;
  facing: string | null;
  entrance_facing: string | null;
  plot_area_sqft: number | null;
  plot_width_ft: number | string | null;
  plot_length_ft: number | string | null;
  carpet_area_sqft: number | null;
  floor_count: number | null;
  bedroom_count: number | null;
  bathroom_count: number | null;
  kitchen_count: number | null;
  balcony_count: number | null;
  parking_spaces: number | null;
  estimated_cost_min: number | string | null;
  estimated_cost_max: number | string | null;
  amenities: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  architect_profile_id: string;
  architect_name: string;
};

type CompanyProjectImage = {
  id: string;
  project_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  category: string;
  floor_id: string | null;
  is_cover: boolean;
  review_status: "pending_review" | "approved" | "rejected" | string;
  review_notes: string | null;
  reviewed_at: string | null;
  preview_url?: string;
};

type CompanyProjectFloor = {
  id: string;
  project_id: string;
  floor_name: string;
  floor_number: number;
  description: string | null;
  area_sqft: number | null;
  sort_order: number;
  created_at: string;
};

type CompanySiteVisit = {
  id: string;
  project_id: string;
  project_title: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  requested_at: string;
  status: SiteVisitStatus | string;
  company_notes: string | null;
  created_at: string;
};

type AuditLogEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type LoginResponse = {
  access_token: string;
  token_type: string;
  user: {
    email: string;
    role: string;
    is_active: boolean;
  };
};

type ApiError = Error & { status?: number };

async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    signal,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data &&
      typeof (data as { detail?: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : `Request failed (${response.status}).`;
    const error = new Error(detail) as ApiError;
    error.status = response.status;
    throw error;
  }

  return data as T;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatQuantity(value: number | string | null | undefined, suffix = ""): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value}${suffix}`;
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(numeric)}${suffix}`;
}

function formatRupees(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `₹${value}`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(numeric);
}

const IMAGE_CATEGORY_LABELS: Record<string, string> = {
  floor_plan: "Floor Plans",
  design_2d: "2D Designs",
  elevation_3d: "3D Elevations",
  interior: "Interior Designs",
  exterior: "Exterior Views",
  other: "Other Project Images",
};

function prettyStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function AppTabButton({
  active,
  children,
  onClick,
  count,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-stone-900 text-white"
          : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
      }`}
    >
      {children}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function CompanyDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [activeTab, setActiveTab] = useState<Tab>("enquiries");
  const [enquiries, setEnquiries] = useState<CompanyEnquiry[]>([]);
  const [architects, setArchitects] = useState<ArchitectApplication[]>([]);
  const [projects, setProjects] = useState<CompanyProject[]>([]);
  const [projectImages, setProjectImages] = useState<Record<string, CompanyProjectImage[]>>({});
  const [projectFloors, setProjectFloors] = useState<Record<string, CompanyProjectFloor[]>>({});
  const [reviewDetailsLoading, setReviewDetailsLoading] = useState(false);
  const [siteVisits, setSiteVisits] = useState<CompanySiteVisit[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [visitNotes, setVisitNotes] = useState<Record<string, string>>({});
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  const [imageReviewNotes, setImageReviewNotes] = useState<Record<string, string>>({});
  const [loginLoading, setLoginLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) {
      setEnquiries([]);
      setArchitects([]);
      setProjects([]);
      setProjectImages({});
      setProjectFloors({});
      setSiteVisits([]);
      setAuditLogs([]);
      setAuditError("");
      return;
    }

    const controller = new AbortController();

    async function loadDashboard() {
      setListLoading(true);
      setError("");

      try {
        const [enquiryData, architectData, projectData, siteVisitData] = await Promise.all([
          apiRequest<CompanyEnquiry[]>(
            "/company/enquiries",
            token,
            {},
            controller.signal,
          ),
          apiRequest<ArchitectApplication[]>(
            "/company/architects/pending",
            token,
            {},
            controller.signal,
          ),
          apiRequest<CompanyProject[]>(
            "/company/projects/pending",
            token,
            {},
            controller.signal,
          ),
          apiRequest<CompanySiteVisit[]>(
            "/company/site-visits",
            token,
            {},
            controller.signal,
          ),
        ]);

        setEnquiries(enquiryData);
        setArchitects(architectData);
        setProjects(projectData);
        setSiteVisits(siteVisitData);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        const apiError = err as ApiError;
        if (apiError.status === 401 || apiError.status === 403) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          setError("Your Company session is invalid or lacks permission. Please sign in again with an active Company account.");
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load the Company dashboard.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [token, refreshKey]);

  // Load review-only project floors and images. Pending assets use Company-authenticated
  // endpoints; previews are fetched as blobs because <img> cannot set Authorization headers.
  useEffect(() => {
    if (!token || projects.length === 0) {
      setProjectImages({});
      setProjectFloors({});
      setReviewDetailsLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const objectUrls: string[] = [];

    async function loadReviewDetails() {
      setReviewDetailsLoading(true);

      try {
        const entries = await Promise.all(projects.map(async (project) => {
          let floors: CompanyProjectFloor[] = [];
          let images: CompanyProjectImage[] = [];

          try {
            floors = await apiRequest<CompanyProjectFloor[]>(
              `/company/projects/${project.id}/floors`, token, {}, controller.signal,
            );
          } catch {
            // Keep the project review screen useful even if floor details cannot load.
          }

          try {
            const metadata = await apiRequest<CompanyProjectImage[]>(
              `/company/projects/${project.id}/images`, token, {}, controller.signal,
            );

            images = await Promise.all(metadata.map(async (image) => {
              try {
                const fileResponse = await fetch(`${API_URL}${image.image_url}`, {
                  headers: { Authorization: `Bearer ${token}` },
                  signal: controller.signal,
                });
                if (!fileResponse.ok) return { ...image, preview_url: "" };

                const blob = await fileResponse.blob();
                if (cancelled) return { ...image, preview_url: "" };

                const previewUrl = URL.createObjectURL(blob);
                objectUrls.push(previewUrl);
                return { ...image, preview_url: previewUrl };
              } catch {
                return { ...image, preview_url: "" };
              }
            }));
          } catch {
            // Images may be absent or still uploading; the project details remain visible.
          }

          return { projectId: project.id, floors, images };
        }));

        if (!cancelled) {
          setProjectFloors(Object.fromEntries(entries.map((entry) => [entry.projectId, entry.floors])));
          setProjectImages(Object.fromEntries(entries.map((entry) => [entry.projectId, entry.images])));
        }
      } finally {
        if (!cancelled) setReviewDetailsLoading(false);
      }
    }

    void loadReviewDetails();
    return () => {
      cancelled = true;
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [token, projects]);

  // Load audit history only when the Company opens that tab, so it does not
  // delay the initial dashboard load.
  useEffect(() => {
    if (!token || activeTab !== "audit-logs") return;

    const controller = new AbortController();

    async function loadAuditLogs() {
      setAuditLoading(true);
      setAuditError("");

      try {
        const data = await apiRequest<AuditLogEntry[]>(
          "/company/audit-logs",
          token,
          {},
          controller.signal,
        );
        setAuditLogs(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        const apiError = err as ApiError;
        if (apiError.status === 401 || apiError.status === 403) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          setAuditError("Your Company session is invalid or lacks permission. Please sign in again.");
        } else {
          setAuditError(
            err instanceof Error ? err.message : "Unable to load audit history.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setAuditLoading(false);
      }
    }

    void loadAuditLogs();
    return () => controller.abort();
  }, [token, activeTab, refreshKey]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<LoginResponse>(
        "/auth/login",
        "",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );

      if (result.user.role !== "company" || !result.user.is_active) {
        throw new Error("Please sign in with an active Company account.");
      }

      sessionStorage.setItem(TOKEN_KEY, result.access_token);
      setToken(result.access_token);
      setPassword("");
      setNotice("Signed in successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function changeEnquiryStatus(enquiryId: string, status: EnquiryStatus) {
    setBusyAction(`enquiry:${enquiryId}`);
    setError("");
    setNotice("");

    try {
      const updated = await apiRequest<CompanyEnquiry>(
        `/company/enquiries/${enquiryId}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      setEnquiries((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("Enquiry status updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update enquiry.");
    } finally {
      setBusyAction("");
    }
  }

  async function changeSiteVisitStatus(
    visit: CompanySiteVisit,
    status: SiteVisitStatus,
  ) {
    setBusyAction(`site-visit:${visit.id}`);
    setError("");
    setNotice("");

    try {
      const notes = (visitNotes[visit.id] ?? visit.company_notes ?? "").trim();
      const updated = await apiRequest<CompanySiteVisit>(
        `/company/site-visits/${visit.id}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            company_notes: notes || null,
          }),
        },
      );
      setSiteVisits((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setVisitNotes((current) => ({ ...current, [updated.id]: updated.company_notes ?? "" }));
      setNotice("Site-visit request updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update site visit.");
    } finally {
      setBusyAction("");
    }
  }

  async function reviewArchitect(
    architectId: string,
    action: ReviewAction,
  ) {
    setBusyAction(`architect:${architectId}`);
    setError("");
    setNotice("");

    try {
      await apiRequest<ArchitectApplication>(
        `/company/architects/${architectId}/${action}`,
        token,
        { method: "POST" },
      );
      setNotice(
        action === "approve"
          ? "Architect application approved."
          : "Architect application rejected.",
      );
      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review architect.");
    } finally {
      setBusyAction("");
    }
  }

  async function reviewImage(
    projectId: string,
    imageId: string,
    action: ReviewAction,
  ) {
    const notes = (imageReviewNotes[imageId] ?? "").trim();
    if (action === "reject" && notes.length < 5) {
      setError("Add specific feedback of at least 5 characters before rejecting this image.");
      return;
    }

    setBusyAction(`image:${imageId}`);
    setError("");
    setNotice("");

    try {
      const updated = await apiRequest<CompanyProjectImage>(
        `/company/projects/${projectId}/images/${imageId}/${action}`,
        token,
        {
          method: "POST",
          ...(action === "reject"
            ? {
                body: JSON.stringify({
                  status: "rejected",
                  review_notes: notes,
                }),
              }
            : {}),
        },
      );

      setProjectImages((current) => ({
        ...current,
        [projectId]: (current[projectId] ?? []).map((image) =>
          image.id === imageId
            ? { ...image, ...updated, preview_url: image.preview_url }
            : image,
        ),
      }));
      if (action === "approve") {
        setImageReviewNotes((current) => ({ ...current, [imageId]: "" }));
      }
      setNotice(
        action === "approve"
          ? "Image approved. It can be shown publicly after the project is approved."
          : "Image rejected. Your feedback has been attached to this image for the architect.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review image.");
    } finally {
      setBusyAction("");
    }
  }

  async function reviewProject(projectId: string, action: ReviewAction) {
    if (action === "approve") {
      const unresolved = (projectImages[projectId] ?? []).filter(
        (image) => image.review_status !== "approved",
      );
      if (unresolved.length > 0) {
        setError(`Review every image first. ${unresolved.length} image(s) are still pending or rejected.`);
        return;
      }
    }
    setBusyAction(`project:${projectId}`);
    setError("");
    setNotice("");

    try {
      const body = action === "reject"
        ? JSON.stringify({ notes: projectNotes[projectId]?.trim() || null })
        : undefined;

      await apiRequest<CompanyProject>(
        `/company/projects/${projectId}/${action}`,
        token,
        { method: "POST", ...(body ? { body } : {}) },
      );
      setNotice(
        action === "approve"
          ? "Project approved and published to the public project gallery."
          : "Project rejected. It will not appear in the public gallery.",
      );
      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review project.");
    } finally {
      setBusyAction("");
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setPassword("");
    setNotice("");
    setError("");
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
        <form
          onSubmit={login}
          className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-xl"
        >
          <a href="/" className="text-xl font-black tracking-tight">
            CORE <span className="text-amber-700">BRICK.</span>
          </a>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-amber-800">
            Company portal
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Manage customer enquiries, architect applications, and submitted projects.
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <label className="mt-6 block text-sm font-medium">
            Company email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
            />
          </label>

          <button
            type="submit"
            disabled={loginLoading}
            className="mt-6 w-full rounded-full bg-stone-900 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {loginLoading ? "Signing in..." : "Sign in to Company Portal"}
          </button>

          <a href="/" className="mt-5 block text-center text-sm text-stone-600 hover:text-amber-800">
            Return to public website
          </a>
        </form>
      </main>
    );
  }

  return (
    <main className="corebrick-dashboard min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-8">
          <div>
            <a href="/" className="text-xl font-black tracking-tight">
              CORE <span className="text-amber-700">BRICK.</span>
            </a>
            <p className="mt-1 text-sm text-stone-500">Company portal</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              disabled={listLoading}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100 disabled:opacity-50"
            >
              {listLoading ? "Refreshing..." : "Refresh data"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-800">
          Company operations
        </p>
        <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Management Dashboard</h1>
        <p className="mt-3 text-stone-600">
          Review customer requests, verify architect applications, and control project publication.
        </p>

        {notice && (
          <p role="status" className="mt-5 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Total enquiries</p>
            <p className="mt-2 text-3xl font-semibold">{enquiries.length}</p>
          </div>
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">New enquiries</p>
            <p className="mt-2 text-3xl font-semibold">
              {enquiries.filter((item) => item.status === "new").length}
            </p>
          </div>
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Pending architects</p>
            <p className="mt-2 text-3xl font-semibold">{architects.length}</p>
          </div>
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Projects to review</p>
            <p className="mt-2 text-3xl font-semibold">{projects.length}</p>
          </div>
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Site visits requested</p>
            <p className="mt-2 text-3xl font-semibold">
              {siteVisits.filter((visit) => visit.status === "requested").length}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Company management sections">
          <AppTabButton active={activeTab === "enquiries"} onClick={() => setActiveTab("enquiries")} count={enquiries.length}>
            Enquiries
          </AppTabButton>
          <AppTabButton active={activeTab === "architects"} onClick={() => setActiveTab("architects")} count={architects.length}>
            Architect Applications
          </AppTabButton>
          <AppTabButton active={activeTab === "projects"} onClick={() => setActiveTab("projects")} count={projects.length}>
            Project Approvals
          </AppTabButton>
          <AppTabButton active={activeTab === "site-visits"} onClick={() => setActiveTab("site-visits")} count={siteVisits.length}>
            Site Visits
          </AppTabButton>
          <AppTabButton active={activeTab === "audit-logs"} onClick={() => setActiveTab("audit-logs")} count={auditLogs.length}>
            Audit History
          </AppTabButton>
        </div>

        {listLoading && (
          <p className="mt-6 text-sm text-stone-500">Loading dashboard data...</p>
        )}

        {activeTab === "enquiries" && (
          <section className="mt-6" aria-label="Customer enquiries">
            <h2 className="text-xl font-semibold">Customer Enquiries</h2>
            {!listLoading && enquiries.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
                No enquiries have been submitted yet.
              </div>
            )}
            <div className="mt-4 grid gap-5">
              {enquiries.map((item) => (
                <article key={item.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                        {item.project_title ?? "Project no longer available"}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">{item.subject || "Project enquiry"}</h3>
                      <p className="mt-2 text-sm text-stone-500">Submitted {formatDate(item.created_at)}</p>
                    </div>
                    <label className="text-sm font-medium">
                      Enquiry status
                      <select
                        value={item.status}
                        disabled={busyAction === `enquiry:${item.id}`}
                        onChange={(event) => changeEnquiryStatus(item.id, event.target.value as EnquiryStatus)}
                        className="mt-2 block min-w-40 rounded-lg border border-stone-300 bg-white px-3 py-2.5 disabled:opacity-60"
                      >
                        {ENQUIRY_STATUSES.map((status) => (
                          <option key={status} value={status}>{prettyStatus(status)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-5 grid gap-5 border-t border-stone-100 pt-5 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Customer</p>
                      <p className="mt-2 font-medium">{item.customer_name}</p>
                      <p className="mt-1 break-all text-sm text-stone-600">{item.customer_email}</p>
                      <p className="mt-1 text-sm text-stone-600">{item.customer_phone}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Message</p>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-stone-700">{item.message}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "architects" && (
          <section className="mt-6" aria-label="Architect applications">
            <h2 className="text-xl font-semibold">Pending Architect Applications</h2>
            <p className="mt-2 text-sm text-stone-600">
              Architect contact details are shown only in this Company portal for application review.
            </p>
            {!listLoading && architects.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
                There are no pending architect applications.
              </div>
            )}
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {architects.map((architect) => (
                <article key={architect.id} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold">{architect.full_name}</h3>
                      <p className="mt-1 break-all text-sm text-stone-600">{architect.email}</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-800">
                      {prettyStatus(architect.approval_status)}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-stone-700">Phone: {architect.phone}</p>
                  {architect.bio && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{architect.bio}</p>}
                  <p className="mt-3 text-xs text-stone-500">Applied {formatDate(architect.account_created_at)}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busyAction === `architect:${architect.id}`}
                      onClick={() => reviewArchitect(architect.id, "approve")}
                      className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      {busyAction === `architect:${architect.id}` ? "Saving..." : "Approve architect"}
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === `architect:${architect.id}`}
                      onClick={() => reviewArchitect(architect.id, "reject")}
                      className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "projects" && (
          <section className="mt-6" aria-label="Project approvals">
            <h2 className="text-xl font-semibold">Projects Awaiting Review</h2>
            <p className="mt-2 text-sm text-stone-600">
              Approving a project makes it eligible to appear in the public gallery.
            </p>
            {!listLoading && projects.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
                There are no projects awaiting review.
              </div>
            )}
            {reviewDetailsLoading && projects.length > 0 && (
              <p className="mt-4 text-sm text-stone-500">Loading architectural details, floors and image previews…</p>
            )}
            <div className="mt-4 grid gap-5">
              {projects.map((project) => {
                const images = projectImages[project.id] ?? [];
                const floors = projectFloors[project.id] ?? [];
                const unresolvedImageCount = images.filter((image) => image.review_status !== "approved").length;
                const imagesByCategory = Object.entries(
                  images.reduce<Record<string, CompanyProjectImage[]>>((groups, image) => {
                    const category = image.category || "other";
                    (groups[category] ??= []).push(image);
                    return groups;
                  }, {}),
                );

                const detailRows: Array<[string, string | null]> = [
                  ["Building type", project.building_type],
                  ["Architectural style", project.architectural_style],
                  ["BHK", project.bhk ? `${project.bhk} BHK` : null],
                  ["Facing", project.facing],
                  ["Entrance facing", project.entrance_facing],
                  ["Plot area", formatQuantity(project.plot_area_sqft, " sq. ft.")],
                  ["Plot dimensions", project.plot_width_ft != null && project.plot_length_ft != null
                    ? `${formatQuantity(project.plot_width_ft)} × ${formatQuantity(project.plot_length_ft)} ft`
                    : null],
                  ["Carpet area", formatQuantity(project.carpet_area_sqft, " sq. ft.")],
                  ["Floor count", formatQuantity(project.floor_count)],
                  ["Bedrooms", formatQuantity(project.bedroom_count)],
                  ["Bathrooms", formatQuantity(project.bathroom_count)],
                  ["Kitchens", formatQuantity(project.kitchen_count)],
                  ["Balconies", formatQuantity(project.balcony_count)],
                  ["Parking spaces", formatQuantity(project.parking_spaces)],
                  ["Estimated budget", project.estimated_cost_min != null || project.estimated_cost_max != null
                    ? `${formatRupees(project.estimated_cost_min) ?? "Not specified"} – ${formatRupees(project.estimated_cost_max) ?? "Not specified"}`
                    : null],
                  ["Total area", formatQuantity(project.area_sqft, " sq. ft.")],
                ];

                return (
                  <article key={project.id} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm md:p-7">
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">{project.property_type}</p>
                        <h3 className="mt-2 text-xl font-semibold">{project.title}</h3>
                        <p className="mt-1 text-sm text-stone-600">{project.city}, {project.state}</p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Pending review</span>
                    </div>

                    {project.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-700">{project.description}</p>}

                    <section className="mt-5 rounded-xl bg-stone-50 p-4" aria-label={`Architectural details for ${project.title}`}>
                      <h4 className="font-semibold">Architectural specifications</h4>
                      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                        {detailRows.filter(([, value]) => value !== null && value !== "").map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
                            <dd className="mt-1 break-words text-sm font-medium text-stone-800">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      {project.amenities && project.amenities.length > 0 && (
                        <div className="mt-4 border-t border-stone-200 pt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Amenities</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {project.amenities.map((amenity) => (
                              <span key={amenity} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-700">{amenity}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="mt-5" aria-label={`Floor details for ${project.title}`}>
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-semibold">Floor breakdown</h4>
                        <span className="text-xs text-stone-500">{floors.length} {floors.length === 1 ? "floor" : "floors"}</span>
                      </div>
                      {floors.length > 0 ? (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                              <tr><th className="px-3 py-2">Floor</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Description</th></tr>
                            </thead>
                            <tbody>
                              {floors.map((floor) => (
                                <tr key={floor.id} className="border-t border-stone-100">
                                  <td className="px-3 py-2 font-medium">{floor.floor_name}</td>
                                  <td className="px-3 py-2">{floor.floor_number}</td>
                                  <td className="px-3 py-2">{formatQuantity(floor.area_sqft, " sq. ft.") ?? "—"}</td>
                                  <td className="px-3 py-2 text-stone-600">{floor.description || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-stone-500">No individual floor records were added to this project.</p>
                      )}
                    </section>

                    <section className="mt-6 border-t border-stone-100 pt-5" aria-label={`Image review for ${project.title}`}>
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                        <div>
                          <h4 className="font-semibold">Project images</h4>
                          <p className="mt-1 text-sm text-stone-500">Review the uploaded drawings and renders before approving.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                        <span className="text-stone-500">{images.length} {images.length === 1 ? "image" : "images"}</span>
                        {unresolvedImageCount > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{unresolvedImageCount} need review</span>}
                      </div>
                      </div>
                      {images.length === 0 ? (
                        <p className="mt-3 rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500">No images are available for review yet.</p>
                      ) : (
                        <div className="mt-4 space-y-5">
                          {imagesByCategory.map(([category, categoryImages]) => (
                            <div key={category}>
                              <h5 className="mb-2 text-sm font-semibold text-stone-700">{IMAGE_CATEGORY_LABELS[category] ?? category}</h5>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {categoryImages.map((image) => {
                                  const floor = image.floor_id ? floors.find((item) => item.id === image.floor_id) : undefined;
                                  return (
                                    <figure key={image.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                                      {image.preview_url ? (
                                        <a href={image.preview_url} target="_blank" rel="noreferrer" className="block bg-stone-100" title="Open image in a new tab">
                                          <img src={image.preview_url} alt={image.alt_text || IMAGE_CATEGORY_LABELS[image.category] || "Project image"} loading="lazy" className="h-48 w-full object-contain" />
                                        </a>
                                      ) : (
                                        <div className="flex h-48 items-center justify-center bg-stone-100 px-4 text-center text-sm text-stone-500">Image preview unavailable</div>
                                      )}
                                      <figcaption className="p-3">
                                        <div className="flex flex-wrap gap-2">
                                          {image.is_cover && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Cover image</span>}
                                          {floor && <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-700">{floor.floor_name}</span>}
                                        </div>
                                        <p className="mt-2 text-sm font-medium">{image.alt_text || "No image description"}</p>
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${image.review_status === "approved" ? "bg-green-50 text-green-800" : image.review_status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                                            {prettyStatus(image.review_status || "pending_review")}
                                          </span>
                                          {image.reviewed_at && <span className="text-xs text-stone-400">Reviewed {formatDate(image.reviewed_at)}</span>}
                                        </div>
                                        {image.review_status === "rejected" && image.review_notes && (
                                          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">
                                            <strong>Feedback to architect:</strong> {image.review_notes}
                                          </p>
                                        )}
                                        <label className="mt-3 block text-sm font-medium">
                                          Image-specific feedback (required to reject)
                                          <textarea
                                            rows={2}
                                            maxLength={2000}
                                            value={imageReviewNotes[image.id] ?? (image.review_status === "rejected" ? image.review_notes ?? "" : "")}
                                            onChange={(event) => setImageReviewNotes((current) => ({ ...current, [image.id]: event.target.value }))}
                                            placeholder="e.g. Dimensions are blurry; upload a clearer ground-floor plan."
                                            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-700"
                                          />
                                        </label>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            disabled={busyAction === `image:${image.id}` || image.review_status === "approved"}
                                            onClick={() => void reviewImage(project.id, image.id, "approve")}
                                            className="rounded-full bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {busyAction === `image:${image.id}` ? "Saving..." : image.review_status === "approved" ? "Image approved" : "Approve image"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busyAction === `image:${image.id}`}
                                            onClick={() => void reviewImage(project.id, image.id, "reject")}
                                            className="rounded-full border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                          >
                                            {busyAction === `image:${image.id}` ? "Saving..." : image.review_status === "rejected" ? "Update rejection feedback" : "Reject image + send feedback"}
                                          </button>
                                        </div>
                                      </figcaption>
                                    </figure>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <div className="mt-5 border-t border-stone-100 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Submitted by architect</p>
                      <p className="mt-2 font-medium">{project.architect_name}</p>
                      <p className="mt-1 text-xs text-stone-500">Submitted {formatDate(project.created_at)}</p>
                    </div>

                    <label className="mt-5 block text-sm font-medium">
                      Review note (used if rejecting)
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={projectNotes[project.id] ?? ""}
                        onChange={(event) => setProjectNotes((current) => ({ ...current, [project.id]: event.target.value }))}
                        placeholder="Optional feedback for the architect"
                        className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                      />
                    </label>
                    {unresolvedImageCount > 0 && (
                      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Approve or reject every image above before publishing this project. Rejected images must be replaced and approved.
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busyAction === `project:${project.id}` || reviewDetailsLoading || unresolvedImageCount > 0}
                        onClick={() => reviewProject(project.id, "approve")}
                        className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                      >
                        {busyAction === `project:${project.id}` ? "Saving..." : "Approve & publish"}
                      </button>
                      <button
                        type="button"
                        disabled={busyAction === `project:${project.id}`}
                        onClick={() => reviewProject(project.id, "reject")}
                        className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject project
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "site-visits" && (
          <section className="mt-6" aria-label="Site visit requests">
            <h2 className="text-xl font-semibold">Site Visit Requests</h2>
            <p className="mt-2 text-sm text-stone-600">
              Coordinate requested appointments with customers. A request is not confirmed until the Company updates its status.
            </p>
            {!listLoading && siteVisits.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
                There are no site-visit requests yet.
              </div>
            )}
            <div className="mt-4 grid gap-5">
              {siteVisits.map((visit) => (
                <article key={visit.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                        {visit.project_title}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">Site visit request</h3>
                      <p className="mt-2 text-sm text-stone-500">
                        Requested for {formatDate(visit.requested_at)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Submitted {formatDate(visit.created_at)}
                      </p>
                    </div>
                    <label className="text-sm font-medium">
                      Visit status
                      <select
                        value={visit.status}
                        disabled={busyAction === `site-visit:${visit.id}`}
                        onChange={(event) => changeSiteVisitStatus(visit, event.target.value as SiteVisitStatus)}
                        className="mt-2 block min-w-44 rounded-lg border border-stone-300 bg-white px-3 py-2.5 disabled:opacity-60"
                      >
                        {SITE_VISIT_STATUSES.map((status) => (
                          <option key={status} value={status}>{prettyStatus(status)}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 grid gap-5 border-t border-stone-100 pt-5 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Customer</p>
                      <p className="mt-2 font-medium">{visit.customer_name}</p>
                      <p className="mt-1 break-all text-sm text-stone-600">{visit.customer_email}</p>
                      <p className="mt-1 text-sm text-stone-600">{visit.customer_phone}</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium">
                        Company coordination notes
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={visitNotes[visit.id] ?? visit.company_notes ?? ""}
                          onChange={(event) => setVisitNotes((current) => ({ ...current, [visit.id]: event.target.value }))}
                          placeholder="Record the customer's availability or coordination details"
                          className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busyAction === `site-visit:${visit.id}`}
                        onClick={() => changeSiteVisitStatus(visit, visit.status as SiteVisitStatus)}
                        className="mt-3 rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100 disabled:opacity-50"
                      >
                        {busyAction === `site-visit:${visit.id}` ? "Saving..." : "Save notes"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "audit-logs" && (
          <section className="mt-6" aria-label="Audit history">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-xl font-semibold">Audit History</h2>
                <p className="mt-2 text-sm text-stone-600">
                  Recent Company actions, including status transitions and project review decisions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((current) => current + 1)}
                disabled={auditLoading || listLoading}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-100 disabled:opacity-50"
              >
                {auditLoading ? "Loading history..." : "Refresh history"}
              </button>
            </div>

            {auditError && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {auditError}
              </p>
            )}

            {auditLoading && auditLogs.length === 0 && (
              <p className="mt-6 text-sm text-stone-500">Loading audit history...</p>
            )}

            {!auditLoading && !auditError && auditLogs.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
                No audit events have been recorded yet. New audited Company actions will appear here.
              </div>
            )}

            <div className="mt-4 grid gap-4">
              {auditLogs.map((entry) => {
                const previousStatus = entry.details?.previous_status;
                const newStatus = entry.details?.new_status;

                return (
                  <article key={entry.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                          {prettyStatus(entry.action)}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold">
                          {prettyStatus(entry.entity_type)}
                          {entry.entity_id ? <span className="ml-2 break-all font-mono text-xs font-normal text-stone-500">{entry.entity_id}</span> : null}
                        </h3>
                        <p className="mt-2 text-sm text-stone-600">
                          By {entry.actor_email} · {prettyStatus(entry.actor_role)}
                        </p>
                      </div>
                      <time className="text-sm text-stone-500">
                        {formatDate(entry.created_at)}
                      </time>
                    </div>

                    {typeof previousStatus === "string" && typeof newStatus === "string" && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4 text-sm">
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                          {prettyStatus(previousStatus)}
                        </span>
                        <span aria-hidden="true" className="text-stone-400">→</span>
                        <span className="rounded-full bg-green-50 px-3 py-1 font-semibold text-green-800">
                          {prettyStatus(newStatus)}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default CompanyDashboard;