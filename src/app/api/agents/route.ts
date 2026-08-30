import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/client";
import { getUserOrAnonymous } from "@/lib/auth/getUser";

export async function GET(req: NextRequest) {
  const user = await getUserOrAnonymous(req);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, status, spec, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const agents = (data ?? []).map((a) => ({
    id: a.id,
    status: a.status,
    objectives: (a.spec as { objectives?: string[] } | null)?.objectives ?? [],
    created_at: a.created_at,
  }));

  return NextResponse.json({ agents });
}
