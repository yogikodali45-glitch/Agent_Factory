import type { createAdminClient } from "@/lib/db/client";
import type { AgentTurnResult } from "./agent";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

// Persists any non-null side-channel data from a turn (feedback/booking/
// escalation), tagged with which channel produced it. Each insert is
// independent and non-fatal -- a failure here shouldn't cost the customer
// their reply, since by the time this runs they already have it. Shared
// by /api/chat/[agentId] (channel: "chat") and /api/voice/[agentId]
// (channel: "call") so the two never drift on how this gets tagged.
export async function persistTurn(
  supabase: SupabaseAdminClient,
  agentId: string,
  channel: "chat" | "call",
  turn: Pick<AgentTurnResult, "feedback" | "booking" | "escalation">
): Promise<void> {
  const persist = async (table: string, row: object) => {
    const { error } = await supabase.from(table).insert({ agent_id: agentId, channel, ...row });
    if (error) console.error(`Failed to persist ${table} for agent ${agentId}: ${error.message}`);
  };
  await Promise.all([
    turn.feedback && persist("agent_feedback", turn.feedback),
    turn.booking && persist("agent_bookings", turn.booking),
    turn.escalation && persist("agent_escalations", turn.escalation),
  ]);
}
