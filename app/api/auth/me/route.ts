import { requireAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const { user, error } = await requireAdmin();

  if (error) {
    return error;
  }

  return NextResponse.json({
    userId: user?.userId,
    profile: user?.profile,
    isAdmin: true,
  });
}
