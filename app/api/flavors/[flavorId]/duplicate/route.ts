import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ flavorId: string }> };

function buildUniqueName(baseName: string, existingNames: Set<string>): string {
  const candidate = `${baseName} (Copy)`;
  if (!existingNames.has(candidate)) {
    return candidate;
  }
  let counter = 2;
  while (existingNames.has(`${baseName} (Copy ${counter})`)) {
    counter += 1;
  }
  return `${baseName} (Copy ${counter})`;
}

export async function POST(request: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { flavorId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedName = typeof body?.name === "string" ? body.name.trim() : "";

  const supabase = await createSupabaseServerClient();

  const { data: sourceFlavor, error: sourceError } = await supabase
    .from(TABLES.flavors)
    .select("id, name, description")
    .eq("id", flavorId)
    .single();

  if (sourceError || !sourceFlavor) {
    return NextResponse.json({ error: "Flavor not found" }, { status: 404 });
  }

  const { data: allFlavors, error: listError } = await supabase
    .from(TABLES.flavors)
    .select("name");

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  const existingNames = new Set((allFlavors ?? []).map((f) => f.name));

  let newName: string;
  if (requestedName) {
    if (existingNames.has(requestedName)) {
      return NextResponse.json(
        { error: "A flavor with that name already exists." },
        { status: 409 },
      );
    }
    newName = requestedName;
  } else {
    newName = buildUniqueName(sourceFlavor.name, existingNames);
  }

  const { data: newFlavor, error: insertFlavorError } = await supabase
    .from(TABLES.flavors)
    .insert({
      name: newName,
      description: sourceFlavor.description,
      created_by_user_id: user.userId,
      modified_by_user_id: user.userId,
    })
    .select("id, name, description, created_datetime_utc, modified_datetime_utc")
    .single();

  if (insertFlavorError || !newFlavor) {
    return NextResponse.json(
      { error: insertFlavorError?.message ?? "Failed to duplicate flavor" },
      { status: 400 },
    );
  }

  const { data: sourceSteps, error: stepsError } = await supabase
    .from(TABLES.flavorSteps)
    .select("step_order, instruction")
    .eq("humor_flavor_id", flavorId)
    .order("step_order", { ascending: true });

  if (stepsError) {
    await supabase.from(TABLES.flavors).delete().eq("id", newFlavor.id);
    return NextResponse.json({ error: stepsError.message }, { status: 400 });
  }

  if (sourceSteps && sourceSteps.length > 0) {
    const stepRows = sourceSteps.map((step) => ({
      humor_flavor_id: newFlavor.id,
      step_order: step.step_order,
      instruction: step.instruction,
      created_by_user_id: user.userId,
      modified_by_user_id: user.userId,
    }));

    const { error: insertStepsError } = await supabase
      .from(TABLES.flavorSteps)
      .insert(stepRows);

    if (insertStepsError) {
      await supabase.from(TABLES.flavorSteps).delete().eq("humor_flavor_id", newFlavor.id);
      await supabase.from(TABLES.flavors).delete().eq("id", newFlavor.id);
      return NextResponse.json({ error: insertStepsError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ flavor: newFlavor }, { status: 201 });
}
