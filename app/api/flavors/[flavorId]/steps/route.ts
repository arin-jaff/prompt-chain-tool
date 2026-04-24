import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ flavorId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { flavorId } = await params;
  const body = await request.json();
  const instruction = String(body?.instruction ?? "").trim();

  if (!instruction) {
    return NextResponse.json({ error: "Instruction is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingSteps, error: existingError } = await supabase
    .from(TABLES.flavorSteps)
    .select("order_by")
    .eq("humor_flavor_id", flavorId)
    .order("order_by", { ascending: false })
    .limit(1);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  const nextOrder = (existingSteps?.[0]?.order_by ?? 0) + 1;

  const { data, error: insertError } = await supabase
    .from(TABLES.flavorSteps)
    .insert({
      humor_flavor_id: flavorId,
      order_by: nextOrder,
      llm_user_prompt: instruction,
      llm_system_prompt: null,
      humor_flavor_step_type_id: 3,
      llm_input_type_id: 2,
      llm_output_type_id: 1,
      llm_model_id: 1,
      created_by_user_id: user.userId,
      modified_by_user_id: user.userId,
    })
    .select("id, humor_flavor_id, step_order:order_by, instruction:llm_user_prompt, created_datetime_utc, modified_datetime_utc")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ step: data }, { status: 201 });
}
