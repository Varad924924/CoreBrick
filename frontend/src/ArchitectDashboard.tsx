import { useEffect, useRef, useState, type FormEvent } from "react";
import "./corebrick-dashboard-theme.css";
import ArchitectSignup from "./ArchitectSignup";

const API_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "corebrick_architect_access_token";

const IMAGE_CATEGORIES = [
  ["floor_plan", "Floor Plans"],
  ["design_2d", "2D Designs"],
  ["elevation_3d", "3D Elevations"],
  ["interior", "Interior Designs"],
  ["exterior", "Exterior Views"],
  ["other", "Other Project Images"],
] as const;

const IMAGE_CATEGORY_HELP: Record<string, string> = {
  floor_plan: "Upload floor-plan drawings for the ground floor, first floor, upper floors, or basement.",
  design_2d: "Upload 2D architectural drawings, layouts, dimensions, or working drawings.",
  elevation_3d: "Upload 3D elevation renders, exterior visualisations, or rendered building views.",
  interior: "Upload interior renders for bedrooms, living rooms, kitchens, bathrooms, or other spaces.",
  exterior: "Upload exterior photographs, site views, landscaping, or completed-building photos.",
  other: "Upload reference images or project visuals that do not fit the categories above.",
};

function imageCategoryLabel(category: string): string {
  return IMAGE_CATEGORIES.find(([value]) => value === category)?.[1] ?? "Other Project Images";
}

type ArchitectUser = {
  id?: string;
  email: string;
  role: string;
  is_active: boolean;
  architect_approval_status?: string | null;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  user: ArchitectUser;
};

type NumericValue = number | string | null;

type Project = {
  id: string;
  title: string;
  description: string | null;
  property_type: string;
  city: string;
  state: string;
  area_sqft: NumericValue;
  building_type: string | null;
  architectural_style: string | null;
  bhk: number | null;
  facing: string | null;
  entrance_facing: string | null;
  plot_area_sqft: NumericValue;
  plot_width_ft: NumericValue;
  plot_length_ft: NumericValue;
  carpet_area_sqft: NumericValue;
  floor_count: number | null;
  bedroom_count: number | null;
  bathroom_count: number | null;
  kitchen_count: number | null;
  balcony_count: number | null;
  parking_spaces: number | null;
  estimated_cost_min: NumericValue;
  estimated_cost_max: NumericValue;
  amenities: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProjectDraft = {
  title: string;
  description: string;
  property_type: string;
  city: string;
  state: string;
  area_sqft: string;
  building_type: string;
  architectural_style: string;
  bhk: string;
  facing: string;
  entrance_facing: string;
  plot_area_sqft: string;
  plot_width_ft: string;
  plot_length_ft: string;
  carpet_area_sqft: string;
  floor_count: string;
  bedroom_count: string;
  bathroom_count: string;
  kitchen_count: string;
  balcony_count: string;
  parking_spaces: string;
  estimated_cost_min: string;
  estimated_cost_max: string;
  amenities: string;
};

type ProjectImage = {
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

type CreationImageDraft = {
  file: File;
  altText: string;
  category: string;
  isCover: boolean;
  sortOrder: number;
};

type PendingCreationUpload = {
  projectId: string;
  images: CreationImageDraft[];
};

type ApiError = Error & { status?: number };

const EMPTY_PROJECT: ProjectDraft = {
  title: "",
  description: "",
  property_type: "Residential",
  city: "",
  state: "Maharashtra",
  area_sqft: "",
  building_type: "",
  architectural_style: "",
  bhk: "",
  facing: "",
  entrance_facing: "",
  plot_area_sqft: "",
  plot_width_ft: "",
  plot_length_ft: "",
  carpet_area_sqft: "",
  floor_count: "",
  bedroom_count: "",
  bathroom_count: "",
  kitchen_count: "",
  balcony_count: "",
  parking_spaces: "",
  estimated_cost_min: "",
  estimated_cost_max: "",
  amenities: "",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Company review",
  approved: "Approved and published",
  rejected: "Changes requested / rejected",
};

const inputClass =
  "mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-stone-100";
const labelClass = "block text-sm font-medium text-stone-700";
const buttonClass =
  "inline-flex items-center justify-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-amber-700 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-50";

function readableError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

async function readResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function valueToString(value: NumericValue | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function projectToDraft(project: Project): ProjectDraft {
  return {
    title: project.title ?? "",
    description: project.description ?? "",
    property_type: project.property_type ?? "Residential",
    city: project.city ?? "",
    state: project.state ?? "Maharashtra",
    area_sqft: valueToString(project.area_sqft),
    building_type: project.building_type ?? "",
    architectural_style: project.architectural_style ?? "",
    bhk: valueToString(project.bhk),
    facing: project.facing ?? "",
    entrance_facing: project.entrance_facing ?? "",
    plot_area_sqft: valueToString(project.plot_area_sqft),
    plot_width_ft: valueToString(project.plot_width_ft),
    plot_length_ft: valueToString(project.plot_length_ft),
    carpet_area_sqft: valueToString(project.carpet_area_sqft),
    floor_count: valueToString(project.floor_count),
    bedroom_count: valueToString(project.bedroom_count),
    bathroom_count: valueToString(project.bathroom_count),
    kitchen_count: valueToString(project.kitchen_count),
    balcony_count: valueToString(project.balcony_count),
    parking_spaces: valueToString(project.parking_spaces),
    estimated_cost_min: valueToString(project.estimated_cost_min),
    estimated_cost_max: valueToString(project.estimated_cost_max),
    amenities: (project.amenities ?? []).join(", "),
  };
}

function draftToPayload(draft: ProjectDraft) {
  return {
    title: draft.title.trim(),
    description: textOrNull(draft.description),
    property_type: draft.property_type,
    city: draft.city.trim(),
    state: draft.state.trim(),
    area_sqft: numberOrNull(draft.area_sqft),
    building_type: textOrNull(draft.building_type),
    architectural_style: textOrNull(draft.architectural_style),
    bhk: numberOrNull(draft.bhk),
    facing: textOrNull(draft.facing),
    entrance_facing: textOrNull(draft.entrance_facing),
    plot_area_sqft: numberOrNull(draft.plot_area_sqft),
    plot_width_ft: numberOrNull(draft.plot_width_ft),
    plot_length_ft: numberOrNull(draft.plot_length_ft),
    carpet_area_sqft: numberOrNull(draft.carpet_area_sqft),
    floor_count: numberOrNull(draft.floor_count),
    bedroom_count: numberOrNull(draft.bedroom_count),
    bathroom_count: numberOrNull(draft.bathroom_count),
    kitchen_count: numberOrNull(draft.kitchen_count),
    balcony_count: numberOrNull(draft.balcony_count),
    parking_spaces: numberOrNull(draft.parking_spaces),
    estimated_cost_min: numberOrNull(draft.estimated_cost_min),
    estimated_cost_max: numberOrNull(draft.estimated_cost_max),
    amenities: draft.amenities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50),
  };
}





function ArchitectDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showSignup, setShowSignup] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [profile, setProfile] = useState<ArchitectUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [creationImages, setCreationImages] = useState<CreationImageDraft[]>([]);
  const [pendingCreationUpload, setPendingCreationUpload] = useState<PendingCreationUpload | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File[]>>({});
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  const [imageCategories, setImageCategories] = useState<Record<string, string>>({});
  const [coverSelections, setCoverSelections] = useState<Record<string, boolean>>({});
  const [replacementFiles, setReplacementFiles] = useState<Record<string, File | null>>({});
  const [replacingImageId, setReplacingImageId] = useState("");
  const [deletingImageId, setDeletingImageId] = useState("");
  const [imagesByProject, setImagesByProject] = useState<Record<string, ProjectImage[]>>({});
  const [coverImageUrls, setCoverImageUrls] = useState<Record<string, string>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [uploadingId, setUploadingId] = useState("");
  const [assetLoadingId, setAssetLoadingId] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previewUrls = useRef<Record<string, string[]>>({});

  useEffect(() => {
    return () => {
      Object.values(previewUrls.current).flat().forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setProjects([]);
      setProfile(null);
      return;
    }

    const controller = new AbortController();

    async function loadPortal() {
      setProjectsLoading(true);
      setError("");
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [meResponse, projectsResponse] = await Promise.all([
          fetch(`${API_URL}/auth/me`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/projects/mine`, { headers, signal: controller.signal }),
        ]);

        const meData = await readResponse(meResponse);
        if (meResponse.status === 401 || meResponse.status === 403) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          throw new Error("Your session expired or is not authorized. Please sign in again.");
        }
        if (!meResponse.ok) {
          throw new Error(readableError(meData, `Unable to verify account (${meResponse.status}).`));
        }

        const currentUser = meData as ArchitectUser;
        if (currentUser.role !== "architect" || !currentUser.is_active) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          throw new Error("Please sign in with an active Architect account.");
        }
        setProfile(currentUser);

        const projectsData = await readResponse(projectsResponse);
        if (!projectsResponse.ok) {
          throw new Error(readableError(projectsData, `Unable to load projects (${projectsResponse.status}).`));
        }
        setProjects(projectsData as Project[]);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load architect portal.");
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    }

    void loadPortal();
    return () => controller.abort();
  }, [token, refreshKey]);

  // Load one private cover-image preview per project for the portfolio grid.
  // Pending/rejected projects are allowed here because the architect owns them.
  useEffect(() => {
    if (!token || projects.length === 0) {
      setCoverImageUrls({});
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const objectUrls: string[] = [];

    async function loadProjectCovers() {
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const entries: Array<[string, string | null]> = await Promise.all(
          projects.map(async (project): Promise<[string, string | null]> => {
            try {
              const metadataResponse = await fetch(
                `${API_URL}/projects/mine/${project.id}/images`,
                { headers, signal: controller.signal, cache: "no-store" },
              );
              if (!metadataResponse.ok) return [project.id, null];

              const metadata = (await metadataResponse.json()) as ProjectImage[];
              if (metadata.length === 0) return [project.id, null];

              const cover = metadata.find((image) => image.is_cover)
                ?? [...metadata].sort((a, b) => a.sort_order - b.sort_order)[0];
              if (!cover?.image_url) return [project.id, null];

              const imageResponse = await fetch(`${API_URL}${cover.image_url}`, {
                headers,
                signal: controller.signal,
                cache: "no-store",
              });
              if (!imageResponse.ok) return [project.id, null];

              const blob = await imageResponse.blob();
              if (cancelled) return [project.id, null];
              const objectUrl = URL.createObjectURL(blob);
              objectUrls.push(objectUrl);
              return [project.id, objectUrl];
            } catch (err) {
              if (err instanceof Error && err.name === "AbortError") return [project.id, null];
              return [project.id, null];
            }
          }),
        );

        if (!cancelled) {
          const nextUrls: Record<string, string> = {};
          for (const [projectId, url] of entries) {
            if (url) nextUrls[projectId] = url;
          }
          setCoverImageUrls(nextUrls);
        }
      } catch {
        if (!cancelled) setCoverImageUrls({});
      }
    }

    void loadProjectCovers();
    return () => {
      cancelled = true;
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [token, projects]);

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const data = await readResponse(response);
    if (!response.ok) {
      const err = new Error(readableError(data, `Request failed (${response.status}).`)) as ApiError;
      err.status = response.status;
      throw err;
    }
    return data as T;
  }

  async function loadProjectAssets(projectId: string) {
    if (!token) return;
    setAssetLoadingId(projectId);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const imageResponse = await fetch(
        `${API_URL}/projects/mine/${projectId}/images`,
        { headers, cache: "no-store" },
      );
      const imageData = await readResponse(imageResponse);
      if (!imageResponse.ok) {
        throw new Error(readableError(imageData, `Unable to load images (${imageResponse.status}).`));
      }

      const imageList = imageData as ProjectImage[];
      const previews: ProjectImage[] = [];
      const nextUrls: string[] = [];
      for (const image of imageList) {
        let previewUrl: string | undefined;
        try {
          const fileResponse = await fetch(`${API_URL}${image.image_url}`, { headers });
          if (fileResponse.ok) {
            const blob = await fileResponse.blob();
            previewUrl = URL.createObjectURL(blob);
            nextUrls.push(previewUrl);
          }
        } catch {
          // The image record can still be managed even if a preview is unavailable.
        }
        previews.push({ ...image, preview_url: previewUrl });
      }

      (previewUrls.current[projectId] ?? []).forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current[projectId] = nextUrls;
      setImagesByProject((current) => ({ ...current, [projectId]: previews }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load project floors and images.");
    } finally {
      setAssetLoadingId("");
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(readableError(data, "Login failed. Check your email and password."));

      const result = data as AuthResponse;
      if (result.user.role !== "architect" || !result.user.is_active) {
        throw new Error("Please use an active Architect account.");
      }
      sessionStorage.setItem(TOKEN_KEY, result.access_token);
      setProfile(result.user);
      setToken(result.access_token);
      setPassword("");
      setNotice("Signed in successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function uploadCreationImageBatch(
    projectId: string,
    images: CreationImageDraft[],
  ): Promise<{ uploaded: number; remaining: CreationImageDraft[]; error: string }> {
    let uploaded = 0;

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const formData = new FormData();
      formData.append("file", image.file);
      formData.append("category", image.category);
      formData.append("sort_order", String(image.sortOrder));
      formData.append("is_cover", String(image.isCover));
      if (image.altText.trim()) formData.append("alt_text", image.altText.trim());

      try {
        await apiRequest<ProjectImage>(`/projects/${projectId}/images`, {
          method: "POST",
          body: formData,
        });
        uploaded += 1;
      } catch (err) {
        return {
          uploaded,
          remaining: images.slice(index),
          error: err instanceof Error ? err.message : "Image upload failed.",
        };
      }
    }

    return { uploaded, remaining: [], error: "" };
  }

  function selectCreationImages(category: string, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const maxSize = 5 * 1024 * 1024;
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const invalidFile = files.find(
      (file) => file.size > maxSize || !supportedTypes.has(file.type),
    );

    if (invalidFile) {
      setError(
        invalidFile.size > maxSize
          ? `\"${invalidFile.name}\" exceeds the 5 MB image limit.`
          : `\"${invalidFile.name}\" is not a supported image. Choose JPEG, PNG, or WebP files.`,
      );
      return;
    }

    setError("");
    setCreationImages((current) => {
      const existingKeys = new Set(
        current.map((image) => `${image.file.name}|${image.file.size}|${image.file.lastModified}`),
      );
      const uniqueFiles = files.filter((file) => {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      const startIndex = current.length;
      const newImages = uniqueFiles.map((file, index) => ({
        file,
        altText: "",
        category,
        isCover: startIndex === 0 && index === 0,
        sortOrder: startIndex + index,
      }));
      return [...current, ...newImages];
    });
  }

  async function retryPendingCreationImages() {
    if (!pendingCreationUpload || uploadingId) return;
    const pending = pendingCreationUpload;
    setUploadingId(pending.projectId);
    setError("");
    setNotice("");

    try {
      const result = await uploadCreationImageBatch(pending.projectId, pending.images);
      if (result.remaining.length > 0) {
        setPendingCreationUpload({ projectId: pending.projectId, images: result.remaining });
        setError(`Upload stopped: ${result.error} ${result.remaining.length} image(s) remain queued. Retry when ready.`);
      } else {
        setPendingCreationUpload(null);
        setNotice(`All remaining images were uploaded successfully. The project is pending Company review.`);
      }
      await loadProjectAssets(pending.projectId);
      setExpandedProjectId(pending.projectId);
      setRefreshKey((current) => current + 1);
    } finally {
      setUploadingId("");
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || savingProject || pendingCreationUpload) return;
    setSavingProject(true);
    setError("");
    setNotice("");
    try {
      const isEditing = Boolean(editingProjectId);
      const savedProject = await apiRequest<Project>(isEditing ? `/projects/${editingProjectId}` : "/projects", {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(draftToPayload(draft)),
      });

      setDraft(EMPTY_PROJECT);
      setEditingProjectId(null);
      setRefreshKey((current) => current + 1);

      if (!isEditing && creationImages.length > 0) {
        const chosenImages = creationImages;
        const result = await uploadCreationImageBatch(savedProject.id, chosenImages);
        setCreationImages([]);
        setFileInputVersion((current) => current + 1);

        if (result.remaining.length > 0) {
          setPendingCreationUpload({ projectId: savedProject.id, images: result.remaining });
          setNotice(
            `Project created successfully. ${result.uploaded} of ${chosenImages.length} images uploaded; ${result.remaining.length} remain queued. The project is pending Company review.`,
          );
          setError(`Image upload stopped: ${result.error} Use â€œRetry remaining imagesâ€ below to continue without creating a duplicate project.`);
        } else {
          setPendingCreationUpload(null);
          setNotice(
            `Project created and all ${chosenImages.length} image(s) uploaded successfully. It is pending Company review and will only appear publicly after approval.`,
          );
          setExpandedProjectId(savedProject.id);
          await loadProjectAssets(savedProject.id);
        }
      } else {
        setNotice(
          isEditing
            ? "Project updated and resubmitted for Company review. It will remain unpublished until approved."
            : "Project submitted successfully. It is pending Company review and will only appear publicly after approval.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save project.");
    } finally {
      setSavingProject(false);
    }
  }

  function startEditingProject(project: Project) {
    setEditingProjectId(project.id);
    setDraft(projectToDraft(project));
    setIsProjectFormOpen(true);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelProjectEdit() {
    setEditingProjectId(null);
    setDraft(EMPTY_PROJECT);
    setIsProjectFormOpen(false);
    setError("");
    setNotice("Project edit cancelled.");
  }

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(
      `Remove "${project.title}" from your projects?\n\n` +
      "It will immediately disappear from your Architect Dashboard and the public project gallery. " +
      "Existing customer enquiries and site-visit records will be retained for Company history.\n\n" +
      "You cannot restore it from this dashboard. Continue?",
    );
    if (!confirmed || !token || deletingProjectId) return;

    setDeletingProjectId(project.id);
    setError("");
    setNotice("");

    try {
      await apiRequest<{ message: string }>(`/projects/${project.id}`, { method: "DELETE" });

      // Release any preview blobs and clear cached local state for this project.
      (previewUrls.current[project.id] ?? []).forEach((url) => URL.revokeObjectURL(url));
      delete previewUrls.current[project.id];

      setProjects((current) => current.filter((item) => item.id !== project.id));
      setImagesByProject((current) => { const next = { ...current }; delete next[project.id]; return next; });
      setCoverImageUrls((current) => { const next = { ...current }; delete next[project.id]; return next; });
      setSelectedFiles((current) => { const next = { ...current }; delete next[project.id]; return next; });
      setAltTexts((current) => { const next = { ...current }; delete next[project.id]; return next; });
      setImageCategories((current) => { const next = { ...current }; delete next[project.id]; return next; });
      setCoverSelections((current) => { const next = { ...current }; delete next[project.id]; return next; });
      setReplacementFiles((current) => {
        const next = { ...current };
        for (const image of imagesByProject[project.id] ?? []) delete next[image.id];
        return next;
      });
      setExpandedProjectId((current) => current === project.id ? null : current);

      if (editingProjectId === project.id) {
        setEditingProjectId(null);
        setDraft(EMPTY_PROJECT);
        setIsProjectFormOpen(false);
      }

      setNotice(`"${project.title}" was removed from your dashboard and the public project gallery. Company enquiry and site-visit history was retained.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove this project.");
    } finally {
      setDeletingProjectId("");
    }
  }

  async function toggleProjectAssets(projectId: string) {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      return;
    }
    setExpandedProjectId(projectId);
    await loadProjectAssets(projectId);
  }




  async function deleteProjectImage(projectId: string, image: ProjectImage) {
    if (!token || deletingImageId) return;
    const confirmed = window.confirm(`Delete this ${imageCategoryLabel(image.category).toLowerCase()} image? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingImageId(image.id);
    setError("");
    setNotice("");
    try {
      await apiRequest<void>(`/projects/mine/${projectId}/images/${image.id}`, { method: "DELETE" });
      setNotice("Image deleted. The project is pending Company review until the updated project is approved.");
      await loadProjectAssets(projectId);
      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete image.");
    } finally {
      setDeletingImageId("");
    }
  }

  async function replaceRejectedImage(projectId: string, image: ProjectImage) {
    const file = replacementFiles[image.id];
    if (!token || !file || replacingImageId) return;

    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(file.size > 5 * 1024 * 1024 ? "Replacement image must not exceed 5 MB." : "Choose a JPEG, PNG or WebP image.");
      return;
    }

    setReplacingImageId(image.id);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", image.category || "other");
      if (image.alt_text) formData.append("alt_text", image.alt_text);
      const updated = await apiRequest<ProjectImage>(
        `/projects/mine/${projectId}/images/${image.id}/replace`,
        { method: "POST", body: formData },
      );
      setReplacementFiles((current) => ({ ...current, [image.id]: null }));
      setNotice("Replacement uploaded. The image is pending Company review again.");
      await loadProjectAssets(projectId);
      setExpandedProjectId(projectId);
      setRefreshKey((current) => current + 1);
      void updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to replace rejected image.");
    } finally {
      setReplacingImageId("");
    }
  }

  async function uploadImages(projectId: string) {
    const files = selectedFiles[projectId] ?? [];
    if (!token || files.length === 0 || uploadingId) return;
    setUploadingId(projectId);
    setError("");
    setNotice("");
    let uploaded = 0;
    try {
      const existingCount = imagesByProject[projectId]?.length ?? 0;
      for (const [index, file] of files.entries()) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", imageCategories[projectId] ?? "other");
        formData.append("sort_order", String(existingCount + index));
        formData.append("is_cover", String(Boolean(coverSelections[projectId]) && index === 0));
        const altText = altTexts[projectId]?.trim();
        if (altText) formData.append("alt_text", altText);
        await apiRequest<ProjectImage>(`/projects/${projectId}/images`, {
          method: "POST",
          body: formData,
        });
        uploaded += 1;
      }
      setSelectedFiles((current) => ({ ...current, [projectId]: [] }));
      setAltTexts((current) => ({ ...current, [projectId]: "" }));
      setCoverSelections((current) => ({ ...current, [projectId]: false }));
      setFileInputVersion((current) => current + 1);
      setNotice(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded successfully. The project is pending Company review until approved.`);
      await loadProjectAssets(projectId);
      setRefreshKey((current) => current + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload images.";
      setError(uploaded > 0 ? `${message} ${uploaded} of ${files.length} image(s) were uploaded before the error.` : message);
      if (uploaded > 0) {
        await loadProjectAssets(projectId);
        setRefreshKey((current) => current + 1);
      }
    } finally {
      setUploadingId("");
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setProfile(null);
    setProjects([]);
    setImagesByProject({});
    setCoverImageUrls({});
    setExpandedProjectId(null);
    setNotice("");
    setError("");
    setPassword("");
  }

  if (!token && showSignup) {
    return (
      <ArchitectSignup
        onBack={() => {
          setShowSignup(false);
          setError("");
          setNotice("");
        }}
      />
    );
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
        <form onSubmit={login} className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-xl">
          <a href="/" className="text-xl font-black tracking-tight">CORE <span className="text-amber-700">BRICK.</span></a>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-amber-800">Architect portal</p>
          <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">Manage architectural projects and images, then submit your work for Company review.</p>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <label className={`${labelClass} mt-6`}>Architect email
            <input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
          </label>
          <label className={`${labelClass} mt-4`}>Password
            <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
          </label>
          <button type="submit" disabled={loginLoading} className={`${buttonClass} mt-6 w-full`}>
            {loginLoading ? "Signing in..." : "Sign in to Architect Portal"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSignup(true);
              setError("");
              setNotice("");
            }}
            className="mt-3 w-full rounded-lg border border-stone-300 px-4 py-3 font-semibold text-stone-800 transition hover:bg-stone-50"
          >
            Create an architect account
          </button>          <a href="/" className="mt-5 block text-center text-sm text-stone-600 hover:text-amber-800">Return to public website</a>
        </form>
      </main>
    );
  }

  const approved = profile?.architect_approval_status === "approved";
  const activeProject = projects.find((project) => project.id === editingProjectId);

  return (
    <main className="corebrick-dashboard min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8">
          <div>
            <a href="/" className="text-xl font-black tracking-tight">CORE <span className="text-amber-700">BRICK.</span></a>
            <p className="mt-1 text-sm text-stone-500">Architect project workspace</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRefreshKey((current) => current + 1);
                if (expandedProjectId) void loadProjectAssets(expandedProjectId);
              }}
              className={secondaryButtonClass}
            >
              Refresh data
            </button>
            <a href="/" className={secondaryButtonClass}>Public website</a>
            <button type="button" onClick={logout} className={secondaryButtonClass}>Sign out</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-800">Architect workspace</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-4xl">My Projects</h1>
        <p className="mt-3 max-w-3xl leading-7 text-stone-600">Enter a complete project record, manage multiple categorized images, and resubmit changes for Company review.</p>

        {profile && (
          <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Signed in as</p>
            <p className="mt-1 font-semibold">{profile.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-stone-100 px-3 py-1">Architect account</span>
              <span className={`rounded-full px-3 py-1 font-medium ${approved ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                {profile.architect_approval_status ?? "Approval status unavailable"}
              </span>
            </div>
            {!approved && <p className="mt-3 text-sm leading-6 text-amber-800">Your architect application must be approved by Core Brick before you can create projects or upload images.</p>}
          </div>
        )}

        {notice && <p role="status" className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
        {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-stone-500">Total projects</p><p className="mt-2 text-3xl font-semibold">{projects.length}</p></div>
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-stone-500">Pending review</p><p className="mt-2 text-3xl font-semibold">{projects.filter((item) => item.status === "pending_review").length}</p></div>
          <div className="dashboard-stat rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-stone-500">Approved and published</p><p className="mt-2 text-3xl font-semibold">{projects.filter((item) => item.status === "approved").length}</p></div>
        </div>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 md:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-800">{editingProjectId ? "Project update" : "New submission"}</p>
              <h2 className="mt-2 text-xl font-semibold md:text-2xl">{editingProjectId ? `Edit ${activeProject?.title ?? "project"}` : "Create a complete project"}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{editingProjectId ? "Update the details below. Changes will return the project to Company review." : "The project form is tucked away to keep your workspace clear. Open it when you are ready to submit a new project."}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsProjectFormOpen((current) => !current)}
              aria-expanded={isProjectFormOpen}
              aria-controls="project-submission-form"
              className={buttonClass}
            >
              {isProjectFormOpen ? "Hide form" : editingProjectId ? "Open edit form" : "+ Create new project"}
            </button>
          </div>

          {isProjectFormOpen && (
          <form id="project-submission-form" onSubmit={submitProject} className="mt-6 space-y-8">
            <fieldset disabled={!approved || savingProject} className="space-y-8 disabled:opacity-80">
              <section>
                <h3 className="border-b border-stone-200 pb-3 text-lg font-semibold">Basic information</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className={`${labelClass} sm:col-span-2`}>Project title *
                    <input required minLength={3} maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Property type *
                    <select required value={draft.property_type} onChange={(e) => setDraft({ ...draft, property_type: e.target.value })} className={inputClass}>
                      <option>Residential</option><option>Commercial</option><option>Mixed-use</option><option>Industrial</option><option>Other</option>
                    </select>
                  </label>
                  <label className={labelClass}>Building type
                    <select value={draft.building_type} onChange={(e) => setDraft({ ...draft, building_type: e.target.value })} className={inputClass}>
                      <option value="">Select building type</option><option value="Bungalow">Bungalow</option><option value="Row house">Row house</option><option value="Traditional">Traditional house</option><option value="Apartment">Apartment</option><option value="Villa">Villa</option><option value="Duplex">Duplex</option><option value="Commercial building">Commercial building</option><option value="Other">Other</option>
                    </select>
                  </label>
                  <label className={labelClass}>City *
                    <input required minLength={2} maxLength={100} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>State *
                    <input required minLength={2} maxLength={100} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} className={inputClass} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>Architectural style
                    <input maxLength={80} placeholder="e.g. Contemporary, Traditional, Minimalist" value={draft.architectural_style} onChange={(e) => setDraft({ ...draft, architectural_style: e.target.value })} className={inputClass} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>Project description
                    <textarea maxLength={10000} rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="border-b border-stone-200 pb-3 text-lg font-semibold">Plot and area measurements</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className={labelClass}>Overall area (sq. ft.)
                    <input type="number" min="1" step="1" value={draft.area_sqft} onChange={(e) => setDraft({ ...draft, area_sqft: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Plot area (sq. ft.)
                    <input type="number" min="1" step="1" value={draft.plot_area_sqft} onChange={(e) => setDraft({ ...draft, plot_area_sqft: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Carpet area (sq. ft.)
                    <input type="number" min="1" step="1" value={draft.carpet_area_sqft} onChange={(e) => setDraft({ ...draft, carpet_area_sqft: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Plot width (ft.)
                    <input type="number" min="0.1" step="0.1" value={draft.plot_width_ft} onChange={(e) => setDraft({ ...draft, plot_width_ft: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Plot length (ft.)
                    <input type="number" min="0.1" step="0.1" value={draft.plot_length_ft} onChange={(e) => setDraft({ ...draft, plot_length_ft: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Number of floors
                    <input type="number" min="1" max="100" step="1" value={draft.floor_count} onChange={(e) => setDraft({ ...draft, floor_count: e.target.value })} className={inputClass} />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="border-b border-stone-200 pb-3 text-lg font-semibold">Layout and orientation</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className={labelClass}>BHK
                    <select value={draft.bhk} onChange={(e) => setDraft({ ...draft, bhk: e.target.value })} className={inputClass}>
                      <option value="">Not specified</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((num) => <option key={num} value={num}>{num} BHK</option>)}
                    </select>
                  </label>
                  <label className={labelClass}>Facing
                    <select value={draft.facing} onChange={(e) => setDraft({ ...draft, facing: e.target.value })} className={inputClass}>
                      <option value="">Not specified</option><option>North</option><option>South</option><option>East</option><option>West</option><option>North-East</option><option>North-West</option><option>South-East</option><option>South-West</option>
                    </select>
                  </label>
                  <label className={labelClass}>Entrance facing
                    <select value={draft.entrance_facing} onChange={(e) => setDraft({ ...draft, entrance_facing: e.target.value })} className={inputClass}>
                      <option value="">Not specified</option><option>North</option><option>South</option><option>East</option><option>West</option><option>North-East</option><option>North-West</option><option>South-East</option><option>South-West</option>
                    </select>
                  </label>
                </div>
              </section>

              <section>
                <h3 className="border-b border-stone-200 pb-3 text-lg font-semibold">Rooms and parking</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ["bedroom_count", "Bedrooms", 100],
                    ["bathroom_count", "Bathrooms", 100],
                    ["kitchen_count", "Kitchens", 20],
                    ["balcony_count", "Balconies", 100],
                    ["parking_spaces", "Parking spaces", 100],
                  ] as const).map(([field, label, max]) => (
                    <label key={field} className={labelClass}>{label}
                      <input type="number" min="0" max={max} step="1" value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} className={inputClass} />
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="border-b border-stone-200 pb-3 text-lg font-semibold">Estimated budget and amenities</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>Estimated minimum cost (â‚¹)
                    <input type="number" min="1" step="1" value={draft.estimated_cost_min} onChange={(e) => setDraft({ ...draft, estimated_cost_min: e.target.value })} className={inputClass} />
                  </label>
                  <label className={labelClass}>Estimated maximum cost (â‚¹)
                    <input type="number" min="1" step="1" value={draft.estimated_cost_max} onChange={(e) => setDraft({ ...draft, estimated_cost_max: e.target.value })} className={inputClass} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>Amenities (comma-separated)
                    <input maxLength={3000} placeholder="e.g. parking, garden, terrace, pooja room" value={draft.amenities} onChange={(e) => setDraft({ ...draft, amenities: e.target.value })} className={inputClass} />
                  </label>
                </div>
              </section>
            </fieldset>

            {!editingProjectId && (
              <section className="rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-6">
                <div>
                  <h3 className="text-lg font-semibold">Project images</h3>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    Select multiple JPEG, PNG, or WebP images now. Each image can have its own category and description, and you can choose one cover image. Maximum 5 MB per image.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {IMAGE_CATEGORIES.map(([category, label]) => {
                    const selectedCount = creationImages.filter((image) => image.category === category).length;
                    return (
                      <div key={category} className="rounded-xl border border-stone-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-semibold text-stone-900">{label}</h4>
                          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            {selectedCount} selected
                          </span>
                        </div>
                        <p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-stone-600">
                          {IMAGE_CATEGORY_HELP[category]}
                        </p>
                        <label className={`${labelClass} mt-4 block`}>
                          Upload {label.toLowerCase()}
                          <input
                            key={`creation-images-${category}-${fileInputVersion}`}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) => {
                              selectCreationImages(category, event.currentTarget.files);
                              event.currentTarget.value = "";
                            }}
                            disabled={!approved || savingProject || Boolean(pendingCreationUpload)}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>

                {creationImages.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Selected images ({creationImages.length})</p>
                        <p className="mt-1 text-xs text-stone-500">Image type is assigned from the upload section above. Add a description and choose the main cover image below.</p>
                      </div>
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => {
                          setCreationImages([]);
                          setFileInputVersion((current) => current + 1);
                        }}
                        disabled={savingProject}
                      >
                        Clear all images
                      </button>
                    </div>

                    {creationImages.map((image, index) => (
                      <div key={`${image.file.name}-${image.file.lastModified}-${index}`} className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
                        <div className="sm:col-span-2 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-2 inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                              {imageCategoryLabel(image.category)}
                            </div>
                            <p className="break-all text-sm font-semibold">{image.file.name}</p>
                            <p className="mt-1 text-xs text-stone-500">{(image.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                          <button
                            type="button"
                            className="text-sm font-semibold text-red-700 hover:text-red-900"
                            onClick={() => setCreationImages((current) => {
                              const wasCover = current[index]?.isCover;
                              const next = current.filter((_, itemIndex) => itemIndex !== index);
                              if (wasCover && next.length > 0) next[0] = { ...next[0], isCover: true };
                              return next.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
                            })}
                            disabled={savingProject}
                          >
                            Remove
                          </button>
                        </div>

                        <label className={labelClass}>Image description (optional)
                          <input
                            maxLength={255}
                            value={image.altText}
                            onChange={(event) => setCreationImages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, altText: event.target.value } : item))}
                            disabled={savingProject}
                            placeholder="e.g. South-facing ground floor plan"
                            className={inputClass}
                          />
                        </label>

                        <label className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm font-medium sm:col-span-2">
                          <input
                            type="radio"
                            name="creation-cover-image"
                            checked={image.isCover}
                            onChange={() => setCreationImages((current) => current.map((item, itemIndex) => ({ ...item, isCover: itemIndex === index })))}
                            disabled={savingProject}
                            className="h-4 w-4 accent-amber-700"
                          />
                          Use as project cover image
                        </label>
                      </div>
                    ))}
                  </div>
                )}

                {pendingCreationUpload && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-950">Project saved; some images are still waiting to upload.</p>
                    <p className="mt-1 text-sm text-amber-900">{pendingCreationUpload.images.length} image(s) remain for project {pendingCreationUpload.projectId.slice(0, 8)}â€¦ You can retry without creating the project again.</p>
                    <button
                      type="button"
                      onClick={() => void retryPendingCreationImages()}
                      disabled={Boolean(uploadingId)}
                      className={`${buttonClass} mt-3`}
                    >
                      {uploadingId === pendingCreationUpload.projectId ? "Retrying uploadsâ€¦" : "Retry remaining images"}
                    </button>
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-6">
              <button type="submit" disabled={!approved || savingProject || Boolean(pendingCreationUpload)} className={buttonClass}>
                {savingProject ? (creationImages.length > 0 && !editingProjectId ? "Creating project and uploading imagesâ€¦" : "Saving project...") : editingProjectId ? "Save and resubmit for review" : "Create project and submit for review"}
              </button>
              {editingProjectId && <button type="button" onClick={cancelProjectEdit} className={secondaryButtonClass}>Cancel edit</button>}
              {!approved && <p className="self-center text-sm text-amber-800">Project creation and editing unlock after Company approval of your Architect account.</p>}
            </div>
          </form>
          )}
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-2xl font-semibold">My submitted projects</h2><p className="mt-2 text-sm text-stone-600">Only your own projects are listed. Updates and new images require Company review before publication.</p></div>
            <span className="text-sm text-stone-500">{projects.length} total</span>
          </div>

          {projectsLoading && <p className="mt-6 text-stone-600">Loading projects...</p>}
          {!projectsLoading && projects.length === 0 && !error && <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">You haven't submitted any projects yet.</div>}

          <div className="mt-5 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => {
              const images = imagesByProject[project.id] ?? [];
              const isExpanded = expandedProjectId === project.id;
              const coverImageUrl = coverImageUrls[project.id];
              return (
                <article
                  key={project.id}
                  className={`min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-5 ${isExpanded ? "sm:col-span-2 lg:col-span-3 xl:col-span-4" : ""}`}
                >
                  <div className="-mx-4 -mt-4 mb-4 overflow-hidden rounded-t-2xl bg-stone-100 md:-mx-5 md:-mt-5">
                    {coverImageUrl ? (
                      <img
                        src={coverImageUrl}
                        alt={`${project.title} cover`}
                        loading="lazy"
                        className="h-40 w-full object-cover transition duration-300 hover:scale-[1.02] sm:h-44"
                      />
                    ) : (
                      <div className="flex h-40 flex-col items-center justify-center gap-2 bg-gradient-to-br from-stone-100 to-amber-50 text-stone-400 sm:h-44">
                        <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-10 w-10" stroke="currentColor" strokeWidth="1.5">
                          <path d="M7 21.5 24 8l17 13.5V40H7V21.5Z" strokeLinejoin="round" />
                          <path d="M18 40V27h12v13M13 24h5m12 0h5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-xs font-medium">No project image uploaded</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 break-words text-base font-bold leading-snug text-stone-900">{project.title}</h3>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${project.status === "approved" ? "bg-green-50 text-green-800" : project.status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                        {STATUS_LABELS[project.status] ?? project.status}
                      </span>
                    </div>
                    <p className="text-sm text-stone-500">{project.property_type} Â· {project.city}, {project.state}</p>
                    <div className="flex min-h-6 flex-wrap gap-1.5 text-[11px] text-stone-600">
                      {project.building_type && <span className="rounded-full bg-stone-100 px-2.5 py-1">{project.building_type}</span>}
                      {project.bhk && <span className="rounded-full bg-stone-100 px-2.5 py-1">{project.bhk} BHK</span>}
                      {project.floor_count && <span className="rounded-full bg-stone-100 px-2.5 py-1">{project.floor_count} floors</span>}
                      {project.area_sqft && <span className="rounded-full bg-stone-100 px-2.5 py-1">{Number(project.area_sqft).toLocaleString()} sq. ft.</span>}
                    </div>
                    {project.description && (
                      <p
                        className="text-sm leading-5 text-stone-600"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {project.description}
                      </p>
                    )}
                    <p className="text-[11px] text-stone-400">Updated {new Date(project.updated_at).toLocaleDateString()}</p>

                    <div className="mt-1 grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => startEditingProject(project)}
                        disabled={!approved}
                        className={`${secondaryButtonClass} w-full justify-center text-xs`}
                      >
                        Edit details
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleProjectAssets(project.id)}
                        className={`${buttonClass} w-full justify-center text-xs`}
                      >
                        {isExpanded ? "Hide image manager" : "Manage project images"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteProject(project)}
                        disabled={!approved || deletingProjectId === project.id || savingProject || uploadingId === project.id || assetLoadingId === project.id}
                        className="inline-flex w-full items-center justify-center rounded-full border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingProjectId === project.id ? "Removing projectâ€¦" : "Delete project"}
                      </button>
                    </div>
                  </div>

                  {project.status === "rejected" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This project was rejected or needs changes. Edit the details, upload updated images, and resubmit it for review.</p>}

                  {isExpanded && (
                    <div className="mt-7 space-y-8 border-t border-stone-200 pt-6">
                      {assetLoadingId === project.id && <p className="text-sm text-stone-500">Loading project images...</p>}

                      <section>
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div><h4 className="text-lg font-semibold">Project image gallery</h4><p className="mt-1 text-sm text-stone-500">Upload multiple drawings or photos. Maximum 5 MB each; JPEG, PNG or WebP.</p></div>
                          <span className="text-sm text-stone-500">{images.length} uploaded image(s)</span>
                        </div>

                        {images.length > 0 ? (
                          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {images.map((image) => {
                              const categoryLabel = IMAGE_CATEGORIES.find(([value]) => value === image.category)?.[1] ?? image.category;
                              return (
                                <article key={image.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                                  {image.preview_url ? <img src={image.preview_url} alt={image.alt_text ?? project.title} className="h-44 w-full bg-stone-100 object-cover" loading="lazy" /> : <div className="flex h-44 items-center justify-center bg-stone-100 text-sm text-stone-400">Preview unavailable</div>}
                                  <div className="space-y-1 p-3 text-sm">
                                    <p className="font-semibold">{categoryLabel}{image.is_cover ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Cover</span> : null}</p>
                                    <p className="text-stone-500">Project image</p>
                                    {image.alt_text && <p className="text-stone-600">{image.alt_text}</p>}
                                    <div className="mt-2">
                                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${image.review_status === "approved" ? "bg-green-50 text-green-800" : image.review_status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                                        Image: {(image.review_status || "pending_review").replaceAll("_", " ")}
                                      </span>
                                    </div>
                                    {image.review_status === "rejected" && image.review_notes && (
                                      <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">
                                        <strong>Company feedback:</strong> {image.review_notes}
                                      </p>
                                    )}
                                    {(
                                      <div className="mt-3 rounded-lg bg-stone-50 p-3">
                                        <label className="block text-xs font-semibold text-stone-700">Change image
                                          <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={(event) => setReplacementFiles((current) => ({ ...current, [image.id]: event.target.files?.[0] ?? null }))}
                                            disabled={!approved || replacingImageId === image.id}
                                            className="mt-2 block w-full text-xs"
                                          />
                                        </label>
                                        {replacementFiles[image.id] && <p className="mt-2 break-all text-xs text-stone-500">Selected: {replacementFiles[image.id]?.name}</p>}
                                        <button
                                          type="button"
                                          onClick={() => void replaceRejectedImage(project.id, image)}
                                          disabled={!approved || !replacementFiles[image.id] || replacingImageId === image.id}
                                          className="mt-3 rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {replacingImageId === image.id ? "Replacing..." : "Save changed image for review"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void deleteProjectImage(project.id, image)}
                                          disabled={!approved || deletingImageId === image.id || replacingImageId === image.id}
                                          className="ml-2 mt-3 rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {deletingImageId === image.id ? "Deleting..." : "Delete image"}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">No images uploaded yet. Add floor plans, 2D drawings, 3D elevations, interior photos, or exterior views below.</p>}

                        <div className="mt-5 rounded-xl bg-stone-50 p-4">
                          <h5 className="font-semibold">Upload images</h5>
                          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <label className={labelClass}>Image files *
                              <input key={`${project.id}-${fileInputVersion}`} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setSelectedFiles((current) => ({ ...current, [project.id]: Array.from(e.target.files ?? []) }))} disabled={!approved || uploadingId === project.id} className={inputClass} />
                              <span className="mt-1 block text-xs font-normal text-stone-500">Select more than one file to upload a batch.</span>
                            </label>
                            <label className={labelClass}>Category
                              <select value={imageCategories[project.id] ?? "other"} onChange={(e) => setImageCategories((current) => ({ ...current, [project.id]: e.target.value }))} disabled={!approved || uploadingId === project.id} className={inputClass}>
                                {IMAGE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                            <label className={`${labelClass} sm:col-span-2 lg:col-span-2`}>Image description (optional)
                              <input maxLength={255} value={altTexts[project.id] ?? ""} onChange={(e) => setAltTexts((current) => ({ ...current, [project.id]: e.target.value }))} disabled={!approved || uploadingId === project.id} placeholder="e.g. South-facing ground floor plan" className={inputClass} />
                            </label>
                            <label className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm font-medium">
                              <input type="checkbox" checked={Boolean(coverSelections[project.id])} onChange={(e) => setCoverSelections((current) => ({ ...current, [project.id]: e.target.checked }))} disabled={!approved || uploadingId === project.id} className="h-4 w-4 accent-amber-700" />
                              Set the first uploaded file as project cover
                            </label>
                          </div>
                          {(selectedFiles[project.id]?.length ?? 0) > 0 && <p className="mt-3 text-sm text-stone-600">Selected: {(selectedFiles[project.id] ?? []).map((file) => file.name).join(", ")}</p>}
                          <button type="button" onClick={() => void uploadImages(project.id)} disabled={!approved || !(selectedFiles[project.id]?.length) || uploadingId === project.id} className={`${buttonClass} mt-4`}>
                            {uploadingId === project.id ? "Uploading images..." : `Upload ${selectedFiles[project.id]?.length ?? 0} image(s)`}
                          </button>
                          {!approved && <p className="mt-3 text-sm text-amber-800">Only approved Architect accounts can add, change, or delete images.</p>}
                          <p className="mt-3 text-xs leading-5 text-stone-500">Adding, changing, or deleting an image puts the project into Company review. Public visitors only see approved projects and their images.</p>
                        </div>
                      </section>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

export default ArchitectDashboard;
