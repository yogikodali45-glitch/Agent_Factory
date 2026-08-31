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
      "Records a booking/appointment/reservation request from the customer -- name, contact, requested time, and details -- for the business to confirm. There's no live calendar behind this; it cannot check real availability or guarantee a slot, only capture the request.",
  },
  {
    id: "escalate_to_human",
    label: "Escalate to human",
    description:
      "Hands the conversation off to a human -- for the Spec's own escalation_rules, and as a baseline safety behavior regardless of what the Spec says.",
  },
  {
    id: "feedback_collection",
    label: "Feedback collection",
    description:
      "Asks the customer how their interaction went and captures what they say as structured feedback the business can review.",
  },
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTOR_LIBRARY.find((c) => c.id === id);
}
