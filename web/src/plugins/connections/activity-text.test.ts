import { describe, expect, it } from 'vitest';
import { parseToolCalls } from './activity-text';

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
