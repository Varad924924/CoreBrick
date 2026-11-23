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

type Tab = "overview" | "enquiries" | "architects" | "projects" | "site-visits" | "audit-logs";
type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
type SiteVisitStatus = (typeof SITE_VISIT_STATUSES)[number];
type ProjectReviewFilter = "all" | "needs-review" | "ready";
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

type CompanyEnquiryProject = Omit<CompanyProject, "architect_profile_id" | "architect_name">;

type CompanyEnquiryDetails = {
  enquiry: CompanyEnquiry;
  project: CompanyEnquiryProject | null;
  architect: ArchitectApplication | null;
  floors: CompanyProjectFloor[];
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

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function AppTabButton({
  active,
  children,
  onClick,
  count,
  icon,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  count: number;
  icon: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`cb-nav-item ${active ? "is-active" : ""}`}
    >
      <span className="cb-nav-icon" aria-hidden="true">{icon}</span>
      <span className="cb-nav-label">{children}</span>
      <span className={`cb-nav-count ${active ? "is-active" : ""}`}>{count}</span>
    </button>
  );
}

function CompanyDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditEntityFilter, setAuditEntityFilter] = useState("all");
  const [auditRoleFilter, setAuditRoleFilter] = useState("all");
  const [auditSort, setAuditSort] = useState<"newest" | "oldest">("newest");
  const [visitNotes, setVisitNotes] = useState<Record<string, string>>({});
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  const [imageReviewNotes, setImageReviewNotes] = useState<Record<string, string>>({});
  const [loginLoading, setLoginLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enquirySearch, setEnquirySearch] = useState("");
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState<"all" | EnquiryStatus>("all");
  const [selectedEnquiry, setSelectedEnquiry] = useState<CompanyEnquiry | null>(null);
  const [enquiryDetails, setEnquiryDetails] = useState<CompanyEnquiryDetails | null>(null);
  const [enquiryDetailsLoading, setEnquiryDetailsLoading] = useState(false);
  const [enquiryDetailsError, setEnquiryDetailsError] = useState("");
  const [enquiryDetailsRetryKey, setEnquiryDetailsRetryKey] = useState(0);
  const [architectSearch, setArchitectSearch] = useState("");
  const [architectSort, setArchitectSort] = useState<"oldest" | "newest">("oldest");
  const [selectedArchitect, setSelectedArchitect] = useState<ArchitectApplication | null>(null);
  const [visitSearch, setVisitSearch] = useState("");
  const [visitStatusFilter, setVisitStatusFilter] = useState<"all" | SiteVisitStatus>("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectReviewFilter, setProjectReviewFilter] = useState<ProjectReviewFilter>("all");
  const [projectSort, setProjectSort] = useState<"newest" | "oldest" | "title">("newest");

  // Fetch the full Company-only context when the detail dialog opens.
  useEffect(() => {
    if (!token || !selectedEnquiry) {
      setEnquiryDetails(null);
      setEnquiryDetailsLoading(false);
      setEnquiryDetailsError("");
      return;
    }

    const enquiryId = selectedEnquiry.id;
    const controller = new AbortController();
    setEnquiryDetails(null);
    setEnquiryDetailsLoading(true);
    setEnquiryDetailsError("");

    async function loadEnquiryDetails() {
      try {
        const details = await apiRequest<CompanyEnquiryDetails>(
          `/company/enquiries/${enquiryId}/details`,
          token,
          {},
          controller.signal,
        );
        if (!controller.signal.aborted) setEnquiryDetails(details);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setEnquiryDetailsError(
            err instanceof Error ? err.message : "Unable to load the full enquiry details.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setEnquiryDetailsLoading(false);
      }
    }

    void loadEnquiryDetails();
    return () => controller.abort();
  }, [token, selectedEnquiry?.id, enquiryDetailsRetryKey]);

  const filteredEnquiries = enquiries.filter((item) => {
    const query = enquirySearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [
        item.customer_name,
        item.customer_email,
        item.customer_phone,
        item.project_title ?? "",
        item.subject ?? "",
        item.message,
      ].some((value) => value.toLowerCase().includes(query));
    const matchesStatus =
      enquiryStatusFilter === "all" || item.status === enquiryStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const enquiryFilterCounts = [
    { status: "all" as const, label: "All enquiries", count: enquiries.length },
    ...ENQUIRY_STATUSES.map((status) => ({
      status,
      label: prettyStatus(status),
      count: enquiries.filter((item) => item.status === status).length,
    })),
  ];

  const filteredArchitects = [...architects]
    .filter((architect) => {
      const query = architectSearch.trim().toLowerCase();
      if (!query) return true;
      const linkedPendingProjects = projects.filter(
        (project) => project.architect_profile_id === architect.id,
      );
      return [
        architect.full_name,
        architect.email,
        architect.phone,
        architect.bio ?? "",
        architect.id,
        ...linkedPendingProjects.flatMap((project) => [project.title, project.city, project.state]),
      ].some((value) => value.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      const dateA = new Date(a.account_created_at).getTime();
      const dateB = new Date(b.account_created_at).getTime();
      return architectSort === "newest" ? dateB - dateA : dateA - dateB;
    });

  const filteredSiteVisits = siteVisits.filter((visit) => {
    const query = visitSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [
        visit.project_title,
        visit.customer_name,
        visit.customer_email,
        visit.customer_phone,
        visit.company_notes ?? "",
        visit.status,
      ].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = visitStatusFilter === "all" || visit.status === visitStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const siteVisitFilterCounts = [
    { status: "all" as const, label: "All requests", count: siteVisits.length },
    ...SITE_VISIT_STATUSES.map((status) => ({
      status,
      label: prettyStatus(status),
      count: siteVisits.filter((visit) => visit.status === status).length,
    })),
  ];

  const pendingProjectImageCount = Object.values(projectImages)
    .flat()
    .filter((image) => image.review_status === "pending_review").length;
  const rejectedProjectImageCount = Object.values(projectImages)
    .flat()
    .filter((image) => image.review_status === "rejected").length;
  const readyProjectCount = reviewDetailsLoading ? 0 : projects.filter((project) =>
    (projectImages[project.id] ?? []).every((image) => image.review_status === "approved"),
  ).length;

  const projectReviewFilterCounts: Array<{ status: ProjectReviewFilter; label: string; count: number }> = [
    { status: "all", label: "All projects", count: projects.length },
    {
      status: "needs-review",
      label: "Images need review",
      count: reviewDetailsLoading ? 0 : projects.filter((project) =>
        (projectImages[project.id] ?? []).some((image) => image.review_status !== "approved"),
      ).length,
    },
    { status: "ready", label: "Ready for decision", count: readyProjectCount },
  ];

  const filteredProjects = [...projects]
    .filter((project) => {
      const query = projectSearch.trim().toLowerCase();
      const matchesSearch = !query || [
        project.title,
        project.description ?? "",
        project.property_type,
        project.building_type ?? "",
        project.architectural_style ?? "",
        project.city,
        project.state,
        project.architect_name,
      ].some((value) => value.toLowerCase().includes(query));
      const images = projectImages[project.id] ?? [];
      const hasUnresolvedImages = images.some((image) => image.review_status !== "approved");
      const matchesFilter = projectReviewFilter === "all" || (!reviewDetailsLoading && (
        (projectReviewFilter === "needs-review" && hasUnresolvedImages) ||
        (projectReviewFilter === "ready" && !hasUnresolvedImages)
      ));
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (projectSort === "title") return a.title.localeCompare(b.title);
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return projectSort === "newest" ? dateB - dateA : dateA - dateB;
    });

  const newEnquiryCount = enquiries.filter((item) => item.status === "new").length;
  const requestedSiteVisitCount = siteVisits.filter((visit) => visit.status === "requested").length;
  const actionQueueCount = newEnquiryCount + architects.length + projects.length + requestedSiteVisitCount;
  const enquiryStatusCounts = ENQUIRY_STATUSES.map((status) => ({
    status,
    count: enquiries.filter((item) => item.status === status).length,
  }));
  const maxEnquiryStatusCount = Math.max(1, ...enquiryStatusCounts.map((item) => item.count));
  const siteVisitStatusCounts = SITE_VISIT_STATUSES.map((status) => ({
    status,
    count: siteVisits.filter((visit) => visit.status === status).length,
  }));
  const maxSiteVisitStatusCount = Math.max(1, ...siteVisitStatusCounts.map((item) => item.count));

  const auditActionOptions = Array.from(new Set(auditLogs.map((entry) => entry.action).filter(Boolean))).sort();
  const auditEntityOptions = Array.from(new Set(auditLogs.map((entry) => entry.entity_type).filter(Boolean))).sort();
  const auditRoleOptions = Array.from(new Set(auditLogs.map((entry) => entry.actor_role).filter(Boolean))).sort();
  const auditTodayCount = auditLogs.filter((entry) => {
    const date = new Date(entry.created_at);
    return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
  }).length;
  const auditActorCount = new Set(auditLogs.map((entry) => entry.actor_email).filter(Boolean)).size;
  const auditActionTypeCount = auditActionOptions.length;
  const filteredAuditLogs = [...auditLogs]
    .filter((entry) => {
      const query = auditSearch.trim().toLowerCase();
      const detailsText = entry.details ? (JSON.stringify(entry.details) ?? "") : "";
      const matchesSearch = !query || [
        entry.actor_email,
        entry.actor_role,
        entry.action,
        entry.entity_type,
        entry.entity_id ?? "",
        detailsText,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesSearch &&
        (auditActionFilter === "all" || entry.action === auditActionFilter) &&
        (auditEntityFilter === "all" || entry.entity_type === auditEntityFilter) &&
        (auditRoleFilter === "all" || entry.actor_role === auditRoleFilter);
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return auditSort === "newest" ? dateB - dateA : dateA - dateB;
    });
  const hasAuditFilters = Boolean(
    auditSearch.trim() || auditActionFilter !== "all" || auditEntityFilter !== "all" || auditRoleFilter !== "all",
  );

  function clearAuditFilters() {
    setAuditSearch("");
    setAuditActionFilter("all");
    setAuditEntityFilter("all");
    setAuditRoleFilter("all");
  }

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
  }, [token, activeTab, auditRefreshKey]);

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
    const previousEnquiry = enquiries.find((item) => item.id === enquiryId);

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
      setSelectedEnquiry((current) =>
        current?.id === updated.id ? updated : current,
      );

      // A status-specific filter would hide the card after a successful move.
      // Reset to All so the Company can immediately see the saved status.
      if (
        enquiryStatusFilter !== "all" &&
        previousEnquiry?.status === enquiryStatusFilter &&
        updated.status !== previousEnquiry.status
      ) {
        setEnquiryStatusFilter("all");
        setNotice(
          `Enquiry status updated to ${prettyStatus(updated.status)}. Showing all enquiries.`,
        );
      } else {
        setNotice("Enquiry status updated.");
      }
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
    const previousStatus = visit.status;
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
      if (
        visitStatusFilter !== "all" &&
        previousStatus === visitStatusFilter &&
        updated.status !== previousStatus
      ) {
        setVisitStatusFilter("all");
        setNotice(`Site-visit status updated to ${prettyStatus(updated.status)}. Showing all requests.`);
      } else {
        setNotice("Site-visit request updated.");
      }
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
      setSelectedArchitect((current) => current?.id === architectId ? null : current);
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
    <main className="corebrick-dashboard min-h-screen">
      <div className="cb-dashboard-shell">
        <aside className="cb-sidebar" aria-label="Company dashboard navigation">
          <a href="/" className="cb-brand" aria-label="Core Brick home">
            <span className="cb-brand-main">CORE<span>BRICK</span><b>.</b></span>
            <span className="cb-brand-caption">COMPANY WORKSPACE</span>
          </a>

          <div className="cb-sidebar-section-label">WORKSPACE</div>
          <nav className="cb-sidebar-nav" role="tablist" aria-label="Company management sections">
            <AppTabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")} count={actionQueueCount} icon="▦">
              Overview
            </AppTabButton>
            <AppTabButton active={activeTab === "enquiries"} onClick={() => setActiveTab("enquiries")} count={enquiries.length} icon="✉">
              Enquiries
            </AppTabButton>
            <AppTabButton active={activeTab === "architects"} onClick={() => setActiveTab("architects")} count={architects.length} icon="◎">
              Architects
            </AppTabButton>
            <AppTabButton active={activeTab === "projects"} onClick={() => setActiveTab("projects")} count={projects.length} icon="⌂">
              Project approvals
            </AppTabButton>
            <AppTabButton active={activeTab === "site-visits"} onClick={() => setActiveTab("site-visits")} count={siteVisits.length} icon="◷">
              Site visits
            </AppTabButton>
            <AppTabButton active={activeTab === "audit-logs"} onClick={() => setActiveTab("audit-logs")} count={auditLogs.length} icon="≡">
              Audit history
            </AppTabButton>
          </nav>

          <div className="cb-sidebar-footnote">
            <span className="cb-sidebar-status-dot" />
            <div>
              <strong>Private workspace</strong>
              <span>Company operations</span>
            </div>
          </div>
        </aside>

        <div className="cb-main-panel">
          <header className="cb-topbar">
            <div className="cb-topbar-title">
              <span>CORE BRICK <i>/</i> COMPANY</span>
              <strong>Operations workspace</strong>
            </div>
            <div className="cb-topbar-actions">
              <button
                type="button"
                onClick={() => setRefreshKey((current) => current + 1)}
                disabled={listLoading}
                className="cb-action-button cb-refresh-button"
              >
                <span aria-hidden="true">↻</span>
                {listLoading ? "Refreshing..." : "Refresh data"}
              </button>
              <button type="button" onClick={logout} className="cb-action-button cb-signout-button">
                Sign out <span aria-hidden="true">↗</span>
              </button>
            </div>
          </header>

          <section className="cb-content">
        <div className="cb-page-intro">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-800">
          Company operations
        </p>
        <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Management Dashboard</h1>
        <p className="mt-3 text-stone-600">
          Review customer requests, verify architect applications, and control project publication.
        </p>
        </div>

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

        {activeTab === "overview" && (
          <section className="cb-overview mt-8" aria-label="Company operations overview">
            <div className="cb-overview-heading">
              <div>
                <span className="cb-section-eyebrow">LIVE OPERATIONS</span>
                <h2>Workspace overview</h2>
                <p>Monitor the incoming workload and move directly to the items that need attention.</p>
              </div>
              <span className="cb-queue-total">
                <strong>{actionQueueCount}</strong>
                <small>items requiring action</small>
              </span>
            </div>

            <div className="cb-stats-grid mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <button type="button" onClick={() => setActiveTab("enquiries")} className="dashboard-stat cb-metric-card">
                <span className="cb-metric-topline"><span className="cb-metric-icon">✉</span><span className="cb-metric-kicker">CUSTOMER PIPELINE</span></span>
                <span className="cb-metric-label">Total enquiries</span>
                <strong className="cb-metric-value">{enquiries.length}</strong>
                <span className="cb-metric-foot">View all enquiries <b>↗</b></span>
              </button>
              <button type="button" onClick={() => setActiveTab("enquiries")} className="dashboard-stat cb-metric-card">
                <span className="cb-metric-topline"><span className="cb-metric-icon is-copper">✦</span><span className="cb-metric-kicker">NEEDS RESPONSE</span></span>
                <span className="cb-metric-label">New enquiries</span>
                <strong className="cb-metric-value">{newEnquiryCount}</strong>
                <span className="cb-metric-foot">Review new requests <b>↗</b></span>
              </button>
              <button type="button" onClick={() => setActiveTab("architects")} className="dashboard-stat cb-metric-card">
                <span className="cb-metric-topline"><span className="cb-metric-icon is-blue">◎</span><span className="cb-metric-kicker">ONBOARDING</span></span>
                <span className="cb-metric-label">Pending architects</span>
                <strong className="cb-metric-value">{architects.length}</strong>
                <span className="cb-metric-foot">Review applications <b>↗</b></span>
              </button>
              <button type="button" onClick={() => setActiveTab("projects")} className="dashboard-stat cb-metric-card">
                <span className="cb-metric-topline"><span className="cb-metric-icon is-copper">⌂</span><span className="cb-metric-kicker">QUALITY CONTROL</span></span>
                <span className="cb-metric-label">Projects to review</span>
                <strong className="cb-metric-value">{projects.length}</strong>
                <span className="cb-metric-foot">Review project submissions <b>↗</b></span>
              </button>
              <button type="button" onClick={() => setActiveTab("site-visits")} className="dashboard-stat cb-metric-card">
                <span className="cb-metric-topline"><span className="cb-metric-icon is-teal">◷</span><span className="cb-metric-kicker">COORDINATION</span></span>
                <span className="cb-metric-label">Site visits requested</span>
                <strong className="cb-metric-value">{requestedSiteVisitCount}</strong>
                <span className="cb-metric-foot">Coordinate site visits <b>↗</b></span>
              </button>
            </div>

            <div className="cb-overview-panels mt-6">
              <section className="cb-overview-panel" aria-label="Items requiring attention">
                <div className="cb-panel-heading">
                  <div><span className="cb-section-eyebrow">WORK QUEUE</span><h3>Needs your attention</h3></div>
                  <span className="cb-panel-caption">Select an item to manage it</span>
                </div>
                <div className="cb-queue-list">
                  <button type="button" className="cb-queue-item" onClick={() => setActiveTab("enquiries")}>
                    <span className="cb-queue-symbol is-copper">✉</span>
                    <span className="cb-queue-copy"><strong>New customer enquiries</strong><small>Review requirements and update enquiry status</small></span>
                    <span className="cb-queue-count">{newEnquiryCount}</span><span className="cb-queue-arrow">↗</span>
                  </button>
                  <button type="button" className="cb-queue-item" onClick={() => setActiveTab("architects")}>
                    <span className="cb-queue-symbol is-blue">◎</span>
                    <span className="cb-queue-copy"><strong>Architect applications</strong><small>Approve or reject pending registrations</small></span>
                    <span className="cb-queue-count">{architects.length}</span><span className="cb-queue-arrow">↗</span>
                  </button>
                  <button type="button" className="cb-queue-item" onClick={() => setActiveTab("projects")}>
                    <span className="cb-queue-symbol">⌂</span>
                    <span className="cb-queue-copy"><strong>Project submissions</strong><small>Review architectural details, floors and images</small></span>
                    <span className="cb-queue-count">{projects.length}</span><span className="cb-queue-arrow">↗</span>
                  </button>
                  <button type="button" className="cb-queue-item" onClick={() => setActiveTab("site-visits")}>
                    <span className="cb-queue-symbol is-teal">◷</span>
                    <span className="cb-queue-copy"><strong>Site visit requests</strong><small>Coordinate requested customer appointments</small></span>
                    <span className="cb-queue-count">{requestedSiteVisitCount}</span><span className="cb-queue-arrow">↗</span>
                  </button>
                </div>
              </section>

              <section className="cb-overview-panel" aria-label="Operations status summaries">
                <div className="cb-panel-heading">
                  <div><span className="cb-section-eyebrow">STATUS SNAPSHOT</span><h3>Workflow status</h3></div>
                </div>
                <div className="cb-status-group">
                  <div className="cb-status-group-title"><strong>Enquiries</strong><span>{enquiries.length} total</span></div>
                  {enquiryStatusCounts.map(({ status, count }) => (
                    <div className="cb-progress-row" key={status}>
                      <span>{prettyStatus(status)}</span><div className="cb-progress-track"><span className="cb-progress-fill" style={{ width: `${(count / maxEnquiryStatusCount) * 100}%` }} /></div><strong>{count}</strong>
                    </div>
                  ))}
                </div>
                <div className="cb-status-group cb-status-group-secondary">
                  <div className="cb-status-group-title"><strong>Site visits</strong><span>{siteVisits.length} total</span></div>
                  {siteVisitStatusCounts.map(({ status, count }) => (
                    <div className="cb-progress-row" key={status}>
                      <span>{prettyStatus(status)}</span><div className="cb-progress-track"><span className="cb-progress-fill is-copper" style={{ width: `${(count / maxSiteVisitStatusCount) * 100}%` }} /></div><strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {listLoading && (
          <p className="mt-6 text-sm text-stone-500">Loading dashboard data...</p>
        )}

        {activeTab === "enquiries" && (
          <section className="cb-enquiries-section mt-6" aria-label="Customer enquiries">
            <div className="cb-enquiries-heading">
              <div>
                <span className="cb-section-eyebrow">CUSTOMER PIPELINE</span>
                <h2>Customer enquiries</h2>
                <p>Search incoming requests, review customer requirements and keep every conversation moving.</p>
              </div>
              <div className="cb-enquiry-total">
                <strong>{enquiries.length}</strong>
                <span>total enquiries</span>
              </div>
            </div>

            <div className="cb-enquiry-toolbar">
              <label className="cb-enquiry-search">
                <span className="cb-enquiry-search-icon" aria-hidden="true">⌕</span>
                <span className="sr-only">Search enquiries</span>
                <input
                  type="search"
                  value={enquirySearch}
                  onChange={(event) => setEnquirySearch(event.target.value)}
                  placeholder="Search customer, email, phone, project or message"
                />
                {enquirySearch && (
                  <button
                    type="button"
                    onClick={() => setEnquirySearch("")}
                    aria-label="Clear enquiry search"
                    className="cb-enquiry-clear-search"
                  >
                    ×
                  </button>
                )}
              </label>
              <label className="cb-enquiry-status-filter">
                <span>Filter status</span>
                <select
                  value={enquiryStatusFilter}
                  onChange={(event) => setEnquiryStatusFilter(event.target.value as "all" | EnquiryStatus)}
                >
                  <option value="all">All statuses</option>
                  {ENQUIRY_STATUSES.map((status) => (
                    <option key={status} value={status}>{prettyStatus(status)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="cb-enquiry-filter-chips" role="group" aria-label="Quick filter enquiries by status">
              {enquiryFilterCounts.map((filter) => (
                <button
                  key={filter.status}
                  type="button"
                  onClick={() => setEnquiryStatusFilter(filter.status)}
                  className={`cb-enquiry-filter-chip ${enquiryStatusFilter === filter.status ? "is-active" : ""}`}
                  aria-pressed={enquiryStatusFilter === filter.status}
                >
                  <span>{filter.label}</span>
                  <strong>{filter.count}</strong>
                </button>
              ))}
            </div>

            <div className="cb-enquiry-results-line">
              <span>
                Showing <strong>{filteredEnquiries.length}</strong> of <strong>{enquiries.length}</strong> enquiries
              </span>
              {(enquirySearch || enquiryStatusFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setEnquirySearch("");
                    setEnquiryStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {!listLoading && enquiries.length === 0 && (
              <div className="cb-enquiry-empty">
                <span aria-hidden="true">✉</span>
                <strong>No customer enquiries yet</strong>
                <p>Enquiries submitted through the public Core Brick website will appear here.</p>
              </div>
            )}

            {!listLoading && enquiries.length > 0 && filteredEnquiries.length === 0 && (
              <div className="cb-enquiry-empty">
                <span aria-hidden="true">⌕</span>
                <strong>No matching enquiries</strong>
                <p>Try another search term or clear the selected status filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setEnquirySearch("");
                    setEnquiryStatusFilter("all");
                  }}
                >
                  Clear search and filters
                </button>
              </div>
            )}

            <div className="cb-enquiry-list">
              {filteredEnquiries.map((item) => (
                <article key={item.id} className="cb-enquiry-card">
                  <div className="cb-enquiry-card-top">
                    <div className="cb-enquiry-project">
                      <span className="cb-enquiry-project-mark" aria-hidden="true">⌂</span>
                      <div>
                        <span className="cb-enquiry-project-label">PROJECT</span>
                        <strong>{item.project_title ?? "Project no longer available"}</strong>
                      </div>
                    </div>
                    <time dateTime={item.created_at}>Submitted {formatDate(item.created_at)}</time>
                  </div>

                  <div className="cb-enquiry-card-title-row">
                    <div>
                      <span className={`cb-enquiry-status-pill status-${item.status}`}>
                        <i aria-hidden="true" />
                        {prettyStatus(item.status)}
                      </span>
                      <h3>{item.subject || "Project enquiry"}</h3>
                    </div>
                    <label className="cb-enquiry-status-control">
                      <span>Update status</span>
                      <select
                        value={item.status}
                        disabled={busyAction === `enquiry:${item.id}`}
                        onChange={(event) => changeEnquiryStatus(item.id, event.target.value as EnquiryStatus)}
                        aria-label={`Update enquiry status for ${item.customer_name}`}
                      >
                        {ENQUIRY_STATUSES.map((status) => (
                          <option key={status} value={status}>{prettyStatus(status)}</option>
                        ))}
                      </select>
                      {busyAction === `enquiry:${item.id}` && <small>Saving status…</small>}
                    </label>
                  </div>

                  <div className="cb-enquiry-detail-grid">
                    <div className="cb-enquiry-customer-block">
                      <span className="cb-enquiry-block-label">CUSTOMER DETAILS</span>
                      <strong>{item.customer_name}</strong>
                      <a href={`mailto:${item.customer_email}`}>{item.customer_email}</a>
                      <a href={`tel:${item.customer_phone}`}>{item.customer_phone}</a>
                    </div>
                    <div className="cb-enquiry-message-block">
                      <span className="cb-enquiry-block-label">MESSAGE</span>
                      <p>{item.message || "No message was provided."}</p>
                    </div>
                  </div>

                  <div className="cb-enquiry-card-footer">
                    <span>Last updated {formatDate(item.updated_at)}</span>
                    <button type="button" onClick={() => setSelectedEnquiry(item)}>
                      View full enquiry <b aria-hidden="true">↗</b>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "architects" && (
          <section className="cb-architects-section mt-6" aria-label="Architect applications">
            <div className="cb-architects-heading">
              <div>
                <span className="cb-section-eyebrow">ARCHITECT ONBOARDING</span>
                <h2>Architect applications</h2>
                <p>Review professional profiles and decide which architects can join the Core Brick network.</p>
              </div>
              <div className="cb-architects-total" aria-label={`${architects.length} pending applications`}>
                <strong>{architects.length}</strong>
                <span>pending review</span>
              </div>
            </div>

            <div className="cb-architect-toolbar">
              <label className="cb-architect-search">
                <span aria-hidden="true">⌕</span>
                <span className="sr-only">Search architect applications</span>
                <input
                  type="search"
                  value={architectSearch}
                  onChange={(event) => setArchitectSearch(event.target.value)}
                  placeholder="Search name, email, phone, bio or application ID"
                />
                {architectSearch && (
                  <button
                    type="button"
                    onClick={() => setArchitectSearch("")}
                    aria-label="Clear architect search"
                  >
                    ×
                  </button>
                )}
              </label>
              <label className="cb-architect-sort">
                <span>Sort applications</span>
                <select
                  value={architectSort}
                  onChange={(event) => setArchitectSort(event.target.value as "oldest" | "newest")}
                >
                  <option value="oldest">Oldest first</option>
                  <option value="newest">Newest first</option>
                </select>
              </label>
            </div>

            <div className="cb-architect-results-line">
              <span>Showing <strong>{filteredArchitects.length}</strong> of <strong>{architects.length}</strong> pending applications</span>
              <span className="cb-architect-queue-note"><i aria-hidden="true" /> Pending approval queue</span>
            </div>

            {!listLoading && architects.length === 0 && (
              <div className="cb-architect-empty">
                <span aria-hidden="true">◎</span>
                <strong>No pending architect applications</strong>
                <p>New architect registrations that complete email verification will appear here for Company review.</p>
              </div>
            )}

            {!listLoading && architects.length > 0 && filteredArchitects.length === 0 && (
              <div className="cb-architect-empty">
                <span aria-hidden="true">⌕</span>
                <strong>No matching applications</strong>
                <p>Try another search term or clear the search field.</p>
                <button type="button" onClick={() => setArchitectSearch("")}>Clear search</button>
              </div>
            )}

            <div className="cb-architect-grid">
              {filteredArchitects.map((architect) => {
                const linkedPendingProjects = projects.filter(
                  (project) => project.architect_profile_id === architect.id,
                );
                const initials = architect.full_name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0).toUpperCase())
                  .join("") || "A";

                return (
                  <article key={architect.id} className="cb-architect-card">
                    <div className="cb-architect-card-head">
                      <div className="cb-architect-identity">
                        <span className="cb-architect-avatar" aria-hidden="true">{initials}</span>
                        <div>
                          <h3>{architect.full_name}</h3>
                          <a href={`mailto:${architect.email}`}>{architect.email}</a>
                        </div>
                      </div>
                      <span className="cb-architect-pending-pill">
                        <i aria-hidden="true" /> Pending
                      </span>
                    </div>

                    <div className="cb-architect-card-meta">
                      <div>
                        <span>PHONE</span>
                        <a href={`tel:${architect.phone}`}>{architect.phone}</a>
                      </div>
                      <div>
                        <span>APPLICATION DATE</span>
                        <strong>{formatDate(architect.account_created_at)}</strong>
                      </div>
                      <div>
                        <span>PENDING PROJECT SUBMISSIONS</span>
                        <strong>{linkedPendingProjects.length}</strong>
                      </div>
                    </div>

                    <p className="cb-architect-card-bio">
                      {architect.bio?.trim() || "No professional bio was provided with this application."}
                    </p>

                    <div className="cb-architect-card-footer">
                      <span>Application ID <code>{architect.id.slice(0, 8)}…</code></span>
                      <button type="button" onClick={() => setSelectedArchitect(architect)}>
                        Review application <b aria-hidden="true">↗</b>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "projects" && (
          <section className="cb-project-review-page" aria-label="Project approval management">
            <div className="cb-project-review-heading">
              <div>
                <span className="cb-section-eyebrow">PUBLICATION CONTROL</span>
                <h2>Project approval management</h2>
                <p>Review project specifications and each uploaded image before publishing a design to the public gallery.</p>
              </div>
              <div className="cb-project-review-pending" aria-label={`${projects.length} projects awaiting Company decision`}>
                <strong>{projects.length}</strong>
                <span>projects awaiting decision</span>
              </div>
            </div>

            <div className="cb-project-review-metrics" aria-label="Project review totals">
              <article>
                <span>PROJECT QUEUE</span>
                <strong>{projects.length}</strong>
                <small>Awaiting Company decision</small>
              </article>
              <article>
                <span>IMAGES PENDING</span>
                <strong>{reviewDetailsLoading ? "—" : pendingProjectImageCount}</strong>
                <small>Individual image reviews</small>
              </article>
              <article className={rejectedProjectImageCount > 0 ? "has-warning" : ""}>
                <span>REJECTED IMAGES</span>
                <strong>{reviewDetailsLoading ? "—" : rejectedProjectImageCount}</strong>
                <small>Architect feedback already recorded</small>
              </article>
              <article className="is-ready">
                <span>READY FOR DECISION</span>
                <strong>{reviewDetailsLoading ? "—" : readyProjectCount}</strong>
                <small>All available images approved</small>
              </article>
            </div>

            <div className="cb-project-review-toolbar">
              <label className="cb-project-review-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="Search project, architect, city or property type"
                  aria-label="Search pending projects"
                />
                {projectSearch && (
                  <button type="button" onClick={() => setProjectSearch("")} aria-label="Clear project search">×</button>
                )}
              </label>
              <label className="cb-project-review-sort">
                <span>Sort projects</span>
                <select value={projectSort} onChange={(event) => setProjectSort(event.target.value as "newest" | "oldest" | "title")}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Project name A–Z</option>
                </select>
              </label>
            </div>

            <div className="cb-project-review-filters" role="group" aria-label="Filter projects by image review status">
              {projectReviewFilterCounts.map((item) => (
                <button
                  key={item.status}
                  type="button"
                  disabled={reviewDetailsLoading && item.status !== "all"}
                  className={projectReviewFilter === item.status ? "is-active" : ""}
                  aria-pressed={projectReviewFilter === item.status}
                  onClick={() => setProjectReviewFilter(item.status)}
                >
                  {item.label}<strong>{item.count}</strong>
                </button>
              ))}
              <span className="cb-project-review-result-count">Showing <strong>{filteredProjects.length}</strong> of {projects.length} projects</span>
            </div>

            {!listLoading && projects.length === 0 && (
              <div className="cb-project-review-empty">
                <span aria-hidden="true">⌂</span>
                <strong>No projects awaiting review</strong>
                <p>New architect submissions will appear here when they are ready for Company review.</p>
              </div>
            )}
            {reviewDetailsLoading && projects.length > 0 && (
              <div className="cb-project-review-loading" role="status">Loading architectural details, floor records and image previews…</div>
            )}
            {!listLoading && !reviewDetailsLoading && projects.length > 0 && filteredProjects.length === 0 && (
              <div className="cb-project-review-empty">
                <span aria-hidden="true">⌕</span>
                <strong>No matching projects</strong>
                <p>Try another search term or change the image-review filter.</p>
                <button type="button" onClick={() => { setProjectSearch(""); setProjectReviewFilter("all"); }}>Clear search and filters</button>
              </div>
            )}

            <div className="cb-project-review-list">
              {filteredProjects.map((project) => {
                const images = projectImages[project.id] ?? [];
                const floors = projectFloors[project.id] ?? [];
                const unresolvedImageCount = images.filter((image) => image.review_status !== "approved").length;
                const approvedImageCount = images.filter((image) => image.review_status === "approved").length;
                const pendingImageCount = images.filter((image) => image.review_status === "pending_review").length;
                const rejectedImageCount = images.filter((image) => image.review_status === "rejected").length;
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
                  <article key={project.id} className="cb-project-review-card">
                    <header className="cb-project-review-card-header">
                      <div className="cb-project-review-title-block">
                        <span className="cb-project-review-type">{project.property_type}</span>
                        <h3>{project.title}</h3>
                        <p>{project.city}, {project.state} <i>·</i> Submitted {formatDate(project.created_at)}</p>
                      </div>
                      <div className="cb-project-review-card-status">
                        <span className="cb-project-pending-pill"><i /> Pending project decision</span>
                        <span className={`cb-project-image-progress ${unresolvedImageCount === 0 ? "is-complete" : "is-pending"}`}>
                          {reviewDetailsLoading ? "Loading image review…" : unresolvedImageCount === 0 ? "Image review complete" : `${unresolvedImageCount} image${unresolvedImageCount === 1 ? "" : "s"} need review`}
                        </span>
                      </div>
                    </header>
                    <div className="cb-project-review-card-overview">
                      <div><span>ARCHITECT</span><strong>{project.architect_name}</strong></div>
                      <div><span>PROPERTY TYPE</span><strong>{project.property_type}</strong></div>
                      <div><span>IMAGE REVIEW</span><strong>{reviewDetailsLoading ? "Loading…" : `${approvedImageCount} / ${images.length} approved`}</strong></div>
                      <div><span>REMAINING ACTIONS</span><strong>{reviewDetailsLoading ? "Loading…" : `${pendingImageCount} pending · ${rejectedImageCount} rejected`}</strong></div>
                    </div>

                    {project.description && <p className="cb-project-review-description">{project.description}</p>}

                    <section className="cb-project-specifications" aria-label={`Architectural details for ${project.title}`}>
                      <div className="cb-project-review-section-heading"><div><span>PROJECT DETAILS</span><h4>Architectural specifications</h4></div></div>
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

                    <section className="cb-project-floors" aria-label={`Floor details for ${project.title}`}>
                      <div className="cb-project-review-section-heading"><div><span>SPATIAL BREAKDOWN</span><h4>Floor breakdown</h4></div>
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

                    <section className="cb-project-images-section" aria-label={`Image review for ${project.title}`}>
                      <div className="cb-project-review-section-heading cb-project-images-heading">
                        <div>
                          <span>ASSET MODERATION</span>
                          <h4>Project image review</h4>
                          <p>Each drawing and render must be reviewed individually before the project can be published.</p>
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

                    <div className="cb-project-review-submitter">
                      <div><span>SUBMITTED BY ARCHITECT</span><strong>{project.architect_name}</strong></div>
                      <small>Submission received {formatDate(project.created_at)}</small>
                    </div>

                    <label className="cb-project-review-decision-note">
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
                      <p className="cb-project-review-warning">
                        Approve or reject every image above before publishing this project. Rejected images must be replaced and approved.
                      </p>
                    )}
                    <div className="cb-project-review-decision-actions">
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
          <section className="cb-site-visits-page" aria-label="Site visit management">
            <div className="cb-site-visits-heading">
              <div>
                <span className="cb-section-eyebrow">CUSTOMER COORDINATION</span>
                <h2>Site visit management</h2>
                <p>Review customer requests, coordinate availability and record each appointment outcome.</p>
              </div>
              <div className="cb-site-visits-pending" aria-label={`${requestedSiteVisitCount} requests awaiting confirmation`}>
                <strong>{requestedSiteVisitCount}</strong>
                <span>awaiting confirmation</span>
              </div>
            </div>

            <div className="cb-site-visit-status-overview" aria-label="Site visit status totals">
              {SITE_VISIT_STATUSES.map((status) => (
                <div className={`cb-site-visit-total status-${status}`} key={status}>
                  <span>{prettyStatus(status)}</span>
                  <strong>{siteVisits.filter((visit) => visit.status === status).length}</strong>
                </div>
              ))}
            </div>

            <div className="cb-site-visit-toolbar">
              <label className="cb-site-visit-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={visitSearch}
                  onChange={(event) => setVisitSearch(event.target.value)}
                  placeholder="Search customer, email, phone, project or notes"
                  aria-label="Search site visits"
                />
                {visitSearch && (
                  <button type="button" onClick={() => setVisitSearch("")} aria-label="Clear site visit search">×</button>
                )}
              </label>
              <span className="cb-site-visit-result-count">
                Showing <strong>{filteredSiteVisits.length}</strong> of {siteVisits.length} requests
              </span>
            </div>

            <div className="cb-site-visit-filters" role="group" aria-label="Filter site visits by status">
              {siteVisitFilterCounts.map((item) => (
                <button
                  type="button"
                  key={item.status}
                  className={visitStatusFilter === item.status ? "is-active" : ""}
                  aria-pressed={visitStatusFilter === item.status}
                  onClick={() => setVisitStatusFilter(item.status)}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            {!listLoading && siteVisits.length === 0 && (
              <div className="cb-site-visit-empty">
                <span aria-hidden="true">◷</span>
                <strong>No site-visit requests yet</strong>
                <p>Customer requests for project visits will appear here.</p>
              </div>
            )}

            {!listLoading && siteVisits.length > 0 && filteredSiteVisits.length === 0 && (
              <div className="cb-site-visit-empty">
                <span aria-hidden="true">⌕</span>
                <strong>No matching requests</strong>
                <p>Try another search term or select a different status.</p>
                <button type="button" onClick={() => { setVisitSearch(""); setVisitStatusFilter("all"); }}>
                  Clear search and filters
                </button>
              </div>
            )}

            {listLoading && siteVisits.length === 0 && (
              <div className="cb-site-visit-loading" role="status">Loading site-visit requests…</div>
            )}

            <div className="cb-site-visit-list">
              {filteredSiteVisits.map((visit) => (
                <article key={visit.id} className="cb-site-visit-card">
                  <div className="cb-site-visit-card-header">
                    <div className="cb-site-visit-project">
                      <span className="cb-site-visit-project-icon" aria-hidden="true">⌂</span>
                      <div>
                        <span className="cb-site-visit-eyebrow">PROJECT</span>
                        <h3>{visit.project_title || "Project details unavailable"}</h3>
                        <p>Submitted {formatDate(visit.created_at)}</p>
                      </div>
                    </div>
                    <span className={`cb-site-visit-status status-${visit.status}`}>
                      <i aria-hidden="true" />
                      {prettyStatus(visit.status)}
                    </span>
                  </div>

                  <div className="cb-site-visit-card-body">
                    <section className="cb-site-visit-customer" aria-label="Customer contact details">
                      <span className="cb-site-visit-eyebrow">CUSTOMER</span>
                      <strong>{visit.customer_name}</strong>
                      <a href={`mailto:${visit.customer_email}`}>{visit.customer_email}</a>
                      <a href={`tel:${visit.customer_phone}`}>{visit.customer_phone}</a>
                    </section>

                    <section className="cb-site-visit-requested" aria-label="Requested appointment date">
                      <span className="cb-site-visit-eyebrow">REQUESTED DATE &amp; TIME</span>
                      <strong>{formatDate(visit.requested_at)}</strong>
                      <span>Customer's requested visit time</span>
                    </section>

                    <section className="cb-site-visit-coordination" aria-label="Company coordination">
                      <label>
                        <span className="cb-site-visit-eyebrow">UPDATE VISIT STATUS</span>
                        <select
                          value={visit.status}
                          disabled={busyAction === `site-visit:${visit.id}`}
                          onChange={(event) => changeSiteVisitStatus(visit, event.target.value as SiteVisitStatus)}
                          aria-label={`Update site visit status for ${visit.customer_name}`}
                        >
                          {SITE_VISIT_STATUSES.map((status) => (
                            <option key={status} value={status}>{prettyStatus(status)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="cb-site-visit-notes-label">
                        <span className="cb-site-visit-eyebrow">PRIVATE COMPANY NOTES</span>
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={visitNotes[visit.id] ?? visit.company_notes ?? ""}
                          onChange={(event) => setVisitNotes((current) => ({ ...current, [visit.id]: event.target.value }))}
                          placeholder="Record availability, coordination details or the outcome of the visit"
                          aria-label={`Private company notes for ${visit.customer_name}`}
                        />
                      </label>
                      <div className="cb-site-visit-card-actions">
                        <span>Notes are visible only to the Company.</span>
                        <button
                          type="button"
                          disabled={busyAction === `site-visit:${visit.id}`}
                          onClick={() => changeSiteVisitStatus(visit, visit.status as SiteVisitStatus)}
                        >
                          {busyAction === `site-visit:${visit.id}` ? "Saving…" : "Save coordination notes"}
                          <b aria-hidden="true">↗</b>
                        </button>
                      </div>
                    </section>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "audit-logs" && (
          <section className="cb-audit-page" aria-label="Audit history">
            <div className="cb-audit-heading">
              <div>
                <span className="cb-section-eyebrow">ACCOUNTABILITY & ACTIVITY</span>
                <h2>Audit history</h2>
                <p>Review recorded actions across the Company workspace, including status changes and project moderation decisions.</p>
              </div>
              <button
                type="button"
                onClick={() => setAuditRefreshKey((current) => current + 1)}
                disabled={auditLoading}
                className="cb-audit-refresh"
              >
                <span aria-hidden="true">↻</span>
                {auditLoading ? "Refreshing history…" : "Refresh history"}
              </button>
            </div>

            <div className="cb-audit-metrics" aria-label="Audit history summary">
              <article>
                <span>TOTAL EVENTS</span>
                <strong>{auditLogs.length}</strong>
                <small>Recorded audit entries</small>
              </article>
              <article>
                <span>RECORDED TODAY</span>
                <strong>{auditTodayCount}</strong>
                <small>Based on your local date</small>
              </article>
              <article>
                <span>ACTORS</span>
                <strong>{auditActorCount}</strong>
                <small>Distinct actor accounts</small>
              </article>
              <article>
                <span>ACTION TYPES</span>
                <strong>{auditActionTypeCount}</strong>
                <small>Distinct recorded actions</small>
              </article>
            </div>

            <div className="cb-audit-tools">
              <label className="cb-audit-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={auditSearch}
                  onChange={(event) => setAuditSearch(event.target.value)}
                  placeholder="Search actor, action, entity, ID or event metadata"
                  aria-label="Search audit history"
                />
                {auditSearch && (
                  <button type="button" onClick={() => setAuditSearch("")} aria-label="Clear audit search">×</button>
                )}
              </label>
              <label className="cb-audit-sort">
                <span>Sort events</span>
                <select value={auditSort} onChange={(event) => setAuditSort(event.target.value as "newest" | "oldest")}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>

            <div className="cb-audit-filter-row" role="group" aria-label="Filter audit events">
              <label>
                <span>Action</span>
                <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
                  <option value="all">All actions</option>
                  {auditActionOptions.map((action) => <option key={action} value={action}>{prettyStatus(action)}</option>)}
                </select>
              </label>
              <label>
                <span>Record type</span>
                <select value={auditEntityFilter} onChange={(event) => setAuditEntityFilter(event.target.value)}>
                  <option value="all">All record types</option>
                  {auditEntityOptions.map((entity) => <option key={entity} value={entity}>{prettyStatus(entity)}</option>)}
                </select>
              </label>
              <label>
                <span>Actor role</span>
                <select value={auditRoleFilter} onChange={(event) => setAuditRoleFilter(event.target.value)}>
                  <option value="all">All roles</option>
                  {auditRoleOptions.map((role) => <option key={role} value={role}>{prettyStatus(role)}</option>)}
                </select>
              </label>
              {hasAuditFilters && (
                <button type="button" className="cb-audit-clear" onClick={clearAuditFilters}>Clear filters</button>
              )}
            </div>

            {auditError && (
              <div className="cb-audit-error" role="alert">
                <strong>Audit history could not be loaded.</strong>
                <span>{auditError}</span>
                <button type="button" onClick={() => setAuditRefreshKey((current) => current + 1)}>Try again</button>
              </div>
            )}

            {auditLoading && auditLogs.length === 0 && (
              <div className="cb-audit-state" role="status">Loading audit history…</div>
            )}

            {!auditLoading && !auditError && auditLogs.length === 0 && (
              <div className="cb-audit-state">
                <span aria-hidden="true">≡</span>
                <strong>No audit events recorded yet</strong>
                <p>Recorded Company actions will appear here when audit events are available.</p>
              </div>
            )}

            {!auditLoading && !auditError && auditLogs.length > 0 && filteredAuditLogs.length === 0 && (
              <div className="cb-audit-state">
                <span aria-hidden="true">⌕</span>
                <strong>No matching audit events</strong>
                <p>Change your search or filters to see other recorded activity.</p>
                <button type="button" onClick={clearAuditFilters}>Clear search and filters</button>
              </div>
            )}

            {auditLogs.length > 0 && (
              <div className="cb-audit-results-heading">
                <span>ACTIVITY LOG</span>
                <p>Showing <strong>{filteredAuditLogs.length}</strong> of {auditLogs.length} events</p>
              </div>
            )}

            <div className="cb-audit-list">
              {filteredAuditLogs.map((entry) => {
                const previousStatus = entry.details?.previous_status;
                const newStatus = entry.details?.new_status;
                const metadata = Object.entries(entry.details ?? {});

                return (
                  <article key={entry.id} className="cb-audit-card">
                    <div className="cb-audit-card-rail" aria-hidden="true"><span /></div>
                    <div className="cb-audit-card-content">
                      <div className="cb-audit-card-top">
                        <div className="cb-audit-event-title">
                          <span className={`cb-audit-action-pill action-${entry.action.toLowerCase().replaceAll("_", "-")}`}>
                            {prettyStatus(entry.action)}
                          </span>
                          <h3>{prettyStatus(entry.entity_type)}</h3>
                        </div>
                        <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                      </div>

                      <div className="cb-audit-identity-row">
                        <div>
                          <span>PERFORMED BY</span>
                          <strong>{entry.actor_email || "Unknown actor"}</strong>
                          <small>{prettyStatus(entry.actor_role || "unknown role")}</small>
                        </div>
                        <div>
                          <span>RECORD ID</span>
                          <strong className="cb-audit-entity-id">{entry.entity_id || "Not provided"}</strong>
                        </div>
                      </div>

                      {typeof previousStatus === "string" && typeof newStatus === "string" && (
                        <div className="cb-audit-transition">
                          <span>STATUS CHANGE</span>
                          <div>
                            <b>{prettyStatus(previousStatus)}</b>
                            <i aria-hidden="true">→</i>
                            <b className="is-new">{prettyStatus(newStatus)}</b>
                          </div>
                        </div>
                      )}

                      {metadata.length > 0 && (
                        <details className="cb-audit-metadata">
                          <summary>View event metadata <span>{metadata.length} {metadata.length === 1 ? "field" : "fields"}</span></summary>
                          <dl>
                            {metadata.map(([key, value]) => (
                              <div key={key}>
                                <dt>{prettyStatus(key)}</dt>
                                <dd>{formatAuditValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                      <p className="cb-audit-reference">Event reference <code>{entry.id}</code></p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {selectedArchitect && (
          <div
            className="cb-architect-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedArchitect(null);
            }}
          >
            <section
              className="cb-architect-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cb-architect-modal-title"
            >
              <header className="cb-architect-modal-header">
                <div>
                  <span className="cb-section-eyebrow">APPLICATION REVIEW</span>
                  <h2 id="cb-architect-modal-title">Architect profile</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedArchitect(null)}
                  aria-label="Close architect application details"
                >
                  ×
                </button>
              </header>

              <div className="cb-architect-modal-body">
                <section className="cb-architect-profile-hero">
                  <div className="cb-architect-avatar cb-architect-avatar-large" aria-hidden="true">
                    {selectedArchitect.full_name
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part.charAt(0).toUpperCase())
                      .join("") || "A"}
                  </div>
                  <div>
                    <span className="cb-architect-pending-pill"><i aria-hidden="true" /> Pending approval</span>
                    <h3>{selectedArchitect.full_name}</h3>
                    <p>Architect applicant · Core Brick professional network</p>
                  </div>
                </section>

                <section className="cb-architect-modal-section" aria-label="Architect contact and account details">
                  <div className="cb-architect-modal-section-heading">
                    <span className="cb-section-eyebrow">CONTACT & ACCOUNT</span>
                    <code>{selectedArchitect.id}</code>
                  </div>
                  <div className="cb-architect-modal-grid">
                    <div>
                      <span>EMAIL ADDRESS</span>
                      <a href={`mailto:${selectedArchitect.email}`}>{selectedArchitect.email}</a>
                    </div>
                    <div>
                      <span>PHONE NUMBER</span>
                      <a href={`tel:${selectedArchitect.phone}`}>{selectedArchitect.phone}</a>
                    </div>
                    <div>
                      <span>APPLICATION SUBMITTED</span>
                      <strong>{formatDate(selectedArchitect.account_created_at)}</strong>
                    </div>
                    <div>
                      <span>ACCOUNT STATUS</span>
                      <strong className="cb-architect-status-value">{prettyStatus(selectedArchitect.approval_status)}</strong>
                    </div>
                  </div>
                </section>

                <section className="cb-architect-modal-section" aria-label="Professional biography">
                  <span className="cb-section-eyebrow">PROFESSIONAL BIO</span>
                  <p className="cb-architect-modal-bio">
                    {selectedArchitect.bio?.trim() || "The applicant has not provided a professional biography."}
                  </p>
                </section>

                <section className="cb-architect-modal-section" aria-label="Related pending project submissions">
                  <div className="cb-architect-modal-section-heading">
                    <span className="cb-section-eyebrow">RELATED PROJECT SUBMISSIONS</span>
                    <span className="cb-architect-project-count">
                      {projects.filter((project) => project.architect_profile_id === selectedArchitect.id).length}
                    </span>
                  </div>
                  {projects.filter((project) => project.architect_profile_id === selectedArchitect.id).length > 0 ? (
                    <div className="cb-architect-linked-projects">
                      {projects
                        .filter((project) => project.architect_profile_id === selectedArchitect.id)
                        .map((project) => (
                          <article key={project.id}>
                            <div>
                              <strong>{project.title}</strong>
                              <span>{project.city}, {project.state}</span>
                            </div>
                            <span className="cb-architect-project-pending">{prettyStatus(project.status)}</span>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <p className="cb-architect-modal-muted">
                      No pending project submissions are currently linked to this application. Architect account approval and individual project approval remain separate decisions.
                    </p>
                  )}
                </section>
              </div>

              <footer className="cb-architect-modal-footer">
                <button
                  type="button"
                  className="cb-architect-reject-button"
                  disabled={busyAction === `architect:${selectedArchitect.id}`}
                  onClick={() => void reviewArchitect(selectedArchitect.id, "reject")}
                >
                  {busyAction === `architect:${selectedArchitect.id}` ? "Saving…" : "Reject application"}
                </button>
                <button
                  type="button"
                  className="cb-architect-approve-button"
                  disabled={busyAction === `architect:${selectedArchitect.id}`}
                  onClick={() => void reviewArchitect(selectedArchitect.id, "approve")}
                >
                  {busyAction === `architect:${selectedArchitect.id}` ? "Saving…" : "Approve architect"}
                </button>
              </footer>
            </section>
          </div>
        )}

        {selectedEnquiry && (
          <div
            className="cb-enquiry-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedEnquiry(null);
            }}
          >
            <section
              className="cb-enquiry-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cb-enquiry-modal-title"
            >
              <header className="cb-enquiry-modal-header">
                <div>
                  <span className="cb-section-eyebrow">ENQUIRY DETAILS</span>
                  <h2 id="cb-enquiry-modal-title">Customer enquiry</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEnquiry(null)}
                  aria-label="Close enquiry details"
                  className="cb-enquiry-modal-close"
                >
                  ×
                </button>
              </header>
              <div className="cb-enquiry-modal-body">
                <div className="cb-enquiry-modal-summary">
                  <span className={`cb-enquiry-status-pill status-${selectedEnquiry.status}`}>
                    <i aria-hidden="true" />
                    {prettyStatus(selectedEnquiry.status)}
                  </span>
                  <h3>{selectedEnquiry.subject || "Project enquiry"}</h3>
                  <p>{selectedEnquiry.project_title ?? "Project no longer available"}</p>
                  <small className="cb-enquiry-reference">Enquiry reference: {selectedEnquiry.id}</small>
                </div>

                <div className="cb-enquiry-modal-grid">
                  <div>
                    <span className="cb-enquiry-block-label">CUSTOMER</span>
                    <strong>{selectedEnquiry.customer_name}</strong>
                    <a href={`mailto:${selectedEnquiry.customer_email}`}>{selectedEnquiry.customer_email}</a>
                    <a href={`tel:${selectedEnquiry.customer_phone}`}>{selectedEnquiry.customer_phone}</a>
                  </div>
                  <div>
                    <span className="cb-enquiry-block-label">SUBMISSION</span>
                    <strong>{formatDate(selectedEnquiry.created_at)}</strong>
                    <span>Last updated {formatDate(selectedEnquiry.updated_at)}</span>
                  </div>
                </div>

                <div className="cb-enquiry-full-message">
                  <span className="cb-enquiry-block-label">CUSTOMER MESSAGE</span>
                  <p>{selectedEnquiry.message || "No message was provided."}</p>
                </div>

                {enquiryDetailsLoading && (
                  <div className="cb-enquiry-context-state" role="status">
                    <span className="cb-enquiry-loading-dot" />
                    Loading linked project, architect and floor information…
                  </div>
                )}

                {enquiryDetailsError && (
                  <div className="cb-enquiry-context-error" role="alert">
                    <strong>Additional project details could not be loaded.</strong>
                    <span>{enquiryDetailsError}</span>
                    <button type="button" onClick={() => setEnquiryDetailsRetryKey((current) => current + 1)}>
                      Retry loading details
                    </button>
                  </div>
                )}

                {enquiryDetails && (
                  <>
                    <section className="cb-enquiry-context-section" aria-label="Linked project details">
                      <div className="cb-enquiry-context-heading">
                        <span className="cb-section-eyebrow">LINKED PROJECT</span>
                        <span className={`cb-enquiry-project-status status-${enquiryDetails.project?.status ?? "unavailable"}`}>
                          {enquiryDetails.project ? prettyStatus(enquiryDetails.project.status) : "Project unavailable"}
                        </span>
                      </div>

                      {enquiryDetails.project ? (
                        <>
                          <h3 className="cb-enquiry-context-title">{enquiryDetails.project.title}</h3>
                          <p className="cb-enquiry-project-location">
                            {enquiryDetails.project.city}, {enquiryDetails.project.state}
                          </p>
                          {enquiryDetails.project.description && (
                            <p className="cb-enquiry-project-description">{enquiryDetails.project.description}</p>
                          )}
                          <div className="cb-enquiry-project-specs">
                            {([
                              ["Property type", enquiryDetails.project.property_type],
                              ["Building type", enquiryDetails.project.building_type],
                              ["Architectural style", enquiryDetails.project.architectural_style],
                              ["BHK", enquiryDetails.project.bhk ? `${enquiryDetails.project.bhk} BHK` : null],
                              ["Plot area", formatQuantity(enquiryDetails.project.plot_area_sqft, " sq. ft.")],
                              ["Plot dimensions", enquiryDetails.project.plot_width_ft != null && enquiryDetails.project.plot_length_ft != null
                                ? `${formatQuantity(enquiryDetails.project.plot_width_ft)} × ${formatQuantity(enquiryDetails.project.plot_length_ft)} ft`
                                : null],
                              ["Built-up area", formatQuantity(enquiryDetails.project.area_sqft, " sq. ft.")],
                              ["Carpet area", formatQuantity(enquiryDetails.project.carpet_area_sqft, " sq. ft.")],
                              ["Floors", formatQuantity(enquiryDetails.project.floor_count)],
                              ["Bedrooms", formatQuantity(enquiryDetails.project.bedroom_count)],
                              ["Bathrooms", formatQuantity(enquiryDetails.project.bathroom_count)],
                              ["Kitchens", formatQuantity(enquiryDetails.project.kitchen_count)],
                              ["Balconies", formatQuantity(enquiryDetails.project.balcony_count)],
                              ["Parking spaces", formatQuantity(enquiryDetails.project.parking_spaces)],
                              ["Facing", enquiryDetails.project.facing],
                              ["Entrance facing", enquiryDetails.project.entrance_facing],
                              ["Estimated construction budget", enquiryDetails.project.estimated_cost_min != null || enquiryDetails.project.estimated_cost_max != null
                                ? `${formatRupees(enquiryDetails.project.estimated_cost_min) ?? "Not specified"} – ${formatRupees(enquiryDetails.project.estimated_cost_max) ?? "Not specified"}`
                                : null],
                            ] as Array<[string, string | null]>).filter(([, value]) => value !== null && value !== "").map(([label, value]) => (
                              <div className="cb-enquiry-project-spec" key={label}>
                                <span>{label}</span>
                                <strong>{value}</strong>
                              </div>
                            ))}
                          </div>
                          {enquiryDetails.project.amenities && enquiryDetails.project.amenities.length > 0 && (
                            <div className="cb-enquiry-project-amenities">
                              <span className="cb-enquiry-block-label">AMENITIES</span>
                              <div>
                                {enquiryDetails.project.amenities.map((amenity) => (
                                  <span key={amenity}>{amenity}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="cb-enquiry-context-muted">
                          This enquiry is not linked to an available project record.
                        </p>
                      )}
                    </section>

                    <section className="cb-enquiry-context-section" aria-label="Project architect details">
                      <div className="cb-enquiry-context-heading">
                        <span className="cb-section-eyebrow">RESPONSIBLE ARCHITECT</span>
                        {enquiryDetails.architect && (
                          <span className="cb-enquiry-project-status">
                            {prettyStatus(enquiryDetails.architect.approval_status)}
                          </span>
                        )}
                      </div>
                      {enquiryDetails.architect ? (
                        <div className="cb-enquiry-architect-card">
                          <div className="cb-enquiry-architect-avatar" aria-hidden="true">
                            {enquiryDetails.architect.full_name.trim().charAt(0).toUpperCase() || "A"}
                          </div>
                          <div className="cb-enquiry-architect-info">
                            <strong>{enquiryDetails.architect.full_name}</strong>
                            <a href={`mailto:${enquiryDetails.architect.email}`}>{enquiryDetails.architect.email}</a>
                            <a href={`tel:${enquiryDetails.architect.phone}`}>{enquiryDetails.architect.phone}</a>
                            {enquiryDetails.architect.bio && <p>{enquiryDetails.architect.bio}</p>}
                          </div>
                        </div>
                      ) : (
                        <p className="cb-enquiry-context-muted">
                          Architect information is unavailable for this project.
                        </p>
                      )}
                    </section>

                    <section className="cb-enquiry-context-section" aria-label="Project floor breakdown">
                      <div className="cb-enquiry-context-heading">
                        <span className="cb-section-eyebrow">FLOOR BREAKDOWN</span>
                        <span className="cb-enquiry-floor-count">
                          {enquiryDetails.floors.length} {enquiryDetails.floors.length === 1 ? "floor" : "floors"}
                        </span>
                      </div>
                      {enquiryDetails.floors.length > 0 ? (
                        <div className="cb-enquiry-floor-list">
                          {enquiryDetails.floors.map((floor) => (
                            <article key={floor.id}>
                              <div>
                                <strong>{floor.floor_name}</strong>
                                <span>Floor {floor.floor_number}</span>
                              </div>
                              <strong>{formatQuantity(floor.area_sqft, " sq. ft.") ?? "Area not specified"}</strong>
                              {floor.description && <p>{floor.description}</p>}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="cb-enquiry-context-muted">No individual floor records were added to this project.</p>
                      )}
                    </section>
                  </>
                )}

                <p className="cb-enquiry-private-note">
                  Customer and architect contact information is available only inside the authenticated Company workspace.
                </p>
              </div>
              <footer className="cb-enquiry-modal-footer">
                <button type="button" onClick={() => setSelectedEnquiry(null)}>
                  Close details
                </button>
              </footer>
            </section>
          </div>
        )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default CompanyDashboard;