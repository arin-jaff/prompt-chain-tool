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
  const { data, error: readError } = await supabase
    .from(TABLES.images)
    .select("id, url, image_description")
    .eq("is_public", true)
    .order("created_datetime_utc", { ascending: false })
    .limit(20);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }

  return NextResponse.json({ images: data ?? [] });
}
