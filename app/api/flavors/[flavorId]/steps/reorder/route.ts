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
  const orderedStepIds = Array.isArray(body?.orderedStepIds)
    ? body.orderedStepIds.map((id: unknown) => String(id))
    : [];

  if (!orderedStepIds.length) {
    return NextResponse.json({ error: "orderedStepIds is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  for (let index = 0; index < orderedStepIds.length; index += 1) {
    const stepId = orderedStepIds[index];
    const { error: updateError } = await supabase
      .from(TABLES.flavorSteps)
      .update({
        order_by: index + 1,
        modified_by_user_id: user.userId,
      })
      .eq("id", stepId)
      .eq("humor_flavor_id", flavorId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ reordered: true });
}
