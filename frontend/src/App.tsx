import { useEffect, useState, type FormEvent } from "react";
import CompanyDashboard from "./CompanyDashboard";
import ArchitectDashboard from "./ArchitectDashboard";

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
  const [projectImages, setProjectImages] = useState<Record<string, ProjectImage[]>>({});
  const [projectFloorsByProject, setProjectFloorsByProject] = useState<Record<string, ProjectFloor[]>>({});
  const [loading, setLoading] = useState(true);
  const [filterDraft, setFilterDraft] =
  useState<DiscoveryFilters>(EMPTY_DISCOVERY_FILTERS);

const [appliedFilters, setAppliedFilters] =
  useState<DiscoveryFilters>(EMPTY_DISCOVERY_FILTERS);

  const [sortBy, setSortBy] = useState("newest");

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
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
      "Your site-visit request has been submitted to Core Brick. The team will coordinate the appointment."
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



  return (
    <div className="min-h-screen bg-[#f4f6f5] text-slate-900">
      {/* Navigation */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <a href="#" className="text-2xl font-black tracking-tight">
            CORE <span className="text-orange-700">BRICK.</span>
          </a>



<div className="hidden items-center gap-6 text-sm font-medium md:flex">
  <a href="#home" className="hover:text-orange-700">
    Home
  </a>
  <a href="#projects" className="hover:text-orange-700">
    Projects
  </a>
  <a href="#about" className="hover:text-orange-700">
    About Us
  </a>
  <a href="#contact" className="hover:text-orange-700">
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
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-800"
          >
            Get in Touch
          </a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section
          id="home"
          className="relative overflow-hidden bg-[#142d35] text-white"
        >
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-orange-700/20 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 md:grid-cols-2 md:px-8 md:py-32">
            <div>
              <p className="mb-6 text-xs font-bold uppercase tracking-[0.35em] text-orange-400">
                Construction · Design · Trust
              </p>

              <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight md:text-7xl">
                Build your vision.
                <span className="mt-2 block text-orange-500">
                  Find your space.
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">
                Discover thoughtfully designed properties and connect with
                Core Brick to take your next step in construction and real
                estate.
              </p>

              <div className="mt-9 flex flex-wrap gap-4">
                <a
                  href="#projects"
                  className="rounded-full bg-orange-600 px-7 py-4 font-semibold text-white transition hover:bg-orange-700"
                >
                  Explore Projects <span aria-hidden="true">↗</span>
                </a>
                <a
                  href="#about"
                  className="rounded-full border border-slate-500 px-7 py-4 font-semibold transition hover:border-white"
                >
                  Discover Core Brick
                </a>
              </div>

              <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-400">
                <span>✓ Reviewed projects</span>
                <span>✓ Guided enquiries</span>
                <span>✓ One trusted connection</span>
              </div>
            </div>

            {/* Architectural illustration placeholder */}
            <div className="relative mx-auto w-full max-w-lg">
              <div className="absolute -inset-3 rounded-3xl border border-orange-500/20" />
              <div className="relative flex aspect-[4/5] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#24434a] via-[#142d35] to-[#603c30] p-8">
                <div className="absolute inset-0 opacity-40">
                  <div className="absolute bottom-0 left-[12%] h-[68%] w-[35%] border-x-8 border-t-8 border-slate-400/60 bg-slate-500/10" />
                  <div className="absolute bottom-0 right-[10%] h-[84%] w-[43%] border-x-8 border-t-8 border-orange-400/60 bg-orange-100/5" />
                  <div className="absolute bottom-0 left-[25%] h-[35%] w-[20%] border-x-4 border-t-4 border-orange-300/60" />
                  <div className="absolute bottom-0 right-[22%] h-[45%] w-[19%] border-x-4 border-t-4 border-slate-300/60" />
                </div>

                <div className="relative z-10">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-300">
                    Spaces with purpose
                  </p>
                  <p className="mt-3 text-3xl font-semibold leading-tight text-white md:text-4xl">
                    A foundation for what comes next.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Intro strip */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-9 text-center sm:grid-cols-3 md:px-8">
            <div>
              <p className="font-semibold">Discover</p>
              <p className="mt-1 text-sm text-slate-500">
                Explore published projects
              </p>
            </div>
            <div>
              <p className="font-semibold">Enquire</p>
              <p className="mt-1 text-sm text-slate-500">
                Let our team guide you
              </p>
            </div>
            <div>
              <p className="font-semibold">Build</p>
              <p className="mt-1 text-sm text-slate-500">
                Move forward with confidence
              </p>
            </div>
          </div>
        </section>

        {/* Projects */}
        <section id="projects" className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-700">
                The Core Brick collection
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Featured Projects
              </h2>
              <p className="mt-2 max-w-xl leading-7 text-slate-600">
                Explore projects reviewed by our team and approved for public
                viewing.
              </p>
            </div>

            <span className="text-sm text-slate-500">
              {projects.length} published{" "}
              {projects.length === 1 ? "project" : "projects"}
            </span>
          </div>

          <form
            onSubmit={applyDiscoveryFilters}
            className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_55px_-38px_rgba(15,23,42,0.45)]"
          >
            <div className="h-1.5 bg-gradient-to-r from-slate-900 via-orange-600 to-orange-300" />
            <div className="p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-700">Design finder</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                    Find a design that fits your vision
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                    Start with a few essentials. Add detailed specifications only when needed.
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
                    Search designs <span aria-hidden="true">↗</span>
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
      {projects.length} published design(s) found
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
          Our published portfolio will appear here as new projects
          are approved by Core Brick.
        </p>
      </>
    )}
  </div>
)}

          {!loading && !error && projects.length > 0 && (
            <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const primaryImage = projectImages[project.id]?.[0];

                return (
                  <article
                    key={project.id}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="relative flex aspect-[4/3] items-end overflow-hidden bg-gradient-to-br from-slate-300 via-slate-200 to-orange-100 p-6">
                      {primaryImage ? (
                        <img
                          src={resolveImageUrl(primaryImage.image_url)}
                          alt={primaryImage.alt_text || project.title}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
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
                      <span className="relative z-10 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800">
                        {project.property_type}
                      </span>
                    </div>

                  <div className="p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
                      Company approved
                    </p>
                    <h3 className="mt-3 text-xl font-semibold">
                      {project.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
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

{(project.estimated_cost_min !== null ||
  project.estimated_cost_max !== null) && (
  <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
    <p className="text-xs font-semibold uppercase tracking-wider text-orange-800">
      Estimated Construction Budget
    </p>

    <p className="mt-1 text-lg font-bold text-slate-900">
      {project.estimated_cost_min !== null &&
       project.estimated_cost_min !== "" &&
       project.estimated_cost_max !== null &&
       project.estimated_cost_max !== ""
        ? `${formatINR(project.estimated_cost_min)} – ${formatINR(project.estimated_cost_max)}`
        : formatINR(
            project.estimated_cost_min ?? project.estimated_cost_max
          )}
    </p>
  </div>
)}

                    {project.description && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                        {project.description}
                      </p>
                    )}


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
  Enquire through Core Brick <span aria-hidden="true">→</span>
</button>


<button
  type="button"
  onClick={() => setDetailProject(project)}
  className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-orange-700 hover:text-orange-800"
>
  View Project Details <span aria-hidden="true">↗</span>
</button>


                  </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* About */}
        <section id="about" className="bg-slate-200/70 px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-800">
                The Core Brick approach
              </p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight">
                Built on clarity.
                <br />
                Designed around you.
              </h2>
            </div>

            <p className="text-base leading-8 text-slate-600">
              Finding the right property should feel straightforward. Core
              Brick brings approved projects together in one place and
              coordinates enquiries through the company, creating a clear
              connection between customers and the project team.
            </p>
          </div>
        </section>

        {/* Contact CTA */}
        <section id="contact" className="bg-[#174b53] px-5 py-16 text-white md:px-8 md:py-20">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-200">
                Start a conversation
              </p>
              <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
                Have a project in mind?
              </h2>
              <p className="mt-3 max-w-xl text-orange-100">
                Get in touch with Core Brick to discuss your requirements.
              </p>
            </div>

            <a
              href="mailto:info@corebrick.example"
              className="inline-flex w-fit rounded-full bg-white px-7 py-4 font-semibold text-slate-900 transition hover:bg-orange-100"
            >
              Contact Core Brick ↗
            </a>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 px-5 py-8 text-slate-400 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xl font-black text-white">
            CORE <span className="text-orange-500">BRICK.</span>
          </p>
          <p className="text-sm">
            © {new Date().getFullYear()} Core Brick. All rights reserved.
          </p>
        </div>
      </footer>

      <a href="/architect" className="hover:text-white">
  Architect Portal
</a>



{detailProject && (
  <div
    className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-detail-title"
  >
    <section className="my-auto max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-sm font-bold tracking-wide text-orange-800">
          CORE BRICK PROJECT DETAILS
        </span>

        <button
          type="button"
          onClick={() => setDetailProject(null)}
          aria-label="Close project details"
          className="rounded-lg px-3 py-2 text-2xl text-slate-500 hover:bg-slate-100"
        >
          ×
        </button>
      </div>

      <div className="p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-green-700">
          Company approved
        </p>

        <h2
          id="project-detail-title"
          className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {detailProject.title}
        </h2>

        <p className="mt-3 text-slate-600">
          {detailProject.property_type} · {detailProject.city},{" "}
          {detailProject.state}
        </p>

        {detailProject.area_sqft && (
          <p className="mt-2 text-sm font-medium text-slate-700">
            {detailProject.area_sqft.toLocaleString()} sq. ft.
          </p>
        )}

        <div className="mt-8">
            <h3 className="text-lg font-semibold">
              Floor-wise Plans & Project Gallery
            </h3>

            {(() => {
              const floors = projectFloorsByProject[detailProject.id] ?? [];
              const images = projectImages[detailProject.id] ?? [];

              if (floors.length === 0) {
                return images.length > 0 ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {images.map((image) => (
                      <img
                        key={image.id}
                        src={resolveImageUrl(image.image_url)}
                        alt={image.alt_text || detailProject.title}
                        loading="lazy"
                        className="h-64 w-full rounded-xl bg-slate-100 object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
                    Project images will be available soon.
                  </p>
                );
              }

              const unassignedImages = images.filter(
                (image) => !image.floor_id,
              );

              return (
                <div className="mt-5 space-y-6">

                  {floors.map((floor) => {
                    const floorImages = images.filter(
                      (image) => image.floor_id === floor.id,
                    );

                    return (
                      <section
                        key={floor.id}
                        className="rounded-xl border border-slate-200 p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-lg font-semibold">
                            {floor.floor_name}
                          </h4>

                          {floor.area_sqft && (
                            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900">
                              {floor.area_sqft.toLocaleString()} sq. ft.
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          Floor number: {floor.floor_number}
                        </p>

                        {floor.description && (
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {floor.description}
                          </p>
                        )}

                        {floorImages.length > 0 ? (
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            {floorImages.map((image) => (
                              <figure key={image.id}>
                                <img
                                  src={resolveImageUrl(image.image_url)}
                                  alt={image.alt_text || floor.floor_name}
                                  loading="lazy"
                                  className="h-64 w-full rounded-xl bg-slate-100 object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />

                                {image.alt_text && (
                                  <figcaption className="mt-2 text-xs text-slate-500">
                                    {image.alt_text}
                                  </figcaption>
                                )}
                              </figure>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                            No images are available for this floor yet.
                          </p>
                        )}
                      </section>
                    );
                  })}

                  {unassignedImages.length > 0 && (
                    <section className="rounded-xl border border-slate-200 p-5">
                      <h4 className="text-lg font-semibold">
                        General Project Gallery
                      </h4>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {unassignedImages.map((image) => (
                          <figure key={image.id}>
                            <img
                              src={resolveImageUrl(image.image_url)}
                              alt={image.alt_text || detailProject.title}
                              loading="lazy"
                              className="h-64 w-full rounded-xl bg-slate-100 object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />

                            {image.alt_text && (
                              <figcaption className="mt-2 text-xs text-slate-500">
                                {image.alt_text}
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    </section>
                  )}

                </div>
              );
            })()}
        </div>
        <div className="mt-8">
          <h3 className="text-lg font-semibold">About This Project</h3>

          <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
            {detailProject.description || "Project information will be updated soon."}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={() => {
              setSelectedProject(detailProject);
              setEnquiryForm(EMPTY_ENQUIRY);
              setEnquiryError("");
              setEnquirySuccess("");
              setDetailProject(null);
            }}
            className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-orange-800"
          >
            Enquire Through Core Brick
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
  className="rounded-full border border-slate-300 px-6 py-3 font-semibold transition hover:border-orange-700 hover:text-orange-800"
>
  Request a Site Visit
</button>


          <button
            type="button"
            onClick={() => setDetailProject(null)}
            className="rounded-full border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-100"
          >
            Close Details
          </button>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          All enquiries are coordinated through Core Brick. Private architect
          contact information is not displayed here.
        </p>
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
            Core Brick site visits
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
        This submits a visit request, not a confirmed appointment. Core Brick
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
            Core Brick enquiries
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
            The Core Brick team will coordinate your enquiry.
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
        Your enquiry is handled by Core Brick. Architect contact details are
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

  return <PublicSite />;
}

export default App;
