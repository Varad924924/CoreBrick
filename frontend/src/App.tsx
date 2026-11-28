import "./App.css";
import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import CompanyDashboard from "./CompanyDashboard";
import ArchitectDashboard from "./ArchitectDashboard";
import { AIHomeDesignPage } from "./features/ai-home-design";

type Project = {
  id: string;
  title: string;
  description: string | null;
  property_type: string;
  city: string;
  state: string;

  area_sqft: number | null;
  plot_area_sqft: number | null;
  carpet_area_sqft: number | null;

  bhk: number | null;
  floor_count: number | null;
  bedroom_count: number | null;
  bathroom_count: number | null;
  kitchen_count?: number | null;
  balcony_count?: number | null;
  parking_spaces?: number | null;
  amenities?: string[] | null;
  facing: string | null;

  architectural_style: string | null;

  estimated_cost_min: number | string | null;
  estimated_cost_max: number | string | null;

  status: string;
};

type ProjectImage = {
  id: string;
  project_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  floor_id: string | null;
  category: string;
};

type ProjectFloor = {
  id: string;
  project_id: string;
  floor_name: string;
  floor_number: number;
  description: string | null;
  area_sqft: number | null;
  sort_order: number;
  created_at: string;
};

type DiscoveryFilters = {
  search: string;
  city: string;
  state: string;
  property_type: string;
  min_plot_area_sqft: string;
  max_plot_area_sqft: string;
  min_budget_inr: string;
  max_budget_inr: string;
  bhk: string;
  floor_count: string;
  facing: string;
  architectural_style: string;

  min_plot_width_ft: string;
  max_plot_width_ft: string;
  min_plot_length_ft: string;
  max_plot_length_ft: string;

  min_area_sqft: string;
  max_area_sqft: string;

  min_carpet_area_sqft: string;
  max_carpet_area_sqft: string;

  bedroom_count: string;
  bathroom_count: string;
  parking_spaces: string;

  entrance_facing: string;
};

const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = {
  search: "",
  city: "",
  state: "",
  property_type: "",
  min_plot_area_sqft: "",
  max_plot_area_sqft: "",
  min_budget_inr: "",
  max_budget_inr: "",
  bhk: "",
  floor_count: "",
  facing: "",
  architectural_style: "",

  min_plot_width_ft: "",
  max_plot_width_ft: "",
  min_plot_length_ft: "",
  max_plot_length_ft: "",

  min_area_sqft: "",
  max_area_sqft: "",

  min_carpet_area_sqft: "",
  max_carpet_area_sqft: "",

  bedroom_count: "",
  bathroom_count: "",
  parking_spaces: "",

  entrance_facing: "",
};

const DISCOVERY_FILTER_LABELS: Record<keyof DiscoveryFilters, string> = {
  search: "Search",
  city: "City",
  state: "State",
  property_type: "Property type",
  min_plot_area_sqft: "Minimum plot area",
  max_plot_area_sqft: "Maximum plot area",
  min_budget_inr: "Minimum construction budget",
  max_budget_inr: "Maximum construction budget",
  bhk: "BHK",
  floor_count: "Floors",
  facing: "Facing",
  architectural_style: "Architectural style",
  min_plot_width_ft: "Minimum plot width",
  max_plot_width_ft: "Maximum plot width",
  min_plot_length_ft: "Minimum plot length",
  max_plot_length_ft: "Maximum plot length",
  min_area_sqft: "Minimum built-up area",
  max_area_sqft: "Maximum built-up area",
  min_carpet_area_sqft: "Minimum carpet area",
  max_carpet_area_sqft: "Maximum carpet area",
  bedroom_count: "Bedrooms",
  bathroom_count: "Bathrooms",
  parking_spaces: "Parking spaces",
  entrance_facing: "Entrance direction",
};

function resolveImageUrl(imageUrl: string): string {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

type EnquiryForm = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  subject: string;
  message: string;
};

const EMPTY_ENQUIRY: EnquiryForm = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  subject: "",
  message: "",
};

const API_URL = "http://127.0.0.1:8000";
const MHD_FAVOURITES_STORAGE_KEY = "mhd_favourite_project_ids_v1";

function readGuestFavouriteIds(): string[] {
  try {
    const raw = window.localStorage.getItem(MHD_FAVOURITES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function formatINR(value: number | string | null): string {
  if (value === null || value === "") return "";

  const amount = Number(value);

  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function PublicSite() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allPublicProjects, setAllPublicProjects] = useState<Project[]>([]);
  const [favouriteProjectIds, setFavouriteProjectIds] = useState<string[]>(() => readGuestFavouriteIds());
  const [activePublicPage, setActivePublicPage] = useState<"home" | "projects" | "shortlist" | "gallery">("home");
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null);
  const [projectImages, setProjectImages] = useState<Record<string, ProjectImage[]>>({});
  const [projectFloorsByProject, setProjectFloorsByProject] = useState<Record<string, ProjectFloor[]>>({});
  const [compareProjects, setCompareProjects] = useState<Project[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterDraft, setFilterDraft] =
  useState<DiscoveryFilters>(EMPTY_DISCOVERY_FILTERS);

const [appliedFilters, setAppliedFilters] =
  useState<DiscoveryFilters>(EMPTY_DISCOVERY_FILTERS);

  const [sortBy, setSortBy] = useState("newest");
  function navigateToSection(
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string
  ) {
    event.preventDefault();
    setPendingSectionId(sectionId);
    setActivePublicPage("home");
  }

  useEffect(() => {
    if (activePublicPage !== "home" || !pendingSectionId) return;

    const section = document.getElementById(pendingSectionId);
    if (!section) return;

    // Wait for the homepage view to become visible before calculating its position.
    requestAnimationFrame(() => {
      const header = document.querySelector(".mhd-site-header");
      const headerOffset = header instanceof HTMLElement ? header.offsetHeight : 0;
      const top =
        pendingSectionId === "home"
          ? 0
          : section.getBoundingClientRect().top + window.scrollY - headerOffset - 12;

      window.scrollTo({ top, behavior: "smooth" });
      setPendingSectionId(null);
    });
  }, [activePublicPage, pendingSectionId]);


  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [enquiryForm, setEnquiryForm] = useState<EnquiryForm>(EMPTY_ENQUIRY);
  const [enquirySending, setEnquirySending] = useState(false);
  const [enquiryError, setEnquiryError] = useState("");
  const [enquirySuccess, setEnquirySuccess] = useState("");
  const [siteVisitProject, setSiteVisitProject] = useState<Project | null>(null);
  const [siteVisitForm, setSiteVisitForm] = useState<SiteVisitForm>(EMPTY_SITE_VISIT);
  const [siteVisitSending, setSiteVisitSending] = useState(false);
  const [siteVisitError, setSiteVisitError] = useState("");
  const [siteVisitSuccess, setSiteVisitSuccess] = useState("");

  function updateFilter(field: keyof DiscoveryFilters, value: string) {
  setFilterDraft((current) => ({
    ...current,
    [field]: value,
  }));
}

function applyDiscoveryFilters(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setAppliedFilters({ ...filterDraft });
}

function clearDiscoveryFilters() {
  setFilterDraft({ ...EMPTY_DISCOVERY_FILTERS });
  setAppliedFilters({ ...EMPTY_DISCOVERY_FILTERS });
}

function removeAppliedFilter(field: keyof DiscoveryFilters) {
  setFilterDraft((current) => ({
    ...current,
    [field]: "",
  }));

  setAppliedFilters((current) => ({
    ...current,
    [field]: "",
  }));
}

const activeFilters = (
  Object.entries(appliedFilters) as [keyof DiscoveryFilters, string][]
).filter(([, value]) => value.trim() !== "");

const comparisonProjects = compareProjects;
const favouriteProjects = allPublicProjects.filter((project) => favouriteProjectIds.includes(project.id));

function toggleFavouriteProject(project: Project) {
  setFavouriteProjectIds((current) =>
    current.includes(project.id)
      ? current.filter((id) => id !== project.id)
      : [...current, project.id],
  );
}

function isFavourite(projectId: string) {
  return favouriteProjectIds.includes(projectId);
}

function getProjectShareUrl(projectId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("project", projectId);
  url.hash = "projects";
  return url.toString();
}

async function copyProjectLink(project: Project) {
  const shareUrl = getProjectShareUrl(project.id);
  try {
    await navigator.clipboard.writeText(shareUrl);
    window.alert("Project link copied.");
  } catch {
    window.prompt("Copy this project link:", shareUrl);
  }
  setOpenProjectMenuId(null);
}

async function shareProject(project: Project) {
  const shareUrl = getProjectShareUrl(project.id);
  const shareData = {
    title: `MHD | ${project.title}`,
    text: `Explore this home design project on MHD: ${project.title}`,
    url: shareUrl,
  };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
    } catch (error) {
      // User cancellation is normal; don't show an error or copy unexpectedly.
      if (error instanceof Error && error.name !== "AbortError") {
        window.alert("Unable to open the share dialog. You can copy the project link instead.");
      }
    }
  } else {
    await copyProjectLink(project);
    return;
  }
  setOpenProjectMenuId(null);
}

function toggleCompareProject(project: Project) {
  setCompareProjects((current) => {
    if (current.some((item) => item.id === project.id)) {
      return current.filter((item) => item.id !== project.id);
    }
    if (current.length >= 3) return current;
    return [...current, project];
  });
}

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MHD_FAVOURITES_STORAGE_KEY,
        JSON.stringify(favouriteProjectIds),
      );
    } catch {
      // Keep the current session usable if browser storage is unavailable.
    }
  }, [favouriteProjectIds]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      try {
        setLoading(true);
        setError("");
        const params = new URLSearchParams();

Object.entries(appliedFilters).forEach(([key, value]) => {
  if (value.trim()) {
    params.set(key, value.trim());
  }
});

// Always send the selected sorting option.
params.set("sort_by", sortBy);

const queryString = params.toString();

const response = await fetch(
  `${API_URL}/projects/public${queryString ? `?${queryString}` : ""}`,
  {
    signal: controller.signal,
  },
);

        if (!response.ok) {
          throw new Error(`Unable to load projects (${response.status}).`);
        }

        const data: Project[] = await response.json();
        setProjects(data);
        setAllPublicProjects((current) => {
          const merged = new Map(current.map((project) => [project.id, project]));
          data.forEach((project) => merged.set(project.id, project));
          return Array.from(merged.values());
        });

        // Load each approved project's public images. Image-list failures do not
        // prevent the project cards themselves from displaying.
        const imageEntries: Array<[string, ProjectImage[]]> = await Promise.all(
          data.map(async (project): Promise<[string, ProjectImage[]]> => {
            try {
              const imageResponse = await fetch(
                `${API_URL}/projects/${project.id}/images`,
                { signal: controller.signal }
              );
              if (!imageResponse.ok) return [project.id, []];
              const images: ProjectImage[] = await imageResponse.json();
              return [project.id, images];
            } catch {
              return [project.id, []];
            }
          })
        );

        if (!controller.signal.aborted) {
          setProjectImages(Object.fromEntries(imageEntries));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load projects right now."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadProjects();
    return () => controller.abort();
  }, [appliedFilters, sortBy]);

  // A shared URL includes ?project=<id>; open that project's detail view on arrival.
  useEffect(() => {
    const sharedProjectId = new URLSearchParams(window.location.search).get("project");
    if (!sharedProjectId || projects.length === 0) return;
    const sharedProject = projects.find((project) => project.id === sharedProjectId);
    if (sharedProject) {
      setActivePublicPage("projects");
      setDetailProject(sharedProject);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [projects]);

useEffect(() => {
  const controller = new AbortController();

  async function loadPublicFloors() {
    if (projects.length === 0) {
      setProjectFloorsByProject({});
      return;
    }

    const floorEntries: Array<[string, ProjectFloor[]]> =
      await Promise.all(
        projects.map(async (project): Promise<[string, ProjectFloor[]]> => {
          try {
            const response = await fetch(
              `${API_URL}/projects/${project.id}/floors`,
              { signal: controller.signal },
            );

            if (!response.ok) {
              return [project.id, []];
            }

            const floors: ProjectFloor[] = await response.json();

            return [project.id, floors];
          } catch {
            return [project.id, []];
          }
        }),
      );

    if (!controller.signal.aborted) {
      setProjectFloorsByProject(
        Object.fromEntries(floorEntries),
      );
    }
  }

  void loadPublicFloors();

  return () => controller.abort();
}, [projects]);


async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!selectedProject || enquirySending) return;

  setEnquirySending(true);
  setEnquiryError("");
  setEnquirySuccess("");

  try {
    const response = await fetch(`${API_URL}/enquiries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: selectedProject.id,
        ...enquiryForm,
        subject: enquiryForm.subject || null,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const message =
        typeof result.detail === "string"
          ? result.detail
          : "Unable to submit your enquiry. Please check your details.";

      throw new Error(message);
    }

    setEnquirySuccess(
      result.message || "Your enquiry has been submitted successfully."
    );
    setEnquiryForm(EMPTY_ENQUIRY);
  } catch (error) {
    setEnquiryError(
      error instanceof Error
        ? error.message
        : "A network error occurred. Please try again."
    );
  } finally {
    setEnquirySending(false);
  }
}


async function submitSiteVisit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!siteVisitProject || siteVisitSending) return;

  setSiteVisitSending(true);
  setSiteVisitError("");
  setSiteVisitSuccess("");

  try {
    const response = await fetch(`${API_URL}/site-visits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: siteVisitProject.id,
        customer_name: siteVisitForm.customer_name.trim(),
        customer_email: siteVisitForm.customer_email.trim(),
        customer_phone: siteVisitForm.customer_phone.trim(),
        requested_at: new Date(
          siteVisitForm.requested_at
        ).toISOString(),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof result.detail === "string"
          ? result.detail
          : "Unable to submit the site-visit request."
      );
    }

    setSiteVisitSuccess(
      "Your site-visit request has been submitted to MHD. The team will coordinate the appointment."
    );
    setSiteVisitForm(EMPTY_SITE_VISIT);
  } catch (error) {
    setSiteVisitError(
      error instanceof Error
        ? error.message
        : "A network error occurred. Please try again."
    );
  } finally {
    setSiteVisitSending(false);
  }
}


  // Homepage previews a maximum of ten projects; the dedicated Projects view shows the full API result.
  const visibleProjects = activePublicPage === "projects" ? projects : projects.slice(0, 10);

  return (
    <div className="mhd-public-site min-h-screen bg-[#f4f6f5] text-slate-900" data-active-page={activePublicPage}>
      {/* Navigation */}
      <header className="mhd-site-header sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <a href="#home" onClick={(event) => navigateToSection(event, "home")} className="text-2xl font-black tracking-tight">
            MHD<span className="mhd-brand-mark">.</span>
          </a>



<div className="hidden items-center gap-6 text-sm font-medium md:flex">
  <a href="#home" onClick={(event) => navigateToSection(event, "home")} className="hover:text-orange-700">
    Home
  </a>
  <button type="button" onClick={() => { setActivePublicPage("projects"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="hover:text-orange-700">
    Projects
  </button>
  <button type="button" onClick={() => { setActivePublicPage("shortlist"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="hover:text-orange-700">
    My Shortlist ({favouriteProjectIds.length})
  </button>
  <button type="button" onClick={() => { setActivePublicPage("gallery"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="hover:text-orange-700">
    Design Gallery
  </button>
  <a href="#services" onClick={(event) => navigateToSection(event, "services")} className="hover:text-orange-700">
    Services
  </a>
  <a href="#about" onClick={(event) => navigateToSection(event, "about")} className="hover:text-orange-700">
    About Us
  </a>
  <a href="#contact" onClick={(event) => navigateToSection(event, "contact")} className="hover:text-orange-700">
    Contact
  </a>
  <a
    href="/architect"
    className="border-l border-slate-300 pl-6 font-semibold hover:text-orange-700"
  >
    Architect Portal
  </a>
</div>



          <a
            href="#contact"
            onClick={(event) => navigateToSection(event, "contact")}
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-800"
          >
            Get in Touch
          </a>
        </nav>
      </header>

      <main>
        {/* Luxury full-screen architectural hero */}
        <section
          id="home"
          className="mhd-hero relative flex min-h-[calc(100svh-78px)] items-center overflow-hidden text-white"
          aria-label="MHD architecture and construction"
        >
          <div className="mhd-hero-image" aria-hidden="true" />
          <div className="mhd-hero-shade" aria-hidden="true" />

          <div className="mhd-hero-content relative z-10 mx-auto flex w-full max-w-7xl items-center px-5 py-28 md:px-8">
            <div className="max-w-3xl">
              <p className="mb-7 text-xs font-bold uppercase tracking-[0.35em] text-orange-300">
                Architecture · Design · Construction
              </p>

              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
                Your plot.
                <span className="mt-2 block text-orange-300">
                  Your vision. Your home.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-slate-200 md:text-lg">
                Planning to build your home? Explore design ideas, discover
                approved projects and connect with the MHD team to take your
                next step with greater clarity.
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <a
                  href="#projects"
                  className="rounded-full bg-orange-600 px-7 py-4 font-semibold text-white transition hover:bg-orange-700"
                >
                  Explore Projects <span aria-hidden="true">↗</span>
                </a>
                <a
                  href="#contact"
                  className="rounded-full border border-white/60 px-7 py-4 font-semibold text-white transition hover:border-white hover:bg-white/10"
                >
                  Discuss Your Project
                </a>
              </div>

              <div className="mt-14 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-200">
                <span>✓ Explore home design ideas</span>
                <span>✓ Discover approved projects</span>
                <span>✓ Enquire through MHD</span>
              </div>
            </div>
          </div>

          <a href="#projects" className="mhd-hero-scroll" aria-label="Scroll to projects">
            <span>Scroll to explore</span>
            <span aria-hidden="true">↓</span>
          </a>
        </section>

        {/* Intro strip */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-9 text-center sm:grid-cols-3 md:px-8">
            <div>
              <p className="font-semibold">Imagine your home</p>
              <p className="mt-1 text-sm text-slate-500">
                Explore real projects and design possibilities
              </p>
            </div>
            <div>
              <p className="font-semibold">Share your requirements</p>
              <p className="mt-1 text-sm text-slate-500">
                Tell us about your plot, plans and preferences
              </p>
            </div>
            <div>
              <p className="font-semibold">Take the next step</p>
              <p className="mt-1 text-sm text-slate-500">
                Connect with the MHD team about your home project
              </p>
            </div>
          </div>
        </section>

        {/* Projects */}
        <section id="projects" className="mhd-projects-section mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          {activePublicPage === "projects" && (
            <div className="mb-6 flex items-center justify-between gap-4">
              <button type="button" onClick={() => { setActivePublicPage("home"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-orange-700 hover:text-orange-800">← Back to Home</button>
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">MHD · All Projects</span>
            </div>
          )}
          <div className="mhd-discovery-intro flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-700">
                Your home journey starts here
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                {activePublicPage === "projects" ? "Explore All Approved Projects" : "Explore Projects. Find the Right Architect."}
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">
                Explore approved projects, compare designs, save your favourites and find an architect who understands your vision. Share your plot details, preferences and budget with MHD to take the next step towards your dream home.
              </p>
            </div>

            <aside className="mhd-discovery-proof" aria-label="Customer home planning highlights">
              <div className="mhd-proof-orbit" aria-hidden="true">
                <span className="mhd-proof-orbit-ring mhd-proof-orbit-ring-one" />
                <span className="mhd-proof-orbit-ring mhd-proof-orbit-ring-two" />
                <span className="mhd-proof-orbit-core">MHD</span>
              </div>
              <div className="mhd-proof-stats">
                <div className="mhd-proof-stat">
                  <strong>{projects.length}</strong>
                  <span>Published {projects.length === 1 ? "project" : "projects"}</span>
                </div>
                <div className="mhd-proof-stat mhd-proof-stat-network">
                  <strong>Find an Architect</strong>
                  <span>Connect with a suitable architect through MHD for your home project.</span>
                </div>
              </div>
              <p className="mhd-proof-tagline">Explore designs. Compare projects. Find the right expertise for your home.</p>
            </aside>
          </div>

          <form
            onSubmit={applyDiscoveryFilters}
            className="mhd-discovery-form mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_55px_-38px_rgba(15,23,42,0.45)]"
          >
            <div className="h-1.5 bg-gradient-to-r from-slate-900 via-orange-600 to-orange-300" />
            <div className="p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-700">Your home, thoughtfully matched</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                    Tell us what you are looking for
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                    Use the filters below to find approved projects that fit your plot, preferences and budget.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800">
                  {activeFilters.length} filters applied
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_minmax(145px,1fr)_minmax(160px,1fr)_minmax(115px,0.7fr)]">
                <label className="block text-xs font-semibold text-slate-700">
                  Search projects
                  <input
                    type="text"
                    value={filterDraft.search}
                    onChange={(e) => updateFilter("search", e.target.value)}
                    placeholder="Name, city or architectural style"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  City
                  <input
                    value={filterDraft.city}
                    onChange={(e) => updateFilter("city", e.target.value)}
                    placeholder="e.g. Pune"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Property type
                  <select
                    value={filterDraft.property_type}
                    onChange={(e) => updateFilter("property_type", e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
                  >
                    <option value="">All property types</option>
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Mixed-use">Mixed-use</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  BHK
                  <select
                    value={filterDraft.bhk}
                    onChange={(e) => updateFilter("bhk", e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
                  >
                    <option value="">Any BHK</option>
                    {[1, 2, 3, 4, 5, 6].map((value) => (
                      <option key={value} value={value}>{value} BHK</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                  aria-expanded={showAdvancedFilters}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800"
                >
                  <span className="text-base leading-none">{showAdvancedFilters ? "−" : "+"}</span>
                  {showAdvancedFilters ? "Hide detailed filters" : "More filters & specifications"}
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearDiscoveryFilters}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-500/20"
                  >
                    Find matching projects <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>

              {showAdvancedFilters && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-900">Refine your requirements</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Optional plot dimensions, layout, room and construction budget filters.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-700">
                      State
                      <input value={filterDraft.state} onChange={(e) => updateFilter("state", e.target.value)} placeholder="e.g. Maharashtra" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minimum plot area (sq. ft.)
                      <input type="number" min="1" value={filterDraft.min_plot_area_sqft} onChange={(e) => updateFilter("min_plot_area_sqft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Maximum plot area (sq. ft.)
                      <input type="number" min="1" value={filterDraft.max_plot_area_sqft} onChange={(e) => updateFilter("max_plot_area_sqft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Number of floors
                      <select value={filterDraft.floor_count} onChange={(e) => updateFilter("floor_count", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">Any number</option>
                        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} {value === 1 ? "Floor" : "Floors"}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Facing direction
                      <select value={filterDraft.facing} onChange={(e) => updateFilter("facing", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">Any direction</option>
                        {["North", "South", "East", "West"].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Architectural style
                      <select value={filterDraft.architectural_style} onChange={(e) => updateFilter("architectural_style", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">All styles</option>
                        <option value="Modern">Modern</option>
                        <option value="Contemporary">Contemporary</option>
                        <option value="Traditional">Traditional</option>
                        <option value="Minimalist">Minimalist</option>
                        <option value="Classic">Classic</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minimum construction budget (₹)
                      <input type="number" min="0" value={filterDraft.min_budget_inr} onChange={(e) => updateFilter("min_budget_inr", e.target.value)} placeholder="e.g. 2000000" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Maximum construction budget (₹)
                      <input type="number" min="0" value={filterDraft.max_budget_inr} onChange={(e) => updateFilter("max_budget_inr", e.target.value)} placeholder="e.g. 5000000" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minimum plot width (ft.)
                      <input type="number" min="0.1" step="0.1" value={filterDraft.min_plot_width_ft} onChange={(e) => updateFilter("min_plot_width_ft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Maximum plot width (ft.)
                      <input type="number" min="0.1" step="0.1" value={filterDraft.max_plot_width_ft} onChange={(e) => updateFilter("max_plot_width_ft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minimum plot length (ft.)
                      <input type="number" min="0.1" step="0.1" value={filterDraft.min_plot_length_ft} onChange={(e) => updateFilter("min_plot_length_ft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Maximum plot length (ft.)
                      <input type="number" min="0.1" step="0.1" value={filterDraft.max_plot_length_ft} onChange={(e) => updateFilter("max_plot_length_ft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minimum built-up area (sq. ft.)
                      <input type="number" min="1" value={filterDraft.min_area_sqft} onChange={(e) => updateFilter("min_area_sqft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Maximum built-up area (sq. ft.)
                      <input type="number" min="1" value={filterDraft.max_area_sqft} onChange={(e) => updateFilter("max_area_sqft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minimum carpet area (sq. ft.)
                      <input type="number" min="1" value={filterDraft.min_carpet_area_sqft} onChange={(e) => updateFilter("min_carpet_area_sqft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Maximum carpet area (sq. ft.)
                      <input type="number" min="1" value={filterDraft.max_carpet_area_sqft} onChange={(e) => updateFilter("max_carpet_area_sqft", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Bedrooms
                      <select value={filterDraft.bedroom_count} onChange={(e) => updateFilter("bedroom_count", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">Any number</option>
                        {Array.from({ length: 11 }, (_, i) => i).map((value) => <option key={value} value={value}>{value} {value === 1 ? "Bedroom" : "Bedrooms"}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Bathrooms
                      <select value={filterDraft.bathroom_count} onChange={(e) => updateFilter("bathroom_count", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">Any number</option>
                        {Array.from({ length: 11 }, (_, i) => i).map((value) => <option key={value} value={value}>{value} {value === 1 ? "Bathroom" : "Bathrooms"}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Parking spaces
                      <select value={filterDraft.parking_spaces} onChange={(e) => updateFilter("parking_spaces", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">Any number</option>
                        {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} {value === 1 ? "Space" : "Spaces"}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Entrance direction
                      <select value={filterDraft.entrance_facing} onChange={(e) => updateFilter("entrance_facing", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10">
                        <option value="">Any direction</option>
                        {["North", "South", "East", "West"].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700">
                      Apply detailed filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>

{activeFilters.length > 0 && (
  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-slate-800">
        Active Filters ({activeFilters.length})
      </h4>

      <button
        type="button"
        onClick={clearDiscoveryFilters}
        className="text-sm font-semibold text-orange-800 hover:text-orange-950"
      >
        Clear All
      </button>
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      {activeFilters.map(([key, value]) => {
        const displayValue =
          key === "bhk"
            ? `${value} BHK`
            : key === "floor_count"
              ? `${value} floors`
              : key === "min_budget_inr" || key === "max_budget_inr"
                ? formatINR(value)
                : value;

        return (
          <button
            key={key}
            type="button"
            onClick={() => removeAppliedFilter(key)}
            aria-label={`Remove ${DISCOVERY_FILTER_LABELS[key]} filter`}
            className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-900 hover:bg-orange-100"
          >
            <span>
              {DISCOVERY_FILTER_LABELS[key]}: {displayValue}
            </span>
            <span aria-hidden="true" className="text-base">×</span>
          </button>
        );
      })}
    </div>
  </div>
)}

<div className="mt-8 flex flex-wrap items-center justify-between gap-4">
  <div>
    <h3 className="text-lg font-semibold">
      Available House Designs
    </h3>
    <p className="mt-1 text-sm text-slate-500">
      {activePublicPage === "home" && projects.length > 10
        ? `Showing 10 of ${projects.length} published designs`
        : `${projects.length} published design(s) found`}
    </p>
  </div>

  <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
    Sort by

    <select
      value={sortBy}
      onChange={(e) => setSortBy(e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-orange-700"
    >
      <option value="newest">Newest Designs</option>
      <option value="budget_low">Lowest Construction Budget</option>
      <option value="budget_high">Highest Construction Budget</option>
      <option value="plot_small">Smallest Plot Area</option>
      <option value="plot_large">Largest Plot Area</option>
    </select>
  </label>
</div>

          {loading && (
            <p className="mt-12 text-slate-500">Loading approved projects...</p>
          )}

          {!loading && error && (
            <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
              <p className="font-semibold">Projects could not be loaded.</p>
              <p className="mt-2 text-sm">{error}</p>
              <p className="mt-2 text-sm">
                Confirm that the API is running and its public projects
                endpoint is available.
              </p>
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
  <div className="mt-12 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">

    <div className="text-5xl text-orange-700" aria-hidden="true">
      ⌂
    </div>

    {activeFilters.length > 0 ? (
      <>
        <h3 className="mt-5 text-xl font-semibold">
          No designs match your requirements.
        </h3>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Try changing your plot area, construction budget or design
          preferences to discover more projects.
        </p>

        <button
          type="button"
          onClick={clearDiscoveryFilters}
          className="mt-6 rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-orange-800"
        >
          Clear All Filters
        </button>
      </>
    ) : (
      <>
        <h3 className="mt-5 text-xl font-semibold">
          Something great is taking shape.
        </h3>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          We are preparing more projects to inspire your home journey.
          Please check back soon, or contact MHD to discuss what you have in mind.
        </p>
      </>
    )}
  </div>
)}

          {!loading && !error && projects.length > 0 && (
            <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.map((project) => {
                const primaryImage = projectImages[project.id]?.[0];

                return (
                  <article
                    key={project.id}
                    className="mhd-project-card group overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
                  >
                    <div className="mhd-project-card-media relative flex aspect-[4/3] items-end overflow-hidden bg-gradient-to-br from-slate-300 via-slate-200 to-orange-100 p-6">
                      {primaryImage ? (
                        <img
                          src={resolveImageUrl(primaryImage.image_url)}
                          alt={primaryImage.alt_text || project.title}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                          onError={(event) => {
                            // Avoid a broken-image icon if a local file was moved.
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-7xl text-slate-500/50 transition group-hover:scale-105">
                          ⌂
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenProjectMenuId((current) => current === project.id ? null : project.id)}
                        aria-label={`More options for ${project.title}`}
                        aria-haspopup="menu"
                        aria-expanded={openProjectMenuId === project.id}
                        className="mhd-project-menu-trigger absolute right-[4.25rem] top-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/75 bg-white/95 text-2xl leading-none text-slate-700 shadow-lg backdrop-blur transition hover:bg-white"
                      >
                        <span aria-hidden="true">⋮</span>
                      </button>
                      {openProjectMenuId === project.id && (
                        <div className="mhd-project-share-menu absolute right-4 top-[4.25rem] z-30 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl" role="menu" aria-label={`Project options for ${project.title}`}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void shareProject(project)}
                            className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Share project
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void copyProjectLink(project)}
                            className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Copy project link
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleFavouriteProject(project)}
                        aria-label={isFavourite(project.id) ? `Remove ${project.title} from shortlist` : `Save ${project.title} to shortlist`}
                        aria-pressed={isFavourite(project.id)}
                        className={`mhd-favourite-button absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full shadow-lg backdrop-blur transition ${isFavourite(project.id) ? "is-saved" : ""}`}
                      >
                        <span aria-hidden="true">{isFavourite(project.id) ? "♥" : "♡"}</span>
                      </button>
                      <div className="mhd-project-image-caption absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-5">
                        <span className="rounded-full border border-white/40 bg-white/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-900 shadow-sm backdrop-blur">
                          {project.property_type}
                        </span>
                        <span className="text-xs font-medium text-white/90">
                          Explore project <span aria-hidden="true">↗</span>
                        </span>
                      </div>
                    </div>

                  <div className="p-6">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      MHD reviewed project
                    </div>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                      {project.title}
                    </h3>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                      <span aria-hidden="true">⌖</span>
                      {project.city}, {project.state}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">

  {project.plot_area_sqft && (
    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
      Plot: {project.plot_area_sqft.toLocaleString()} sq. ft.
    </span>
  )}

  {project.bhk && (
    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
      {project.bhk} BHK
    </span>
  )}

  {project.floor_count && (
    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
      {project.floor_count} Floors
    </span>
  )}

  {project.facing && (
    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
      {project.facing} Facing
    </span>
  )}

  {project.architectural_style && (
    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
      {project.architectural_style}
    </span>
  )}

</div>

{project.area_sqft && (
  <p className="mt-3 text-sm text-slate-600">
    <strong>Built-up area:</strong> {project.area_sqft.toLocaleString()} sq. ft.
  </p>
)}


                    {project.description && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                        {project.description}
                      </p>
                    )}


<button
  type="button"
  onClick={() => toggleCompareProject(project)}
  disabled={!compareProjects.some((item) => item.id === project.id) && compareProjects.length >= 3}
  aria-pressed={compareProjects.some((item) => item.id === project.id)}
  className="mt-6 mr-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
>
  {compareProjects.some((item) => item.id === project.id) ? "Remove compare" : "＋ Compare"}
</button>

<button
  type="button"
  onClick={() => {
    setSelectedProject(project);
    setEnquiryForm(EMPTY_ENQUIRY);
    setEnquiryError("");
    setEnquirySuccess("");
  }}
  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-orange-800 hover:text-orange-950"
>
  Enquire through MHD <span aria-hidden="true">→</span>
</button>


<button
  type="button"
  onClick={() => setDetailProject(project)}
  className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-orange-700 hover:text-orange-800"
>
  Explore this project <span aria-hidden="true">↗</span>
</button>


                  </div>
                  </article>
                );
              })}
            </div>
          )}

          {activePublicPage === "home" && projects.length > 10 && (
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={() => { setActivePublicPage("projects"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="inline-flex items-center gap-3 rounded-full bg-[#173b3a] px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-800">
                View all {projects.length} projects <span aria-hidden="true">→</span>
              </button>
            </div>
          )}

          {compareProjects.length > 0 && (
            <div className="mhd-compare-tray" role="region" aria-label="Selected projects for comparison">
              <div>
                <strong>{compareProjects.length} of 3 projects selected</strong>
                <p className="text-xs text-slate-500">Compare layouts, areas and estimated budgets side by side.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setCompareProjects([])} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Clear</button>
                <button type="button" onClick={() => setShowComparison(true)} disabled={compareProjects.length < 2} className="rounded-full bg-[#244e4d] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Compare selected ({compareProjects.length})</button>
              </div>
            </div>
          )}
        </section>

        <section id="my-shortlist" className="mhd-shortlist-section scroll-mt-28 px-5 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <button type="button" onClick={() => { setActivePublicPage("home"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-orange-700 hover:text-orange-800">← Back to Home</button>
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">MHD · My Shortlist</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-700">Your saved designs</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">My Shortlist</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Keep the home designs you like in one place. Your shortlist is saved in this browser, so it remains available after refreshing or reopening MHD on this device.</p>
              </div>
              <span className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-800">{favouriteProjectIds.length} saved</span>
            </div>

            {favouriteProjectIds.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center">
                <div className="text-4xl text-rose-300" aria-hidden="true">♡</div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">Your shortlist is empty</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Select the heart on any project image to save a design here and revisit it later.</p>
                <a href="#projects" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-800">Explore projects</a>
              </div>
            ) : favouriteProjects.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Your saved project IDs are still stored in this browser, but those projects are not present in the catalogue currently loaded. Clear project filters or reload the public catalogue. Projects that are no longer approved are not displayed.</div>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {favouriteProjects.map((project) => {
                  const image = projectImages[project.id]?.[0];
                  return (
                    <article key={`favourite-${project.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                        {image ? <img src={resolveImageUrl(image.image_url)} alt={image.alt_text || project.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-6xl text-slate-300" aria-hidden="true">⌂</div>}
                        <button type="button" onClick={() => toggleFavouriteProject(project)} aria-label={`Remove ${project.title} from shortlist`} className="mhd-favourite-button is-saved absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full shadow-lg"><span aria-hidden="true">♥</span></button>
                      </div>
                      <div className="p-5">
                        <h3 className="text-lg font-semibold text-slate-900">{project.title}</h3>
                        <p className="mt-1 text-sm text-slate-500">{project.city}, {project.state}</p>
                        <p className="mt-3 text-xs leading-5 text-slate-600">{project.plot_area_sqft ? `${project.plot_area_sqft.toLocaleString()} sq. ft. plot` : "Plot area not provided"} · {project.bhk ? `${project.bhk} BHK` : "BHK not specified"} · {project.floor_count ? `${project.floor_count} floors` : "Floors not specified"}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => setDetailProject(project)} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800">View project</button>
                          <button type="button" onClick={() => toggleCompareProject(project)} disabled={!compareProjects.some((item) => item.id === project.id) && compareProjects.length >= 3} className="rounded-full bg-[#244e4d] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{compareProjects.some((item) => item.id === project.id) ? "Remove compare" : "Add to compare"}</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Design inspiration gallery */}
        <section id="design-gallery" className="mhd-design-gallery px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <button type="button" onClick={() => { setActivePublicPage("home"); window.scrollTo({ top: 0, behavior: "auto" }); }} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-orange-700 hover:text-orange-800">← Back to Home</button>
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">MHD · Design Gallery</span>
            </div>
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-800">
                  Ideas for the home you want to build
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                  Explore styles. Imagine possibilities.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
                  From the first impression of your home’s exterior to the
                  rooms you live in every day, gather ideas that help define
                  your own design direction.
                </p>
              </div>
              <a href="#contact" className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-orange-700 hover:text-orange-800">
                Discuss your design ideas <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="mhd-gallery-grid mt-10">
              <article className="mhd-gallery-card mhd-gallery-card-large">
                <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=85" alt="Contemporary home exterior with landscaped approach" loading="lazy" />
                <div className="mhd-gallery-caption">
                  <span>01 / First impressions</span>
                  <h3>Home Elevations</h3>
                  <p>Explore the look and character of your home from the outside.</p>
                </div>
              </article>
              <article className="mhd-gallery-card">
                <img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=85" alt="Warm contemporary living room interior" loading="lazy" />
                <div className="mhd-gallery-caption">
                  <span>02 / Everyday living</span>
                  <h3>Living Spaces</h3>
                  <p>Ideas for welcoming, comfortable shared spaces.</p>
                </div>
              </article>
              <article className="mhd-gallery-card">
                <img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85" alt="Contemporary bedroom interior design" loading="lazy" />
                <div className="mhd-gallery-caption">
                  <span>03 / Personal comfort</span>
                  <h3>Bedrooms</h3>
                  <p>Find a balance of comfort, calm and practical details.</p>
                </div>
              </article>
              <article className="mhd-gallery-card">
                <img src="https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=85" alt="Modern kitchen with carefully selected finishes" loading="lazy" />
                <div className="mhd-gallery-caption">
                  <span>04 / The heart of home</span>
                  <h3>Kitchens</h3>
                  <p>Discover layouts, finishes and functional details.</p>
                </div>
              </article>
              <article className="mhd-gallery-card">
                <img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1000&q=85" alt="Modern home interior with natural light and materials" loading="lazy" />
                <div className="mhd-gallery-caption">
                  <span>05 / Material and mood</span>
                  <h3>Interior Details</h3>
                  <p>Explore textures, lighting and finishing inspiration.</p>
                </div>
              </article>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Inspiration images are illustrative references, not representations
              of MHD-completed projects.
            </p>
          </div>
        </section>

        {/* Our services */}
        <section id="services" className="mhd-services-section px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-800">
                Support for your home-building journey
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                From the first sketch to the finishing details.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Every home project has its own needs. Explore the areas where
                you may need guidance, then tell us what you are planning.
              </p>
            </div>

            <div className="mhd-services-grid mt-11">
              <article className="mhd-service-card">
                <span className="mhd-service-number">01</span>
                <div className="mhd-service-symbol" aria-hidden="true">⌂</div>
                <h3>Architectural Planning</h3>
                <p>Explore space planning, room arrangements and floor-plan ideas shaped around your plot and everyday needs.</p>
                <a href="#contact">Discuss your plan <span aria-hidden="true">↗</span></a>
              </article>
              <article className="mhd-service-card">
                <span className="mhd-service-number">02</span>
                <div className="mhd-service-symbol" aria-hidden="true">▧</div>
                <h3>3D Elevation & Exterior Design</h3>
                <p>Consider architectural styles, façade treatments and exterior details before deciding how your home should look.</p>
                <a href="#contact">Explore design options <span aria-hidden="true">↗</span></a>
              </article>
              <article className="mhd-service-card">
                <span className="mhd-service-number">03</span>
                <div className="mhd-service-symbol" aria-hidden="true">▥</div>
                <h3>Residential Construction</h3>
                <p>Discuss your construction requirements, project scope and the practical steps involved in bringing your plans to life.</p>
                <a href="#contact">Discuss construction <span aria-hidden="true">↗</span></a>
              </article>
              <article className="mhd-service-card">
                <span className="mhd-service-number">04</span>
                <div className="mhd-service-symbol" aria-hidden="true">▦</div>
                <h3>Interior Design</h3>
                <p>Gather ideas for kitchens, bedrooms, living spaces, materials, lighting and the details that make a home yours.</p>
                <a href="#design-gallery">Explore inspiration <span aria-hidden="true">↗</span></a>
              </article>
              <article className="mhd-service-card mhd-service-card-featured">
                <span className="mhd-service-number">05</span>
                <div className="mhd-service-symbol" aria-hidden="true">✳</div>
                <h3>Home Design Consultation</h3>
                <p>Start with your plot size, location, preferred style and requirements. Share your brief with MHD to discuss a suitable next step.</p>
                <a href="#contact">Start a conversation <span aria-hidden="true">↗</span></a>
              </article>
            </div>

            <p className="mt-6 text-xs leading-5 text-slate-500">
              Service scope, availability, specifications and estimates are subject to project requirements and confirmation by MHD.
            </p>
          </div>
        </section>

        {/* About */}
        <section id="about" className="mhd-about-section bg-slate-200/70 px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 md:grid-cols-2 md:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-800">
                  A clearer way to begin
                </p>
                <h2 className="mt-4 text-4xl font-semibold leading-tight">
                  Your home journey
                  <br />
                  starts with a plan.
                </h2>
                <blockquote className="mt-6 max-w-lg border-l-2 border-orange-600 pl-5 text-lg italic leading-8 text-slate-700">
                  “A home that feels right begins with a plan that understands you.”
                </blockquote>
                <p className="mt-2 pl-5 text-xs font-semibold uppercase tracking-[0.18em] text-orange-800">
                  The MHD approach
                </p>
              </div>

              <div className="mhd-about-copy">
                <p className="text-base leading-8 text-slate-600">
                  Building a home starts with understanding your plot, your
                  priorities and the way you want to live. MHD brings published,
                  approved projects and design inspiration into one place so
                  you can explore possibilities before deciding your next step.
                </p>
                <p className="mt-4 text-base leading-8 text-slate-600">
                  Whether you are at the idea stage or already have a plan,
                  begin by comparing designs, noting what matters to you and
                  sharing a project-specific enquiry with the MHD team.
                </p>
              </div>
            </div>

            <div className="mhd-about-principles mt-14 grid gap-5 md:grid-cols-3">
              <article>
                <span>01</span>
                <h3>Start with your plot</h3>
                <p>Consider the plot dimensions, location, orientation and practical requirements.</p>
              </article>
              <article>
                <span>02</span>
                <h3>Explore with clarity</h3>
                <p>Compare published projects, layouts and design details to understand what may suit you.</p>
              </article>
              <article>
                <span>03</span>
                <h3>Take an informed next step</h3>
                <p>Choose a project and send an enquiry through MHD when you are ready to discuss it.</p>
              </article>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section id="contact" className="mhd-contact-section bg-[#174b53] px-5 py-16 text-white md:px-8 md:py-20">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-200">
                Your next step starts here
              </p>
              <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
                Have a home in mind?
              </h2>
              <p className="mt-3 max-w-2xl text-orange-100">
                Explore the published projects and open one that interests you.
                From its details, you can submit an enquiry or request a site
                visit where that option is available. Your enquiry is routed
                through MHD.
              </p>
            </div>

            <a
              href="#projects"
              className="inline-flex w-fit shrink-0 rounded-full bg-white px-7 py-4 font-semibold text-slate-900 transition hover:bg-orange-100"
            >
              Explore Projects &amp; Enquire ↗
            </a>
          </div>
        </section>
      </main>

      <footer className="mhd-site-footer bg-slate-950 px-5 py-12 text-slate-300 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[1.15fr_0.9fr_1.25fr]">
            <div>
              <a
                href="#home"
                onClick={(event) => navigateToSection(event, "home")}
                className="inline-block text-3xl font-black tracking-tight text-white"
                aria-label="MHD home"
              >
                MHD<span className="mhd-brand-mark">.</span>
              </a>
              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-400">
                Explore architectural ideas, discover thoughtfully designed projects
                and take the next step towards creating a home that reflects your vision.
              </p>
              <a
                href="/architect"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:text-orange-300"
              >
                Architect Portal <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
                Contact MHD
              </h2>
              <ul className="mt-5 space-y-4 text-sm">
                <li>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Email</span>
                  <a
                    href="mailto:maharashtrahomedesigns@gmail.com"
                    className="break-all transition hover:text-orange-300"
                  >
                    maharashtrahomedesigns@gmail.com
                  </a>
                </li>
                <li>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Phone</span>
                  <a href="tel:+918308724924" className="transition hover:text-orange-300">
                    +91 83087 24924
                  </a>
                </li>
                <li>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">WhatsApp</span>
                  <a
                    href="https://wa.me/918308724924"
                    target="_blank"
                    rel="noreferrer"
                    className="transition hover:text-orange-300"
                  >
                    Chat with MHD
                  </a>
                </li>
                <li>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Location</span>
                  <a
                    href="https://maps.app.goo.gl/89qdYfMDewfZnpzr9"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 transition hover:text-orange-300"
                  >
                    View on Google Maps <span aria-hidden="true">↗</span>
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="mb-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
                  Find Us
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Find MHD on Google Maps.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                <iframe
                  title="MHD location on Google Maps"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3866985.501771207!2d69.74853958749998!3d18.826964500000006!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bc32d5d84846405%3A0xae84cbf3bb7e7887!2sMaharashtra%20Home%20Designs!5e0!3m2!1sen!2sin!4v1795578515854!5m2!1sen!2sin"
                  className="h-56 w-full border-0"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-6 text-xs text-slate-400 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p>
                An Initiative by B &amp; J Infrastructure · © {new Date().getFullYear()} MHD. All rights reserved.
              </p>
              <p>
                Designed and developed by{" "}
                <a
                  href="https://www.linkedin.com/in/varad-gorhe/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-white underline decoration-orange-500 underline-offset-4 transition hover:text-orange-300"
                >
                  Varad
                </a>
              </p>
            </div>
            <a
              href="https://maps.app.goo.gl/89qdYfMDewfZnpzr9"
              target="_blank"
              rel="noreferrer"
              className="w-fit transition hover:text-orange-300"
            >
              Open MHD location ↗
            </a>
          </div>
        </div>
      </footer>



{showComparison && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="mhd-comparison-title">
    <section className="my-auto max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-800">MHD project comparison</p>
          <h2 id="mhd-comparison-title" className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Compare your shortlisted designs</h2>
        </div>
        <button type="button" onClick={() => setShowComparison(false)} aria-label="Close comparison" className="rounded-full px-3 py-2 text-2xl text-slate-500 hover:bg-slate-100">×</button>
      </div>
      <div className="max-h-[calc(92vh-80px)] overflow-auto p-4 sm:p-7">
        {comparisonProjects.length < 2 ? (
          <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">Select at least two projects to compare.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mhd-comparison-table w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="w-44 bg-slate-50 p-3">Project details</th>
                  {comparisonProjects.map((project) => (
                    <th key={project.id} className="min-w-[210px] p-3 align-top">
                      {projectImages[project.id]?.[0] && <img src={resolveImageUrl(projectImages[project.id][0].image_url)} alt={projectImages[project.id][0].alt_text || project.title} className="mb-3 h-32 w-full rounded-xl object-cover" />}
                      <span className="block font-semibold text-slate-900">{project.title}</span>
                      <span className="mt-1 block text-xs font-normal text-slate-500">{project.city}, {project.state}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ["Property type", (p: Project) => p.property_type || "—"],
                  ["Plot area", (p: Project) => p.plot_area_sqft ? `${p.plot_area_sqft.toLocaleString()} sq. ft.` : "Not provided"],
                  ["Built-up area", (p: Project) => p.area_sqft ? `${p.area_sqft.toLocaleString()} sq. ft.` : "Not provided"],
                  ["Carpet area", (p: Project) => p.carpet_area_sqft ? `${p.carpet_area_sqft.toLocaleString()} sq. ft.` : "Not provided"],
                  ["Configuration", (p: Project) => p.bhk ? `${p.bhk} BHK` : "Not provided"],
                  ["Bedrooms", (p: Project) => p.bedroom_count ?? "Not provided"],
                  ["Bathrooms", (p: Project) => p.bathroom_count ?? "Not provided"],
                  ["Floors", (p: Project) => p.floor_count ?? "Not provided"],
                  ["Facing", (p: Project) => p.facing || "Not provided"],
                  ["Architectural style", (p: Project) => p.architectural_style || "Not provided"],
                  ["Parking", (p: Project) => p.parking_spaces ?? "Not provided"],
                  ["Estimated budget", (p: Project) => p.estimated_cost_min != null || p.estimated_cost_max != null ? `${p.estimated_cost_min != null ? formatINR(p.estimated_cost_min) : "—"} – ${p.estimated_cost_max != null ? formatINR(p.estimated_cost_max) : "—"}` : "Not provided"],
                  ["Estimated cost / built-up sq. ft.", (p: Project) => p.area_sqft && (p.estimated_cost_min != null || p.estimated_cost_max != null) ? `${p.estimated_cost_min != null ? formatINR(Number(p.estimated_cost_min) / p.area_sqft) : "—"} – ${p.estimated_cost_max != null ? formatINR(Number(p.estimated_cost_max) / p.area_sqft) : "—"} / sq. ft.` : "Cannot calculate from available data"],
                  ["Amenities", (p: Project) => p.amenities?.length ? p.amenities.join(", ") : "Not provided"],
                  ["Description", (p: Project) => p.description || "Not provided"],
                  ["Floor plans / gallery", (p: Project) => `${(projectFloorsByProject[p.id] ?? []).length} floor(s) · ${(projectImages[p.id] ?? []).length} approved image(s)`],
                  ["View plans and images", (p: Project) => <button type="button" onClick={() => { setDetailProject(p); setShowComparison(false); }} className="rounded-full border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50">Open project gallery</button>],
                ] as Array<[string, (project: Project) => ReactNode]>).map(([label, value]) => (
                  <tr key={label}>
                    <th className="bg-slate-50 p-3 font-semibold text-slate-700">{label}</th>
                    {comparisonProjects.map((project) => <td key={project.id} className="p-3 align-top text-slate-700">{value(project)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">Budget figures are indicative estimates supplied for each project. Confirm construction scope, material specifications, inclusions and exclusions with MHD before comparing final costs. Cost per sq. ft. is not calculated where the estimate basis is incomplete.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {comparisonProjects.map((project) => (
            <button key={project.id} type="button" onClick={() => { setSelectedProject(project); setEnquiryForm(EMPTY_ENQUIRY); setEnquiryError(""); setEnquirySuccess(""); setShowComparison(false); }} className="rounded-full bg-[#244e4d] px-4 py-2.5 text-sm font-semibold text-white">Enquire about {project.title}</button>
          ))}
        </div>
      </div>
    </section>
  </div>
)}

{detailProject && (
  <div
    className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-detail-title"
  >
    <section className="my-auto flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-[#fbfaf7] shadow-[0_30px_100px_rgba(15,23,42,0.4)]">
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-800">MHD · Project showcase</p>
          <p className="mt-1 text-xs text-slate-500">Explore the details, spaces and design</p>
        </div>
        <button
          type="button"
          onClick={() => setDetailProject(null)}
          aria-label="Close project details"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 py-6 sm:px-9 sm:py-9">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#173638] via-[#21494a] to-[#2d5a55] p-6 text-white shadow-lg sm:p-9">
            <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-2 -top-8 h-48 w-48 rounded-full border border-white/10" />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Company approved
              </p>
              <h2 id="project-detail-title" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                {detailProject.title}
              </h2>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/80 sm:text-base">
                <span aria-hidden="true">⌖</span>
                {detailProject.property_type} <span className="text-white/40">·</span>
                {detailProject.city}, {detailProject.state}
              </p>
              {detailProject.area_sqft && (
                <p className="mt-5 inline-flex items-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                  {detailProject.area_sqft.toLocaleString()} sq. ft.
                  <span className="ml-2 text-xs font-normal text-white/65">Project area</span>
                </p>
              )}
            </div>
          </div>

          {/* Project specifications: display only approved public API fields. */}
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="project-specifications-title">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-800">At a glance</p>
                  <h3 id="project-specifications-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Project specifications</h3>
                </div>
                <span className="rounded-full bg-[#edf3ef] px-3 py-1.5 text-xs font-semibold text-[#244e4d]">Available project information</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ["Property type", detailProject.property_type],
                  ["Configuration", detailProject.bhk != null ? `${detailProject.bhk} BHK` : null],
                  ["Plot area", detailProject.plot_area_sqft != null ? `${detailProject.plot_area_sqft.toLocaleString()} sq. ft.` : null],
                  ["Built-up area", detailProject.area_sqft != null ? `${detailProject.area_sqft.toLocaleString()} sq. ft.` : null],
                  ["Carpet area", detailProject.carpet_area_sqft != null ? `${detailProject.carpet_area_sqft.toLocaleString()} sq. ft.` : null],
                  ["Total floors", detailProject.floor_count],
                  ["Bedrooms", detailProject.bedroom_count],
                  ["Bathrooms", detailProject.bathroom_count],
                  ["Kitchens", detailProject.kitchen_count],
                  ["Balconies", detailProject.balcony_count],
                  ["Parking spaces", detailProject.parking_spaces],
                  ["Facing", detailProject.facing],
                  ["Architectural style", detailProject.architectural_style],
                  ["Location", [detailProject.city, detailProject.state].filter(Boolean).join(", ")],
                ] as Array<[string, string | number | null | undefined]>).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-[#f8f9f7] px-4 py-4">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1.5 break-words text-base font-semibold text-[#173638]">{value !== null && value !== undefined && value !== "" ? value : "Not provided"}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-800">Design features</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Amenities & highlights</h3>
                {detailProject.amenities?.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {detailProject.amenities.map((amenity, index) => (
                      <span key={`${amenity}-${index}`} className="rounded-full border border-[#d6e5dd] bg-[#edf3ef] px-3.5 py-2 text-sm font-medium text-[#244e4d]">{amenity}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-6 text-slate-500">Amenities have not been provided for this project.</p>
                )}
              </section>
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-800">Planning information</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Indicative construction budget</h3>
                <p className="mt-5 text-2xl font-semibold tracking-tight text-[#173638] sm:text-3xl">
                  {detailProject.estimated_cost_min != null || detailProject.estimated_cost_max != null
                    ? `${detailProject.estimated_cost_min != null ? formatINR(detailProject.estimated_cost_min) : "Not specified"} – ${detailProject.estimated_cost_max != null ? formatINR(detailProject.estimated_cost_max) : "Not specified"}`
                    : "Not provided"}
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-500">Budget figures, where available, are indicative. Construction scope, specifications, inclusions and final costs must be confirmed through MHD.</p>
              </section>
            </div>
          </div>

          <div className="mt-9">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-800">Visual walkthrough</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Floor-wise plans & project gallery</h3>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">Project images</span>
            </div>

            {(() => {
              const floors = projectFloorsByProject[detailProject.id] ?? [];
              const images = projectImages[detailProject.id] ?? [];

              const renderImage = (image: (typeof images)[number], fallback: string) => {
                const imageName = (image.category || "Project image")
                  .replace(/[_-]+/g, " ")
                  .replace(/\b\w/g, (character) => character.toUpperCase());
                const imageDescription = image.alt_text?.trim() || "No additional description has been provided for this image.";

                return (
                  <figure key={image.id} className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <div className="relative overflow-hidden bg-slate-100">
                      <img
                        src={resolveImageUrl(image.image_url)}
                        alt={image.alt_text || `${imageName} — ${fallback}`}
                        loading="lazy"
                        className="h-64 w-full object-cover transition duration-500 group-hover:scale-[1.035] sm:h-72"
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                      <span className="absolute left-4 top-4 rounded-full border border-white/30 bg-slate-950/65 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur">
                        {imageName}
                      </span>
                    </div>
                    <figcaption className="border-t border-slate-100 px-5 py-4">
                      <h5 className="text-sm font-semibold text-slate-900">{imageName}</h5>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">{imageDescription}</p>
                    </figcaption>
                  </figure>
                );
              };

              if (floors.length === 0) {
                return images.length > 0 ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {images.map((image) => renderImage(image, detailProject.title))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                    <p className="text-sm font-semibold text-slate-700">Project images coming soon</p>
                    <p className="mt-1 text-xs text-slate-500">The visual gallery for this project will be updated here.</p>
                  </div>
                );
              }

              const unassignedImages = images.filter((image) => !image.floor_id);

              return (
                <div className="space-y-6">
                  {floors.map((floor) => {
                    const floorImages = images.filter((image) => image.floor_id === floor.id);
                    return (
                      <section key={floor.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-800">Floor plan</p>
                            <h4 className="mt-1 text-lg font-semibold text-slate-900">{floor.floor_name}</h4>
                          </div>
                          {floor.area_sqft && (
                            <span className="rounded-full bg-[#edf3ef] px-3 py-1.5 text-xs font-semibold text-[#244e4d]">
                              {floor.area_sqft.toLocaleString()} sq. ft.
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Floor number: {floor.floor_number}</p>
                        {floor.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{floor.description}</p>}
                        {floorImages.length > 0 ? (
                          <div className="mt-5 grid gap-5 sm:grid-cols-2">
                            {floorImages.map((image) => renderImage(image, floor.floor_name))}
                          </div>
                        ) : (
                          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No images are available for this floor yet.</p>
                        )}
                      </section>
                    );
                  })}
                  {unassignedImages.length > 0 && (
                    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                      <h4 className="text-lg font-semibold text-slate-900">General project gallery</h4>
                      <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        {unassignedImages.map((image) => renderImage(image, detailProject.title))}
                      </div>
                    </section>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="mt-9 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-800">Project overview</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">About this project</h3>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
              {detailProject.description || "Project information will be updated soon."}
            </p>
          </div>

          <div className="mt-8 rounded-2xl bg-[#eef2ef] p-5 sm:p-6">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedProject(detailProject);
                  setEnquiryForm(EMPTY_ENQUIRY);
                  setEnquiryError("");
                  setEnquirySuccess("");
                  setDetailProject(null);
                }}
                className="rounded-full bg-[#173638] px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#244e4d] hover:shadow-lg"
              >
                Enquire Through MHD
              </button>
              <button
                type="button"
                onClick={() => {
                  setSiteVisitProject(detailProject);
                  setSiteVisitForm(EMPTY_SITE_VISIT);
                  setSiteVisitError("");
                  setSiteVisitSuccess("");
                  setDetailProject(null);
                }}
                className="rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-[#244e4d] hover:text-[#244e4d]"
              >
                Request a Site Visit
              </button>
              <button
                type="button"
                onClick={() => setDetailProject(null)}
                className="rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-950"
              >
                Close Details
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              All enquiries are coordinated through MHD. Private architect contact information is not displayed here.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
)}


{siteVisitProject && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="site-visit-title"
  >
    <form
      onSubmit={submitSiteVisit}
      className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700">
            MHD site visits
          </p>
          <h2 id="site-visit-title" className="mt-2 text-2xl font-semibold">
            Request a Site Visit
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {siteVisitProject.title} · {siteVisitProject.city}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSiteVisitProject(null)}
          aria-label="Close site-visit form"
          className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100"
        >
          ×
        </button>
      </div>

      {siteVisitError && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {siteVisitError}
        </p>
      )}

      {siteVisitSuccess && (
        <div role="status" className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-800">
          {siteVisitSuccess}
        </div>
      )}

      <div className="mt-6 grid gap-4">
        <label className="text-sm font-medium">
          Full name
          <input
            required
            minLength={2}
            maxLength={150}
            autoComplete="name"
            value={siteVisitForm.customer_name}
            onChange={(e) =>
              setSiteVisitForm({
                ...siteVisitForm,
                customer_name: e.target.value,
              })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700"
          />
        </label>

        <label className="text-sm font-medium">
          Email address
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            value={siteVisitForm.customer_email}
            onChange={(e) =>
              setSiteVisitForm({
                ...siteVisitForm,
                customer_email: e.target.value,
              })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700"
          />
        </label>

        <label className="text-sm font-medium">
          Phone number
          <input
            required
            type="tel"
            minLength={7}
            maxLength={30}
            autoComplete="tel"
            value={siteVisitForm.customer_phone}
            onChange={(e) =>
              setSiteVisitForm({
                ...siteVisitForm,
                customer_phone: e.target.value,
              })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700"
          />
        </label>

        <label className="text-sm font-medium">
          Preferred date and time
          <input
            required
            type="datetime-local"
            min={new Date(
              Date.now() - new Date().getTimezoneOffset() * 60000
            ).toISOString().slice(0, 16)}
            value={siteVisitForm.requested_at}
            onChange={(e) =>
              setSiteVisitForm({
                ...siteVisitForm,
                requested_at: e.target.value,
              })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700"
          />
        </label>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        This submits a visit request, not a confirmed appointment. MHD
        will coordinate the proposed date and time with you.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={siteVisitSending || Boolean(siteVisitSuccess)}
          className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
        >
          {siteVisitSending
            ? "Submitting..."
            : siteVisitSuccess
              ? "Request Submitted"
              : "Submit Request"}
        </button>

        <button
          type="button"
          onClick={() => setSiteVisitProject(null)}
          className="rounded-full border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-100"
        >
          Close
        </button>
      </div>
    </form>
  </div>
)}



{selectedProject && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="enquiry-title"
  >
    <form
      onSubmit={submitEnquiry}
      className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700">
            MHD enquiries
          </p>
          <h2 id="enquiry-title" className="mt-2 text-2xl font-semibold">
            Enquire about this project
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {selectedProject.title} · {selectedProject.city}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSelectedProject(null)}
          className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100"
          aria-label="Close enquiry form"
        >
          ×
        </button>
      </div>

      {enquiryError && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {enquiryError}
        </p>
      )}

      {enquirySuccess && (
        <div role="status" className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Enquiry submitted successfully</p>
          <p className="mt-1">{enquirySuccess}</p>
          <p className="mt-2">
            The MHD team will coordinate your enquiry.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Full name
          <input
            required
            minLength={2}
            maxLength={150}
            autoComplete="name"
            value={enquiryForm.customer_name}
            onChange={(e) =>
              setEnquiryForm({ ...enquiryForm, customer_name: e.target.value })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-100"
          />
        </label>

        <label className="text-sm font-medium">
          Phone number
          <input
            required
            minLength={7}
            maxLength={30}
            type="tel"
            autoComplete="tel"
            value={enquiryForm.customer_phone}
            onChange={(e) =>
              setEnquiryForm({ ...enquiryForm, customer_phone: e.target.value })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-100"
          />
        </label>

        <label className="text-sm font-medium sm:col-span-2">
          Email address
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            value={enquiryForm.customer_email}
            onChange={(e) =>
              setEnquiryForm({ ...enquiryForm, customer_email: e.target.value })
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-100"
          />
        </label>

        <label className="text-sm font-medium sm:col-span-2">
          Subject (optional)
          <input
            maxLength={200}
            value={enquiryForm.subject}
            onChange={(e) =>
              setEnquiryForm({ ...enquiryForm, subject: e.target.value })
            }
            placeholder="e.g. Request for project information"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-100"
          />
        </label>

        <label className="text-sm font-medium sm:col-span-2">
          Your message
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={4}
            value={enquiryForm.message}
            onChange={(e) =>
              setEnquiryForm({ ...enquiryForm, message: e.target.value })
            }
            placeholder="Tell us what you'd like to know about this project..."
            className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-100"
          />
        </label>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Your enquiry is handled by MHD. Architect contact details are
        not displayed on this form.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enquirySending || Boolean(enquirySuccess)}
          className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enquirySending
            ? "Submitting..."
            : enquirySuccess
              ? "Submitted"
              : "Submit Enquiry"}
        </button>

        <button
          type="button"
          onClick={() => setSelectedProject(null)}
          className="rounded-full border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-100"
        >
          Close
        </button>
      </div>
    </form>
  </div>
)}
      </div>
  );
}


type SiteVisitForm = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  requested_at: string;
};

const EMPTY_SITE_VISIT: SiteVisitForm = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  requested_at: "",
};


function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/company") {
    return <CompanyDashboard />;
  }

  if (path === "/architect") {
    return <ArchitectDashboard />;
  }
  if (path === "/ai-home-design") {
    return <AIHomeDesignPage />;
  }


  return <PublicSite />;
}

export default App;
