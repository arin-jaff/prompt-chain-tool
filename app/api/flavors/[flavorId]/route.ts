import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ flavorId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) {
    return error;
  }

  const { flavorId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: flavor, error: flavorError } = await supabase
    .from(TABLES.flavors)
    .select("id, name, description, created_datetime_utc, modified_datetime_utc")
    .eq("id", flavorId)
    .single();

  if (flavorError || !flavor) {
    return NextResponse.json({ error: "Flavor not found" }, { status: 404 });
  }

  const { data: steps, error: stepError } = await supabase
    .from(TABLES.flavorSteps)
    .select("id, humor_flavor_id, step_order, instruction, created_datetime_utc, modified_datetime_utc")
    .eq("humor_flavor_id", flavorId)
    .order("step_order", { ascending: true });

  if (stepError) {
    return NextResponse.json({ error: stepError.message }, { status: 400 });
  }

  return NextResponse.json({ flavor, steps: steps ?? [] });
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { flavorId } = await params;
  const body = await request.json();

  const payload: Record<string, string | null> = {
    modified_by_user_id: user.userId,
  };

  if (typeof body?.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    payload.name = trimmed;
  }

  if (typeof body?.description === "string") {
    payload.description = body.description.trim();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: updateError } = await supabase
    .from(TABLES.flavors)
    .update(payload)
    .eq("id", flavorId)
    .select("id, name, description, created_datetime_utc, modified_datetime_utc")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ flavor: data });
}

export async function DELETE(_: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) {
    return error;
  }

  const { flavorId } = await params;
  const supabase = await createSupabaseServerClient();

  const { error: stepDeleteError } = await supabase
    .from(TABLES.flavorSteps)
    .delete()
    .eq("humor_flavor_id", flavorId);

  if (stepDeleteError) {
    return NextResponse.json({ error: stepDeleteError.message }, { status: 400 });
  }

  const { error: flavorDeleteError } = await supabase
    .from(TABLES.flavors)
    .delete()
    .eq("id", flavorId);

  if (flavorDeleteError) {
    return NextResponse.json({ error: flavorDeleteError.message }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
