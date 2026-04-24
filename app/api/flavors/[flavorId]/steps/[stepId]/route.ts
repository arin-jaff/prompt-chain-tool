import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ flavorId: string; stepId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { flavorId, stepId } = await params;
  const body = await request.json();
  const instruction = String(body?.instruction ?? "").trim();

  if (!instruction) {
    return NextResponse.json({ error: "Instruction is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: updateError } = await supabase
    .from(TABLES.flavorSteps)
    .update({
      llm_user_prompt: instruction,
      modified_by_user_id: user.userId,
    })
    .eq("id", stepId)
    .eq("humor_flavor_id", flavorId)
    .select("id, humor_flavor_id, step_order:order_by, instruction:llm_user_prompt, created_datetime_utc, modified_datetime_utc")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ step: data });
}

export async function DELETE(_: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { flavorId, stepId } = await params;
  const supabase = await createSupabaseServerClient();

  const { error: deleteError } = await supabase
    .from(TABLES.flavorSteps)
    .delete()
    .eq("id", stepId)
    .eq("humor_flavor_id", flavorId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const { data: steps, error: readError } = await supabase
    .from(TABLES.flavorSteps)
    .select("id")
    .eq("humor_flavor_id", flavorId)
    .order("order_by", { ascending: true });

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }

  // Keep contiguous ordering after deletions.
  for (let index = 0; index < (steps?.length ?? 0); index += 1) {
    const step = steps?.[index];
    await supabase
      .from(TABLES.flavorSteps)
      .update({
        order_by: index + 1,
        modified_by_user_id: user.userId,
      })
      .eq("id", step?.id);
  }

  return NextResponse.json({ deleted: true });
}
