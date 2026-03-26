import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) {
    return error;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: listError } = await supabase
    .from(TABLES.flavors)
    .select("id, name, description, created_datetime_utc, modified_datetime_utc")
    .order("name", { ascending: true });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  return NextResponse.json({ flavors: data ?? [] });
}

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  const description = body?.description ? String(body.description).trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: insertError } = await supabase
    .from(TABLES.flavors)
    .insert({
      name,
      description,
      created_by_user_id: user.userId,
      modified_by_user_id: user.userId,
    })
    .select("id, name, description, created_datetime_utc, modified_datetime_utc")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ flavor: data }, { status: 201 });
}
