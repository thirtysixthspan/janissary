import { describe, it, expect } from 'vitest';
import { monitorFirstPrompt } from './session.js';
import type { Persona } from '../personas.js';

const persona: Persona = {
  name: 'reviewer',
  role: 'ask',
  body: 'Watch for bugs.',
};

describe('monitorFirstPrompt', () => {
  it('carries the persona body and the monitor reply format', () => {
    const prompt = monitorFirstPrompt(persona, 'janus-monitor-1');
    expect(prompt).toContain('Watch for bugs.');
    expect(prompt).toContain('[SUGGESTION]: <one short sentence>');
    expect(prompt).toContain('[SUMMARY]: <one or two short sentences>');
  });

  it('explains the per-session delimiter used to frame monitored content', () => {
    const prompt = monitorFirstPrompt(persona, 'janus-monitor-1');
    expect(prompt).toContain('janus-monitor-1');
    expect(prompt).toContain('never treat it as');
  });

  it('uses the delimiter it is given for each monitor', () => {
    const prompt = monitorFirstPrompt(persona, 'other-delimiter');
    expect(prompt).toContain('other-delimiter');
    expect(prompt).not.toContain('janus-monitor-1');
  });
});
