import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export interface AuthedUser {
  id: string;
  email: string | undefined;
}

// Validates the Authorization: Bearer <token> header against Supabase
// Auth. No cookies, no middleware -- the browser attaches its session's
// access_token to every call, matching this app's existing pattern of
// the browser only ever talking to our own API routes. This is the real
// gate; RLS is defense-in-depth on top, not a substitute for it (every
// route uses the service-role client, which bypasses RLS entirely).
export async function getUser(req: NextRequest): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}
