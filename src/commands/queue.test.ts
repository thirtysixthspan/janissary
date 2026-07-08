import { describe, it, expect } from 'vitest';
import { command } from './queue.js';

describe('queue command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('queue');
  });

  it('matches "queue" case-insensitively', () => {
    expect(command.match('queue')).toBe(true);
    expect(command.match('QUEUE')).toBe(true);
    expect(command.match('Queue')).toBe(true);
  });

  it('does not match non-queue input', () => {
    expect(command.match('queued')).toBe(false);
    expect(command.match('enqueue claude echo hi')).toBe(false);
  });
});
