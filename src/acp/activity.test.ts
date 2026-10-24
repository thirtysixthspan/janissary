import { describe, it, expect } from 'vitest';
import { ACP_ACTIVITY_KINDS, acpActivity, isAcpActivityKind } from './activity.js';

describe('acpActivity', () => {
  it.each([
    ['agent_message_chunk', 'message'],
    ['agent_thought_chunk', 'thought'],
    ['tool_call', 'tool'],
    ['tool_call_update', 'tool'],
    ['plan', 'plan'],
    ['permission_decision', 'permission'],
  ])('maps %s to %s', (sessionUpdate, kind) => {
    expect(acpActivity({ sessionUpdate, content: 'text' })?.kind).toBe(kind);
  });

  it('carries string content and a text block\'s text as plain text', () => {
    expect(acpActivity({ sessionUpdate: 'agent_thought_chunk', content: 'Planning.' }))
      .toEqual({ kind: 'thought', text: 'Planning.' });
    expect(acpActivity({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Planning.' } }))
      .toEqual({ kind: 'thought', text: 'Planning.' });
  });

  it('falls back to JSON for structured content, and for an update with none', () => {
    expect(acpActivity({ sessionUpdate: 'tool_call', content: { title: 'Read', status: 'pending' } }))
      .toEqual({ kind: 'tool', text: '{"title":"Read","status":"pending"}' });
    expect(acpActivity({ sessionUpdate: 'permission_decision', outcome: 'allow' }))
      .toEqual({ kind: 'permission', text: '{"sessionUpdate":"permission_decision","outcome":"allow"}' });
  });

  it('answers nothing for session bookkeeping and for a value that is not an update', () => {
    expect(acpActivity({ sessionUpdate: 'available_commands_update', availableCommands: [] })).toBeUndefined();
    expect(acpActivity({ sessionUpdate: 'user_message_chunk', content: 'hi' })).toBeUndefined();
    expect(acpActivity({ content: 'no kind' })).toBeUndefined();
    expect(acpActivity(null)).toBeUndefined();
    expect(acpActivity(['agent_message_chunk'])).toBeUndefined();
  });
});

describe('isAcpActivityKind', () => {
  it('admits exactly the five kinds', () => {
    for (const kind of ACP_ACTIVITY_KINDS) expect(isAcpActivityKind(kind)).toBe(true);
    expect(isAcpActivityKind('agent_thought_chunk')).toBe(false);
    expect(isAcpActivityKind(undefined)).toBe(false);
  });
});
