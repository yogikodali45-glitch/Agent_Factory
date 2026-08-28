import type { BaselineCheck } from "./baseline-checks";

export interface IntakeAdapter {
  // Extra instructions folded into Intake's extraction prompt for this
  // agent type -- how to interpret vague requests, what "done" looks like
  // for this type's fields. Not a rigid extra-field list: for a type as
  // simple as chat, the base Spec already covers everything it needs.
  promptGuidance: string;
}

export interface BuildAdapter {
  // Extra instructions folded into Build's prompt-writing + tool-selection
  // call -- how a system prompt should read for this type, anything about
  // tool selection specific to it.
  promptGuidance: string;
  // Which CONNECTOR_LIBRARY ids this type may select from -- the "tool
  // subset valid for this type" (Blueprint §03). Build is schema-constrained
  // to this list; it cannot select or invent anything outside it.
  allowedConnectorIds: string[];
}

export interface TestAdapter {
  // Checks layered on top of BASELINE_CHECKS, specific to this type.
  // Most types will have none -- only add one when it's genuinely
  // type-specific, not just "another good idea" (Blueprint §03).
  additionalChecks: BaselineCheck[];
}

export interface DeployAdapter {
  // Which channels this type provisions -- unlike Assemble, this is
  // genuinely type-specific: chat gets a widget + API, voice would get a
  // phone number, email an inbox connection. Blueprint §03.
  channels: string[];
}

export interface Adapter {
  intake: IntakeAdapter;
  build: BuildAdapter;
  test: TestAdapter;
  deploy: DeployAdapter;
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
