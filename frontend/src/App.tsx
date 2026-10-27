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
  status: string;
};

type ProjectImage = {
  id: string;
  project_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
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

function PublicSite() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectImages, setProjectImages] = useState<Record<string, ProjectImage[]>>({});
  const [loading, setLoading] = useState(true);
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


  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      try {
        const response = await fetch(`${API_URL}/projects/public`, {
          signal: controller.signal,
        });

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
  }, []);



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
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Navigation */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <a href="#" className="text-2xl font-black tracking-tight">
            CORE <span className="text-amber-700">BRICK.</span>
          </a>



<div className="hidden items-center gap-6 text-sm font-medium md:flex">
  <a href="#home" className="hover:text-amber-700">
    Home
  </a>
  <a href="#projects" className="hover:text-amber-700">
    Projects
  </a>
  <a href="#about" className="hover:text-amber-700">
    About Us
  </a>
  <a href="#contact" className="hover:text-amber-700">
    Contact
  </a>
  <a
    href="/architect"
    className="border-l border-stone-300 pl-6 font-semibold hover:text-amber-700"
  >
    Architect Portal
  </a>
</div>



          <a
            href="#contact"
            className="rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            Get in Touch
          </a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section
          id="home"
          className="relative overflow-hidden bg-stone-900 text-white"
        >
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-amber-700/20 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 md:grid-cols-2 md:px-8 md:py-32">
            <div>
              <p className="mb-6 text-xs font-bold uppercase tracking-[0.35em] text-amber-400">
                Construction · Design · Trust
              </p>

              <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight md:text-7xl">
                Build your vision.
                <span className="mt-2 block text-amber-500">
                  Find your space.
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-lg leading-8 text-stone-300">
                Discover thoughtfully designed properties and connect with
                Core Brick to take your next step in construction and real
                estate.
              </p>

              <div className="mt-9 flex flex-wrap gap-4">
                <a
                  href="#projects"
                  className="rounded-full bg-amber-600 px-7 py-4 font-semibold text-white transition hover:bg-amber-700"
                >
                  Explore Projects <span aria-hidden="true">↗</span>
                </a>
                <a
                  href="#about"
                  className="rounded-full border border-stone-500 px-7 py-4 font-semibold transition hover:border-white"
                >
                  Discover Core Brick
                </a>
              </div>

              <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-stone-400">
                <span>✓ Reviewed projects</span>
                <span>✓ Guided enquiries</span>
                <span>✓ One trusted connection</span>
              </div>
            </div>

            {/* Architectural illustration placeholder */}
            <div className="relative mx-auto w-full max-w-lg">
              <div className="absolute -inset-3 rounded-3xl border border-amber-500/20" />
              <div className="relative flex aspect-[4/5] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-stone-700 via-stone-800 to-amber-950 p-8">
                <div className="absolute inset-0 opacity-40">
                  <div className="absolute bottom-0 left-[12%] h-[68%] w-[35%] border-x-8 border-t-8 border-stone-400/60 bg-stone-500/10" />
                  <div className="absolute bottom-0 right-[10%] h-[84%] w-[43%] border-x-8 border-t-8 border-amber-400/60 bg-amber-100/5" />
                  <div className="absolute bottom-0 left-[25%] h-[35%] w-[20%] border-x-4 border-t-4 border-amber-300/60" />
                  <div className="absolute bottom-0 right-[22%] h-[45%] w-[19%] border-x-4 border-t-4 border-stone-300/60" />
                </div>

                <div className="relative z-10">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">
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
        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-9 text-center sm:grid-cols-3 md:px-8">
            <div>
              <p className="font-semibold">Discover</p>
              <p className="mt-1 text-sm text-stone-500">
                Explore published projects
              </p>
            </div>
            <div>
              <p className="font-semibold">Enquire</p>
              <p className="mt-1 text-sm text-stone-500">
                Let our team guide you
              </p>
            </div>
            <div>
              <p className="font-semibold">Build</p>
              <p className="mt-1 text-sm text-stone-500">
                Move forward with confidence
              </p>
            </div>
          </div>
        </section>

        {/* Projects */}
        <section id="projects" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-700">
                The Core Brick collection
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
                Featured Projects
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-stone-600">
                Explore projects reviewed by our team and approved for public
                viewing.
              </p>
            </div>

            <span className="text-sm text-stone-500">
              {projects.length} published{" "}
              {projects.length === 1 ? "project" : "projects"}
            </span>
          </div>

          {loading && (
            <p className="mt-12 text-stone-500">Loading approved projects...</p>
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
            <div className="mt-12 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
              <div className="text-4xl text-amber-700" aria-hidden="true">⌂</div>
              <h3 className="mt-5 text-xl font-semibold">
                Something great is taking shape.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
                Our published portfolio will appear here. Check back as new
                projects are approved.
              </p>
            </div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const primaryImage = projectImages[project.id]?.[0];

                return (
                  <article
                    key={project.id}
                    className="group overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="relative flex aspect-[4/3] items-end overflow-hidden bg-gradient-to-br from-stone-300 via-stone-200 to-amber-100 p-6">
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
                        <div className="absolute inset-0 flex items-center justify-center text-7xl text-stone-500/50 transition group-hover:scale-105">
                          ⌂
                        </div>
                      )}
                      <span className="relative z-10 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-stone-800">
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
                    <p className="mt-2 text-sm text-stone-500">
                      {project.city}, {project.state}
                    </p>

                    {project.area_sqft && (
                      <p className="mt-3 text-sm text-stone-600">
                        {project.area_sqft.toLocaleString()} sq. ft.
                      </p>
                    )}

                    {project.description && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-600">
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
  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-amber-800 hover:text-amber-950"
>
  Enquire through Core Brick <span aria-hidden="true">→</span>
</button>


<button
  type="button"
  onClick={() => setDetailProject(project)}
  className="mt-5 inline-flex items-center gap-2 rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-amber-700 hover:text-amber-800"
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
        <section id="about" className="bg-stone-200/70 px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-800">
                The Core Brick approach
              </p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight">
                Built on clarity.
                <br />
                Designed around you.
              </h2>
            </div>

            <p className="text-base leading-8 text-stone-600">
              Finding the right property should feel straightforward. Core
              Brick brings approved projects together in one place and
              coordinates enquiries through the company, creating a clear
              connection between customers and the project team.
            </p>
          </div>
        </section>

        {/* Contact CTA */}
        <section id="contact" className="bg-amber-800 px-5 py-16 text-white md:px-8 md:py-20">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-200">
                Start a conversation
              </p>
              <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
                Have a project in mind?
              </h2>
              <p className="mt-3 max-w-xl text-amber-100">
                Get in touch with Core Brick to discuss your requirements.
              </p>
            </div>

            <a
              href="mailto:info@corebrick.example"
              className="inline-flex w-fit rounded-full bg-white px-7 py-4 font-semibold text-stone-900 transition hover:bg-amber-100"
            >
              Contact Core Brick ↗
            </a>
          </div>
        </section>
      </main>

      <footer className="bg-stone-950 px-5 py-8 text-stone-400 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xl font-black text-white">
            CORE <span className="text-amber-500">BRICK.</span>
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
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4">
        <span className="text-sm font-bold tracking-wide text-amber-800">
          CORE BRICK PROJECT DETAILS
        </span>

        <button
          type="button"
          onClick={() => setDetailProject(null)}
          aria-label="Close project details"
          className="rounded-lg px-3 py-2 text-2xl text-stone-500 hover:bg-stone-100"
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

        <p className="mt-3 text-stone-600">
          {detailProject.property_type} · {detailProject.city},{" "}
          {detailProject.state}
        </p>

        {detailProject.area_sqft && (
          <p className="mt-2 text-sm font-medium text-stone-700">
            {detailProject.area_sqft.toLocaleString()} sq. ft.
          </p>
        )}

        <div className="mt-8">
          <h3 className="text-lg font-semibold">Project Gallery</h3>

          {(projectImages[detailProject.id] ?? []).length > 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(projectImages[detailProject.id] ?? []).map((image) => (
                <img
                  key={image.id}
                  src={resolveImageUrl(image.image_url)}
                  alt={image.alt_text || detailProject.title}
                  loading="lazy"
                  className="h-64 w-full rounded-xl bg-stone-100 object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex h-48 items-center justify-center rounded-xl bg-gradient-to-br from-stone-200 to-amber-100 text-5xl text-stone-500">
              ⌂
            </div>
          )}
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold">About This Project</h3>

          <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-600">
            {detailProject.description || "Project information will be updated soon."}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-stone-200 pt-6">
          <button
            type="button"
            onClick={() => {
              setSelectedProject(detailProject);
              setEnquiryForm(EMPTY_ENQUIRY);
              setEnquiryError("");
              setEnquirySuccess("");
              setDetailProject(null);
            }}
            className="rounded-full bg-stone-900 px-6 py-3 font-semibold text-white transition hover:bg-amber-800"
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
  className="rounded-full border border-stone-300 px-6 py-3 font-semibold transition hover:border-amber-700 hover:text-amber-800"
>
  Request a Site Visit
</button>


          <button
            type="button"
            onClick={() => setDetailProject(null)}
            className="rounded-full border border-stone-300 px-6 py-3 font-semibold hover:bg-stone-100"
          >
            Close Details
          </button>
        </div>

        <p className="mt-4 text-xs leading-5 text-stone-500">
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
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Core Brick site visits
          </p>
          <h2 id="site-visit-title" className="mt-2 text-2xl font-semibold">
            Request a Site Visit
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {siteVisitProject.title} · {siteVisitProject.city}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSiteVisitProject(null)}
          aria-label="Close site-visit form"
          className="rounded-lg px-3 py-2 text-xl text-stone-500 hover:bg-stone-100"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
          />
        </label>
      </div>

      <p className="mt-4 text-xs leading-5 text-stone-500">
        This submits a visit request, not a confirmed appointment. Core Brick
        will coordinate the proposed date and time with you.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={siteVisitSending || Boolean(siteVisitSuccess)}
          className="rounded-full bg-stone-900 px-6 py-3 font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
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
          className="rounded-full border border-stone-300 px-6 py-3 font-semibold hover:bg-stone-100"
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
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Core Brick enquiries
          </p>
          <h2 id="enquiry-title" className="mt-2 text-2xl font-semibold">
            Enquire about this project
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {selectedProject.title} · {selectedProject.city}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSelectedProject(null)}
          className="rounded-lg px-3 py-2 text-xl text-stone-500 hover:bg-stone-100"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
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
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
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
            className="mt-2 w-full resize-y rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
          />
        </label>
      </div>

      <p className="mt-4 text-xs leading-5 text-stone-500">
        Your enquiry is handled by Core Brick. Architect contact details are
        not displayed on this form.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enquirySending || Boolean(enquirySuccess)}
          className="rounded-full bg-stone-900 px-6 py-3 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="rounded-full border border-stone-300 px-6 py-3 font-semibold hover:bg-stone-100"
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
