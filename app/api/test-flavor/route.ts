import { requireAdmin } from "@/lib/auth";
import { API_BASE_URL, TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) {
    return error;
  }

  const body = await request.json();
  const flavorId = String(body?.flavorId ?? "").trim();
  const imageIds = Array.isArray(body?.imageIds)
    ? body.imageIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  if (!flavorId || !imageIds.length) {
    return NextResponse.json({ error: "flavorId and imageIds are required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: "No active session token" }, { status: 401 });
  }

  const { data: flavor, error: flavorError } = await supabase
    .from(TABLES.flavors)
    .select("id, name")
    .eq("id", flavorId)
    .single();

  if (flavorError || !flavor) {
    return NextResponse.json({ error: "Flavor not found" }, { status: 404 });
  }

  const { data: steps, error: stepError } = await supabase
    .from(TABLES.flavorSteps)
    .select("id, step_order, instruction")
    .eq("humor_flavor_id", flavorId)
    .order("step_order", { ascending: true });

  if (stepError) {
    return NextResponse.json({ error: stepError.message }, { status: 400 });
  }

  const promptChain = (steps ?? []).map((step) => ({
    id: step.id,
    order: step.step_order,
    instruction: step.instruction,
  }));

  const results: Array<{ imageId: string; captions: string[]; raw: unknown; error: string | null }> = [];

  for (const imageId of imageIds) {
    const apiResponse = await fetch(`${API_BASE_URL}/pipeline/generate-captions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        imageId,
        humorFlavorId: flavor.id,
        humorFlavorName: flavor.name,
        promptChain,
      }),
      cache: "no-store",
    });

    const raw = await apiResponse.json().catch(() => null);

    if (!apiResponse.ok) {
      results.push({
        imageId,
        captions: [],
        raw,
        error: raw?.error ?? `REST API call failed with status ${apiResponse.status}`,
      });
      continue;
    }

    const possibleCaptions = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.captions)
        ? raw.captions
        : Array.isArray(raw?.data)
          ? raw.data
          : [];

    const captions = possibleCaptions
      .map((item: unknown) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "content" in item) {
          const content = (item as { content?: unknown }).content;
          if (typeof content === "string") {
            return content;
          }
        }

        return "";
      })
      .filter(Boolean);

    results.push({
      imageId,
      captions,
      raw,
      error: null,
    });
  }

  return NextResponse.json({
    flavor,
    promptChain,
    results,
  });
}
