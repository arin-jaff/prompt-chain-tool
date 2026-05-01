import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Follow the user's instructions precisely and concisely. Output only what is requested, with no preamble or commentary.";

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const flavorId = typeof body?.flavorId === "string" ? body.flavorId.trim() : "";

  if (!flavorId) {
    return NextResponse.json({ error: "flavorId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data, error: updateError } = await supabase
    .from(TABLES.flavorSteps)
    .update({
      llm_system_prompt: DEFAULT_SYSTEM_PROMPT,
      modified_by_user_id: user.userId,
    })
    .eq("humor_flavor_id", flavorId)
    .is("llm_system_prompt", null)
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    updated: data?.length ?? 0,
    stepIds: (data ?? []).map((row) => row.id),
  });
}
