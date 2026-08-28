import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS entirely. Every pipeline route uses
// this for actual DB work -- ownership is enforced by explicit checks in
// each route (see src/lib/auth/getUser.ts), not by RLS, since RLS never
// applies to a service-role connection. Not the same thing as a
// user-session-aware client -- see browserClient.ts for that.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
