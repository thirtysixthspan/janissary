import { describe, it, expect } from 'vitest';
import { command } from './tasks.js';

describe('tasks command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('tasks');
  });

  it('matches "tasks" case-insensitively', () => {
    expect(command.match('tasks')).toBe(true);
    expect(command.match('TASKS')).toBe(true);
    expect(command.match('Tasks')).toBe(true);
  });

  it('does not match non-tasks input', () => {
    expect(command.match('tasks foo')).toBe(false);
    expect(command.match('task')).toBe(false);
    expect(command.match('next')).toBe(false);
  });

  it('run is a no-op that does not throw', () => {
    expect(() => command.run('tasks', { label: 'janus', index: 0 }, {} as never)).not.toThrow();
  });
});
