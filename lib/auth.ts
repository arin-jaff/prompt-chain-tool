import { NextResponse } from "next/server";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UserContext } from "@/lib/types";

export async function requireAdmin(): Promise<{ user: UserContext | null; error: NextResponse | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from(TABLES.profiles)
    .select("id, is_superadmin, is_matrix_admin")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      user: null,
      error: NextResponse.json({ error: "Profile not found" }, { status: 403 }),
    };
  }

  if (!profile.is_superadmin && !profile.is_matrix_admin) {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return {
    user: {
      userId: user.id,
      profile,
    },
    error: null,
  };
}
