export interface IntakeAdapter {
  // Extra instructions folded into Intake's extraction prompt for this
  // agent type -- how to interpret vague requests, what "done" looks like
  // for this type's fields. Not a rigid extra-field list: for a type as
  // simple as chat, the base Spec already covers everything it needs.
  promptGuidance: string;
}

export interface Adapter {
  intake: IntakeAdapter;
  // build / assemble / test / deploy hooks join here as each milestone
  // that actually needs them lands -- Blueprint §03.
}

const adapters: Record<string, Adapter> = {};

export function registerAdapter(agentType: string, adapter: Adapter) {
  adapters[agentType] = adapter;
}

export function getAdapter(agentType: string): Adapter {
  const adapter = adapters[agentType];
  if (!adapter) {
    throw new Error(`No adapter registered for agent_type "${agentType}"`);
  }
  return adapter;
}

export function registeredAgentTypes(): string[] {
  return Object.keys(adapters);
}
