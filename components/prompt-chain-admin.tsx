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

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
      <header className="mb-4 panel p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold md:text-3xl">Humor Flavor Prompt Chains</h1>
            <p className="text-muted">Create, edit, reorder, and test flavor steps against an image test set.</p>
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

      <p className="mb-4 min-h-6 text-sm text-muted">{statusMessage}</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="panel p-4 md:p-5">
          <h2 className="text-xl font-semibold">Humor Flavors</h2>
          <form className="mt-4 space-y-2" onSubmit={createFlavor}>
            <input
              className="soft-input"
              placeholder="Flavor name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
            />
            <textarea
              className="soft-input min-h-20"
              placeholder="Flavor description"
              value={descriptionInput}
              onChange={(event) => setDescriptionInput(event.target.value)}
            />
            <button className="primary-btn" disabled={isBusy} type="submit">
              Create Flavor
            </button>
          </form>

          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {flavors.map((flavor) => (
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
                <div className="text-sm text-muted">{flavor.description ?? "No description"}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-4 md:p-5">
          <h2 className="text-xl font-semibold">Flavor Details</h2>
          {!selectedFlavorId ? (
            <p className="mt-4 text-muted">Select a flavor to edit or delete.</p>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                <input
                  className="soft-input"
                  value={flavors.find((f) => f.id === selectedFlavorId)?.name ?? ""}
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
                <textarea
                  className="soft-input min-h-20"
                  value={flavors.find((f) => f.id === selectedFlavorId)?.description ?? ""}
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
              <div className="mt-3 flex gap-2">
                <button className="primary-btn" disabled={isBusy} onClick={updateFlavor} type="button">
                  Update Flavor
                </button>
                <button className="secondary-btn" disabled={isBusy} onClick={duplicateFlavor} type="button">
                  Duplicate Flavor
                </button>
                <button className="danger-btn" disabled={isBusy} onClick={deleteFlavor} type="button">
                  Delete Flavor
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel p-4 md:p-5">
          <h2 className="text-xl font-semibold">Flavor Steps</h2>
          {!selectedFlavorId ? (
            <p className="mt-4 text-muted">Select a flavor first.</p>
          ) : (
            <>
              <form className="mt-4 flex gap-2" onSubmit={createStep}>
                <input
                  className="soft-input"
                  value={stepInput}
                  placeholder="New step instruction"
                  onChange={(event) => setStepInput(event.target.value)}
                />
                <button className="primary-btn" disabled={isBusy} type="submit">
                  Add
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {steps.map((step, idx) => (
                  <div className="rounded-xl border border-black/10 p-3" key={step.id}>
                    <div className="mb-2 text-sm font-semibold">Step {step.step_order}</div>
                    <textarea
                      className="soft-input min-h-20"
                      value={stepEdits[step.id] ?? ""}
                      onChange={(event) =>
                        setStepEdits((prev) => ({
                          ...prev,
                          [step.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="secondary-btn"
                        disabled={isBusy || idx === 0}
                        onClick={() => reorderStep(step.id, "up")}
                        type="button"
                      >
                        Move Up
                      </button>
                      <button
                        className="secondary-btn"
                        disabled={isBusy || idx === steps.length - 1}
                        onClick={() => reorderStep(step.id, "down")}
                        type="button"
                      >
                        Move Down
                      </button>
                      <button
                        className="primary-btn"
                        disabled={isBusy}
                        onClick={() => updateStep(step.id)}
                        type="button"
                      >
                        Save Step
                      </button>
                      <button
                        className="danger-btn"
                        disabled={isBusy}
                        onClick={() => deleteStep(step.id)}
                        type="button"
                      >
                        Delete Step
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel p-4 md:p-5 xl:col-span-3">
          <h2 className="text-xl font-semibold">Test Flavor With Image Set</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="secondary-btn" disabled={isBusy} onClick={loadTestImages} type="button">
              Load Test Images
            </button>
            <button className="primary-btn" disabled={isBusy || !selectedFlavorId} onClick={runFlavorTest} type="button">
              Generate Captions
            </button>
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

          <div className="mt-6 space-y-3">
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
                          <p className="mt-2 text-xs text-muted">{image.image_description}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-muted">
                        Image ID: {result.imageId}
                      </h3>
                      {result.error ? (
                        <p className="mt-2 text-danger">{result.error}</p>
                      ) : result.captions.length > 0 ? (
                        <ul className="mt-2 list-disc pl-5 text-sm">
                          {result.captions.map((caption, index) => (
                            <li key={`${result.imageId}-${index}`}>{caption}</li>
                          ))}
                        </ul>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-danger">
                            No captions parsed from the response. Raw output below:
                          </p>
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-black/20 bg-black/40 p-3 text-xs text-white">
                            {result.raw === null || result.raw === undefined
                              ? "(empty response)"
                              : JSON.stringify(result.raw, null, 2)}
                          </pre>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
