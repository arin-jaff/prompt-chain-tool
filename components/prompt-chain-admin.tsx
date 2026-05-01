"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HumorFlavor, HumorFlavorStep } from "@/lib/types";
import { FormEvent, useEffect, useState } from "react";

type MeResponse = {
  userId: string;
  profile: {
    is_superadmin: boolean;
    is_matrix_admin: boolean;
  };
  isAdmin: boolean;
};

type FlavorDetailResponse = {
  flavor: HumorFlavor;
  steps: HumorFlavorStep[];
};

type ImageRecord = {
  id: string;
  url: string;
  image_description: string | null;
};

type TestResult = {
  imageId: string;
  captions: string[];
  error: string | null;
  raw: unknown;
};

const THEME_KEY = "prompt-chain-theme";

type ThemeMode = "light" | "dark" | "system";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
    return;
  }
  root.setAttribute("data-theme", mode);
}

export function PromptChainAdmin() {
  const [authState, setAuthState] = useState<"loading" | "unauthorized" | "ready">("loading");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState<string>("");
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [stepInput, setStepInput] = useState("");
  const [stepEdits, setStepEdits] = useState<Record<string, string>>({});
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);
  const [flavorSearch, setFlavorSearch] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    const mode = stored ?? "system";
    setThemeMode(mode);
    applyTheme(mode);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (mode === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  async function bootstrap() {
    const meResponse = await fetch("/api/auth/me", { cache: "no-store" });

    if (meResponse.status === 401 || meResponse.status === 403) {
      setAuthState("unauthorized");
      return;
    }

    if (!meResponse.ok) {
      setAuthState("unauthorized");
      return;
    }

    const me = (await meResponse.json()) as MeResponse;
    if (!me.isAdmin) {
      setAuthState("unauthorized");
      return;
    }

    setAuthState("ready");
    await refreshFlavors();
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshFlavors(selectFlavorId?: string) {
    const response = await fetch("/api/flavors", { cache: "no-store" });
    if (!response.ok) {
      setStatusMessage("Unable to load humor flavors.");
      return;
    }

    const data = (await response.json()) as { flavors: HumorFlavor[] };
    setFlavors(data.flavors ?? []);

    const nextSelected =
      selectFlavorId ??
      (data.flavors.some((f) => f.id === selectedFlavorId)
        ? selectedFlavorId
        : (data.flavors[0]?.id ?? ""));

    setSelectedFlavorId(nextSelected);
    if (nextSelected) {
      await refreshFlavorDetail(nextSelected);
    } else {
      setSteps([]);
    }
  }

  async function refreshFlavorDetail(flavorId: string) {
    const response = await fetch(`/api/flavors/${flavorId}`, { cache: "no-store" });
    if (!response.ok) {
      setStatusMessage("Unable to load flavor steps.");
      return;
    }

    const data = (await response.json()) as FlavorDetailResponse;
    setSteps(data.steps ?? []);
    setStepEdits(
      (data.steps ?? []).reduce<Record<string, string>>((acc, step) => {
        acc[step.id] = step.instruction;
        return acc;
      }, {}),
    );
  }

  function onThemeChange(nextMode: ThemeMode) {
    setThemeMode(nextMode);
    localStorage.setItem(THEME_KEY, nextMode);
    applyTheme(nextMode);
  }

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setAuthState("unauthorized");
  }

  async function createFlavor(event: FormEvent) {
    event.preventDefault();
    if (!nameInput.trim()) {
      setStatusMessage("Flavor name is required.");
      return;
    }

    setIsBusy(true);
    setStatusMessage("Creating flavor...");

    const response = await fetch("/api/flavors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameInput,
        description: descriptionInput,
      }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to create flavor" }));
      setStatusMessage(data.error ?? "Failed to create flavor");
      return;
    }

    const data = (await response.json()) as { flavor: HumorFlavor };
    setNameInput("");
    setDescriptionInput("");
    await refreshFlavors(data.flavor.id);
    setStatusMessage("Flavor created.");
  }

  async function updateFlavor() {
    if (!selectedFlavorId) {
      return;
    }

    const selectedFlavor = flavors.find((flavor) => flavor.id === selectedFlavorId);
    if (!selectedFlavor) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Updating flavor...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedFlavor.name,
        description: selectedFlavor.description,
      }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to update flavor" }));
      setStatusMessage(data.error ?? "Failed to update flavor");
      return;
    }

    await refreshFlavors(selectedFlavorId);
    setStatusMessage("Flavor updated.");
  }

  async function duplicateFlavor() {
    if (!selectedFlavorId) {
      return;
    }

    const source = flavors.find((f) => f.id === selectedFlavorId);
    const proposed = window.prompt(
      "Name for the duplicated flavor (leave blank for an auto-generated name):",
      source ? `${source.name} (Copy)` : "",
    );
    if (proposed === null) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Duplicating flavor...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: proposed.trim() }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to duplicate flavor" }));
      setStatusMessage(data.error ?? "Failed to duplicate flavor");
      return;
    }

    const data = (await response.json()) as { flavor: HumorFlavor };
    await refreshFlavors(data.flavor.id);
    setStatusMessage(`Flavor duplicated as "${data.flavor.name}".`);
  }

  async function configurePipeline() {
    if (!selectedFlavorId) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Configuring pipeline (input/output types, system prompts, chaining)...");

    const response = await fetch(
      `/api/flavors/${selectedFlavorId}/configure-pipeline`,
      { method: "POST" },
    );

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to configure pipeline" }));
      setStatusMessage(data.error ?? "Failed to configure pipeline");
      return;
    }

    const data = (await response.json()) as { stepCount: number };
    await refreshFlavorDetail(selectedFlavorId);
    setStatusMessage(
      `Pipeline configured: ${data.stepCount} step(s) updated. You can now generate captions.`,
    );
  }

  async function deleteFlavor() {
    if (!selectedFlavorId) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Deleting flavor...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}`, {
      method: "DELETE",
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to delete flavor" }));
      setStatusMessage(data.error ?? "Failed to delete flavor");
      return;
    }

    await refreshFlavors();
    setStatusMessage("Flavor deleted.");
  }

  async function createStep(event: FormEvent) {
    event.preventDefault();
    if (!selectedFlavorId || !stepInput.trim()) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Adding step...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: stepInput }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to create step" }));
      setStatusMessage(data.error ?? "Failed to create step");
      return;
    }

    setStepInput("");
    await refreshFlavorDetail(selectedFlavorId);
    setStatusMessage("Step created.");
  }

  async function updateStep(stepId: string) {
    if (!selectedFlavorId) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Updating step...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: stepEdits[stepId] ?? "" }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to update step" }));
      setStatusMessage(data.error ?? "Failed to update step");
      return;
    }

    await refreshFlavorDetail(selectedFlavorId);
    setStatusMessage("Step updated.");
  }

  async function deleteStep(stepId: string) {
    if (!selectedFlavorId) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Deleting step...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}/steps/${stepId}`, {
      method: "DELETE",
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to delete step" }));
      setStatusMessage(data.error ?? "Failed to delete step");
      return;
    }

    await refreshFlavorDetail(selectedFlavorId);
    setStatusMessage("Step deleted.");
  }

  async function reorderStep(stepId: string, direction: "up" | "down") {
    const index = steps.findIndex((step) => step.id === stepId);
    if (index < 0) {
      return;
    }

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= steps.length) {
      return;
    }

    const next = [...steps];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    const orderedStepIds = next.map((step) => step.id);

    if (!selectedFlavorId) {
      return;
    }

    setIsBusy(true);
    setStatusMessage("Reordering steps...");

    const response = await fetch(`/api/flavors/${selectedFlavorId}/steps/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedStepIds }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to reorder steps" }));
      setStatusMessage(data.error ?? "Failed to reorder steps");
      return;
    }

    await refreshFlavorDetail(selectedFlavorId);
    setStatusMessage("Steps reordered.");
  }

  async function loadTestImages() {
    setIsBusy(true);
    setStatusMessage("Loading image test set...");

    const response = await fetch("/api/test-images", { cache: "no-store" });
    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to load test images" }));
      setStatusMessage(data.error ?? "Failed to load test images");
      return;
    }

    const data = (await response.json()) as { images: ImageRecord[] };
    setImages(data.images ?? []);
    setSelectedImageIds((data.images ?? []).slice(0, 3).map((img) => img.id));
    setStatusMessage("Loaded image test set.");
  }

  async function runFlavorTest() {
    if (!selectedFlavorId || selectedImageIds.length === 0) {
      setStatusMessage("Pick a flavor and at least one image.");
      return;
    }

    setIsBusy(true);
    setStatusMessage("Generating captions from REST API...");

    const response = await fetch("/api/test-flavor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flavorId: selectedFlavorId,
        imageIds: selectedImageIds,
      }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to run flavor test" }));
      setStatusMessage(data.error ?? "Failed to run flavor test");
      return;
    }

    const data = (await response.json()) as { results: TestResult[] };
    setTestResults(data.results ?? []);
    setStatusMessage("Caption generation complete.");
  }

  if (authState === "loading") {
    return <div className="p-8">Loading prompt-chain tool...</div>;
  }

  if (authState === "unauthorized") {
    return (
      <div className="mx-auto w-full max-w-xl p-8">
        <div className="panel p-6">
          <h1 className="text-2xl font-semibold">Prompt Chain Tool</h1>
          <p className="mt-3 text-muted">
            Access requires profiles.is_superadmin = TRUE or profiles.is_matrix_admin = TRUE.
          </p>
          <button className="primary-btn mt-5" onClick={signInWithGoogle}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const statusKind = ((): "success" | "error" | "info" => {
    const m = statusMessage.toLowerCase();
    if (!m) return "info";
    if (/(fail|unable|error|missing|not found|cannot|denied)/.test(m)) return "error";
    if (/(complete|created|deleted|updated|configured|reordered|saved|duplicated|loaded)/.test(m))
      return "success";
    return "info";
  })();
  const statusBg =
    statusKind === "error"
      ? "rgba(255,107,97,0.12)"
      : statusKind === "success"
        ? "rgba(255,193,69,0.12)"
        : "rgba(255,255,255,0.04)";
  const statusBorder =
    statusKind === "error"
      ? "var(--danger)"
      : statusKind === "success"
        ? "var(--accent-2)"
        : "color-mix(in oklab, var(--foreground) 18%, transparent)";

  const selectedFlavor = flavors.find((f) => f.id === selectedFlavorId);
  const trimmedSearch = flavorSearch.trim().toLowerCase();
  const filteredFlavors = trimmedSearch
    ? flavors.filter(
        (f) =>
          f.name.toLowerCase().includes(trimmedSearch) ||
          (f.description ?? "").toLowerCase().includes(trimmedSearch),
      )
    : flavors;
  const totalImages = images.length;
  const selectedImageCount = selectedImageIds.length;

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
      <header className="mb-4 panel p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold md:text-3xl">Humor Flavor Prompt Chains</h1>
            <p className="text-muted">
              Build a multi-step prompt chain, then test it against real images to generate captions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium">Theme</label>
            <select
              className="soft-input w-auto"
              value={themeMode}
              onChange={(event) => onThemeChange(event.target.value as ThemeMode)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
            <button className="secondary-btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {statusMessage ? (
        <div
          className="mb-4 rounded-xl border px-4 py-2 text-sm"
          style={{ background: statusBg, borderColor: statusBorder }}
          role="status"
        >
          {statusMessage}
        </div>
      ) : (
        <div className="mb-4 min-h-6" />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="panel p-4 md:p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Humor Flavors</h2>
            <span className="text-xs text-muted">{flavors.length} total</span>
          </div>
          <p className="mt-1 text-xs text-muted">Click a flavor below to edit it.</p>

          <form className="mt-4 space-y-2" onSubmit={createFlavor}>
            <input
              className="soft-input"
              placeholder="Flavor name (e.g. deep-fried-memes)"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
            />
            <textarea
              className="soft-input min-h-20"
              placeholder="Short description of this flavor's vibe"
              value={descriptionInput}
              onChange={(event) => setDescriptionInput(event.target.value)}
            />
            <button className="primary-btn w-full" disabled={isBusy} type="submit">
              + Create Flavor
            </button>
          </form>

          <div className="mt-4 flex items-center gap-2">
            <input
              className="soft-input"
              placeholder="Search flavors by name or description..."
              value={flavorSearch}
              onChange={(event) => setFlavorSearch(event.target.value)}
            />
            {flavorSearch ? (
              <button
                className="rounded-md border border-black/10 px-2 py-1 text-xs"
                onClick={() => setFlavorSearch("")}
                title="Clear search"
                type="button"
              >
                ✕
              </button>
            ) : null}
          </div>
          {trimmedSearch ? (
            <p className="mt-1 text-xs text-muted">
              {filteredFlavors.length} of {flavors.length} match &ldquo;{flavorSearch}&rdquo;
            </p>
          ) : null}

          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
            {flavors.length === 0 ? (
              <p className="text-sm text-muted">No flavors yet. Create one above.</p>
            ) : filteredFlavors.length === 0 ? (
              <p className="text-sm text-muted">No flavors match your search.</p>
            ) : (
              filteredFlavors.map((flavor) => (
                <button
                  key={flavor.id}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selectedFlavorId === flavor.id
                      ? "border-accent bg-accent/10"
                      : "border-black/10 hover:border-black/30"
                  }`}
                  onClick={async () => {
                    setSelectedFlavorId(flavor.id);
                    await refreshFlavorDetail(flavor.id);
                  }}
                  type="button"
                >
                  <div className="font-medium">{flavor.name}</div>
                  <div className="line-clamp-2 text-sm text-muted">
                    {flavor.description ?? "No description"}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel p-4 md:p-5">
          <h2 className="text-xl font-semibold">Flavor Details</h2>
          {!selectedFlavorId ? (
            <p className="mt-4 text-muted">Select a flavor on the left to edit it.</p>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-medium text-muted">Name</label>
                <input
                  className="soft-input"
                  value={selectedFlavor?.name ?? ""}
                  onChange={(event) => {
                    setFlavors((prev) =>
                      prev.map((flavor) =>
                        flavor.id === selectedFlavorId
                          ? { ...flavor, name: event.target.value }
                          : flavor,
                      ),
                    );
                  }}
                />
                <label className="block pt-2 text-xs font-medium text-muted">Description</label>
                <textarea
                  className="soft-input min-h-40"
                  value={selectedFlavor?.description ?? ""}
                  onChange={(event) => {
                    setFlavors((prev) =>
                      prev.map((flavor) =>
                        flavor.id === selectedFlavorId
                          ? { ...flavor, description: event.target.value }
                          : flavor,
                      ),
                    );
                  }}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div>
                  <button className="primary-btn w-full" disabled={isBusy} onClick={updateFlavor} type="button">
                    Update Flavor
                  </button>
                  <p className="mt-1 text-xs text-muted">Save name and description changes.</p>
                </div>
                <div>
                  <button
                    className="secondary-btn w-full"
                    disabled={isBusy}
                    onClick={configurePipeline}
                    type="button"
                  >
                    Configure Pipeline
                  </button>
                  <p className="mt-1 text-xs text-muted">
                    Auto-fix step types & chaining so captions can generate.
                  </p>
                </div>
                <div>
                  <button
                    className="secondary-btn w-full"
                    disabled={isBusy}
                    onClick={duplicateFlavor}
                    type="button"
                  >
                    Duplicate Flavor
                  </button>
                  <p className="mt-1 text-xs text-muted">Make a copy with a new name.</p>
                </div>
                <div>
                  <button className="danger-btn w-full" disabled={isBusy} onClick={deleteFlavor} type="button">
                    Delete Flavor
                  </button>
                  <p className="mt-1 text-xs text-muted">Permanently remove this flavor and its steps.</p>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="panel p-4 md:p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Flavor Steps</h2>
            {selectedFlavorId ? (
              <span className="text-xs text-muted">{steps.length} step(s)</span>
            ) : null}
          </div>
          {!selectedFlavorId ? (
            <p className="mt-4 text-muted">Select a flavor to manage its steps.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                First step receives the image. Later steps receive the previous step&apos;s output. After
                adding/removing steps, click <span className="font-semibold">Configure Pipeline</span>.
              </p>

              <form className="mt-4 space-y-2" onSubmit={createStep}>
                <textarea
                  className="soft-input min-h-20"
                  value={stepInput}
                  placeholder="New step instruction (what should this step do?)"
                  onChange={(event) => setStepInput(event.target.value)}
                />
                <button className="primary-btn w-full" disabled={isBusy} type="submit">
                  + Add Step
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {steps.map((step, idx) => (
                  <div className="rounded-xl border border-black/10 p-3" key={step.id}>
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          background: "color-mix(in oklab, var(--accent) 18%, transparent)",
                          color: "var(--accent)",
                        }}
                      >
                        Step {step.step_order}
                      </span>
                      <div className="flex gap-1">
                        <button
                          className="rounded-md border border-black/10 px-2 py-1 text-xs"
                          disabled={isBusy || idx === 0}
                          onClick={() => reorderStep(step.id, "up")}
                          title="Move up"
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          className="rounded-md border border-black/10 px-2 py-1 text-xs"
                          disabled={isBusy || idx === steps.length - 1}
                          onClick={() => reorderStep(step.id, "down")}
                          title="Move down"
                          type="button"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="soft-input min-h-24"
                      value={stepEdits[step.id] ?? ""}
                      onChange={(event) =>
                        setStepEdits((prev) => ({
                          ...prev,
                          [step.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        className="primary-btn flex-1"
                        disabled={isBusy}
                        onClick={() => updateStep(step.id)}
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="danger-btn"
                        disabled={isBusy}
                        onClick={() => deleteStep(step.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel p-4 md:p-5 xl:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Test Flavor With Image Set</h2>
            {totalImages > 0 ? (
              <span className="text-xs text-muted">
                {selectedImageCount} of {totalImages} selected
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">
            Load images, click thumbnails to select, then generate. Selected images get an orange border.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <div>
              <button className="secondary-btn" disabled={isBusy} onClick={loadTestImages} type="button">
                Load Test Images
              </button>
              <p className="mt-1 text-xs text-muted">Pulls latest 20 public images.</p>
            </div>
            <div>
              <button
                className="primary-btn"
                disabled={isBusy || !selectedFlavorId || selectedImageCount === 0}
                onClick={runFlavorTest}
                type="button"
              >
                Generate Captions
              </button>
              <p className="mt-1 text-xs text-muted">Runs the prompt chain on each selected image.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {images.map((image) => {
              const selected = selectedImageIds.includes(image.id);
              return (
                <button
                  className={`rounded-xl border p-2 text-left transition ${
                    selected ? "border-accent bg-accent/10" : "border-black/10"
                  }`}
                  key={image.id}
                  onClick={() => {
                    setSelectedImageIds((prev) => {
                      if (prev.includes(image.id)) {
                        return prev.filter((id) => id !== image.id);
                      }
                      return [...prev, image.id];
                    });
                  }}
                  type="button"
                >
                  <img alt="test" className="h-24 w-full rounded-lg object-cover" src={image.url} />
                  <p className="mt-2 line-clamp-2 text-xs text-muted">
                    {image.image_description ?? image.id}
                  </p>
                </button>
              );
            })}
          </div>

          {testResults.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold">
                Results <span className="text-sm font-normal text-muted">({testResults.length})</span>
              </h3>
              <div className="space-y-3">
                {testResults.map((result) => {
                  const image = images.find((img) => img.id === result.imageId);
                  return (
                    <div className="rounded-xl border border-black/10 p-4" key={result.imageId}>
                      <div className="flex flex-col gap-4 md:flex-row">
                        {image ? (
                          <div className="md:w-64 md:shrink-0">
                            <img
                              alt={image.image_description ?? "test image"}
                              className="h-48 w-full rounded-lg object-cover md:h-40"
                              src={image.url}
                            />
                            {image.image_description ? (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-muted hover:underline">
                                  Image description
                                </summary>
                                <p className="mt-1 text-xs text-muted">{image.image_description}</p>
                              </details>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="flex-1">
                          {result.captions.length > 0 ? (
                            <>
                              <h3 className="text-sm font-semibold">
                                Generated Captions{" "}
                                <span className="font-normal text-muted">({result.captions.length})</span>
                              </h3>
                              <ol className="mt-2 space-y-2 text-sm">
                                {result.captions.map((caption, index) => (
                                  <li
                                    className="flex items-start gap-2 rounded-lg border border-black/5 px-3 py-2"
                                    key={`${result.imageId}-${index}`}
                                  >
                                    <span className="text-xs text-muted">{index + 1}.</span>
                                    <span className="flex-1">{caption}</span>
                                    <button
                                      className="rounded-md border border-black/10 px-2 py-0.5 text-xs hover:border-accent"
                                      onClick={() => navigator.clipboard?.writeText(caption)}
                                      title="Copy caption"
                                      type="button"
                                    >
                                      Copy
                                    </button>
                                  </li>
                                ))}
                              </ol>
                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs text-muted hover:underline">
                                  Image ID
                                </summary>
                                <p className="mt-1 break-all text-xs text-muted">{result.imageId}</p>
                              </details>
                            </>
                          ) : (
                            <>
                              <h3 className="text-sm font-semibold text-danger">
                                No captions returned
                              </h3>
                              {result.error ? (
                                <p className="mt-2 text-sm text-danger">{result.error}</p>
                              ) : (
                                <p className="mt-2 text-sm text-muted">
                                  The API responded without any captions. Try clicking{" "}
                                  <span className="font-semibold">Configure Pipeline</span> on the
                                  flavor and re-running.
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
