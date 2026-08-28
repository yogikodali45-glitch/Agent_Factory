// The platform's connector library -- v0, MVP's small fixed set (MVP §01).
// Build selects from this list; it never invents a tool that isn't here.
// Which subset is valid for a given agent type is the adapter's call
// (BuildAdapter.allowedConnectorIds), not a property of the connector
// itself -- a later type might reuse or exclude any of these.

export interface Connector {
  id: string;
  label: string;
  description: string;
}

export const CONNECTOR_LIBRARY: Connector[] = [
  {
    id: "faq_lookup",
    label: "FAQ / knowledge lookup",
    description:
      "Answers customer questions using the business's ingested knowledge source. Include whenever the Spec has any knowledge_sources.",
  },
  {
    id: "booking",
    label: "Booking",
    description:
      "Schedules or books an appointment, reservation, class, or order on the customer's behalf.",
  },
  {
    id: "escalate_to_human",
    label: "Escalate to human",
    description:
      "Hands the conversation off to a human -- for the Spec's own escalation_rules, and as a baseline safety behavior regardless of what the Spec says.",
  },
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTOR_LIBRARY.find((c) => c.id === id);
}
