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

// TEMPORARY, testing-phase only: falls back to one shared anonymous
// account instead of 401ing, so early testers can use the app without
// hitting Supabase's free-tier email-send rate limit or dealing with
// magic-link redirect config. Everyone who isn't signed in shares this
// one account's agents. This is a deliberate, requested bypass of the
// real gate above (getUser), not a replacement for it -- when real user
// accounts matter again, switch routes back to getUser + a 401 on null,
// same as this function's own fallback-less shape. Don't build further
// features on top of "anonymous" being permanent.
const ANONYMOUS_USER: AuthedUser = {
  id: "fc5a8a9d-040c-4db7-8544-8c6dd3cb047b",
  email: "anonymous-testing@agentfactory.local",
};

export async function getUserOrAnonymous(req: NextRequest): Promise<AuthedUser> {
  return (await getUser(req)) ?? ANONYMOUS_USER;
}
