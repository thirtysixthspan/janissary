import { describe, expect, it } from 'vitest';
import type { ConnectionActivity } from '@shared/plugins/connections/shared';
import { groupToolEntries, parseToolCalls } from './activity-text';

describe('parseToolCalls', () => {
  it('returns one verbatim text segment when the entry has no tool calls', () => {
    expect(parseToolCalls('plain <b>message</b> with no calls')).toEqual([
      { kind: 'text', text: 'plain <b>message</b> with no calls' },
    ]);
  });

  it('finds a call that starts the text', () => {
    const text = '<function_calls><invoke name="bash"><parameter name="command">pwd</parameter></invoke></function_calls>';
    expect(parseToolCalls(text)).toEqual([
      { kind: 'tool-call', calls: [{ name: 'bash', parameters: [{ name: 'command', value: 'pwd' }] }] },
    ]);
  });

  it('finds a call embedded mid-line and keeps the prose on both sides', () => {
    const text = 'I will explore. <function_calls> <invoke name="bash"> <parameter name="command">find . -name "*.md"</parameter> </invoke> </function_calls> Let me check.';
    expect(parseToolCalls(text)).toEqual([
      { kind: 'text', text: 'I will explore. ' },
      { kind: 'tool-call', calls: [{ name: 'bash', parameters: [{ name: 'command', value: 'find . -name "*.md"' }] }] },
      { kind: 'text', text: ' Let me check.' },
    ]);
  });

  it('reads every invoke and named parameter in one block', () => {
    const text = '<function_calls><invoke name="file read"><parameter name="path">a.ts</parameter></invoke>'
      + '<invoke name="file glob"><parameter name="pattern">**/*.ts</parameter><parameter name="limit">10</parameter></invoke></function_calls>';
    expect(parseToolCalls(text)).toEqual([
      { kind: 'tool-call', calls: [
        { name: 'file read', parameters: [{ name: 'path', value: 'a.ts' }] },
        { name: 'file glob', parameters: [{ name: 'pattern', value: '**/*.ts' }, { name: 'limit', value: '10' }] },
      ] },
    ]);
  });

  it('finds several blocks separated by prose and newlines', () => {
    const text = 'first\n<function_calls><invoke name="one"><parameter name="x">1</parameter></invoke></function_calls>'
      + '\nmiddle\n<function_calls><invoke name="two"><parameter name="y">2</parameter></invoke></function_calls>\nlast';
    expect(parseToolCalls(text)).toEqual([
      { kind: 'text', text: 'first\n' },
      { kind: 'tool-call', calls: [{ name: 'one', parameters: [{ name: 'x', value: '1' }] }] },
      { kind: 'text', text: '\nmiddle\n' },
      { kind: 'tool-call', calls: [{ name: 'two', parameters: [{ name: 'y', value: '2' }] }] },
      { kind: 'text', text: '\nlast' },
    ]);
  });

  it('decodes the common XML entities in parameter values', () => {
    const text = '<function_calls><invoke name="bash"><parameter name="command">echo &quot;a &amp; b&quot; &lt;x&gt; &apos;y&apos;</parameter></invoke></function_calls>';
    expect(parseToolCalls(text)).toEqual([
      { kind: 'tool-call', calls: [
        { name: 'bash', parameters: [{ name: 'command', value: `echo "a & b" <x> 'y'` }] },
      ] },
    ]);
  });

  it('leaves an unclosed block and a block with no invoke as raw text', () => {
    const unclosed = 'before <function_calls><invoke name="bash"><parameter name="command">pwd</parameter>';
    expect(parseToolCalls(unclosed)).toEqual([{ kind: 'text', text: unclosed }]);
    const noInvoke = 'before <function_calls>just prose</function_calls> after';
    expect(parseToolCalls(noInvoke)).toEqual([{ kind: 'text', text: noInvoke }]);
  });
});

const activity = (kind: ConnectionActivity['kind'], text: string, timestamp: number): ConnectionActivity => ({ kind, text, timestamp });

describe('groupToolEntries', () => {
  it('passes non-tool entries through unchanged with their source index', () => {
    const entries = [activity('message', 'hello', 1), activity('thought', 'thinking', 2), activity('plan', 'plan', 3)];
    expect(groupToolEntries(entries)).toEqual([
      { kind: 'activity', entry: entries[0], index: 0 },
      { kind: 'activity', entry: entries[1], index: 1 },
      { kind: 'activity', entry: entries[2], index: 2 },
    ]);
  });

  it('pairs two consecutive tool entries into one command and reply row', () => {
    const command = activity('tool', 'grep foo', 1);
    const reply = activity('tool', '3 matches', 2);
    expect(groupToolEntries([command, reply])).toEqual([{ kind: 'tool', command, reply, index: 0 }]);
  });

  it('leaves a lone tool entry with a command and no reply', () => {
    const command = activity('tool', 'grep foo', 4);
    expect(groupToolEntries([command])).toEqual([{ kind: 'tool', command, index: 0 }]);
  });

  it('starts a new pair after a non-tool entry interrupts', () => {
    const first = activity('tool', 'first command', 1);
    const firstReply = activity('tool', 'first reply', 2);
    const message = activity('message', 'between', 3);
    const second = activity('tool', 'second command', 4);
    expect(groupToolEntries([first, firstReply, message, second])).toEqual([
      { kind: 'tool', command: first, reply: firstReply, index: 0 },
      { kind: 'activity', entry: message, index: 2 },
      { kind: 'tool', command: second, index: 3 },
    ]);
  });

  it('keeps each row anchored to the index of its first source entry', () => {
    const entries = [
      activity('message', 'a', 10), activity('tool', 'b', 11),
      activity('tool', 'c', 12), activity('permission', 'd', 13),
    ];
    expect(groupToolEntries(entries).map((row) => row.index)).toEqual([0, 1, 3]);
  });
});
