import type { AgentSnapshot } from './types.js';

export function applyNestedAgentPolicy(child: AgentSnapshot, parent: AgentSnapshot): AgentSnapshot {
  const permitted = new Set(parent.skills.map(({ source, name, instructions }) =>
    JSON.stringify([source, name, instructions])));
  for (const skill of child.skills) {
    if (!permitted.has(JSON.stringify([skill.source, skill.name, skill.instructions]))) {
      throw new Error(`Agent: nested skill "${skill.name}" is outside the parent policy.`);
    }
  }
  const grants = new Set(parent.grants);
  return Object.freeze({
    ...child,
    grants: Object.freeze(child.grants.filter((grant) => grants.has(grant))),
  });
}
