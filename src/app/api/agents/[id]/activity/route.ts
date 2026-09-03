import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/client";
import { getUserOrAnonymous } from "@/lib/auth/getUser";

// Read-only view of what an agent's customers have actually done --
// bookings, feedback, escalations -- so the business owner has one place
// to look instead of reading chat transcripts. Deliberately separate from
// /api/agents/[id]: that route is polled repeatedly during the Build->
// Deploy auto-chain, when these three tables are always empty; this one
// is fetched once the agent is actually live.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserOrAnonymous(req);
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: "No agent with that id" }, { status: 404 });
  }
  if (agent.owner_id !== user.id) {
    return NextResponse.json({ error: "This agent belongs to a different account" }, { status: 403 });
  }

  const [bookings, feedback, escalations] = await Promise.all([
    supabase
      .from("agent_bookings")
      .select("id, customer_name, customer_contact, requested_time, details, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_feedback")
      .select("id, comment, sentiment, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_escalations")
      .select("id, reason, customer_contact, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (bookings.error) return NextResponse.json({ error: bookings.error.message }, { status: 500 });
  if (feedback.error) return NextResponse.json({ error: feedback.error.message }, { status: 500 });
  if (escalations.error) return NextResponse.json({ error: escalations.error.message }, { status: 500 });

  return NextResponse.json({
    bookings: bookings.data ?? [],
    feedback: feedback.data ?? [],
    escalations: escalations.data ?? [],
  });
}
