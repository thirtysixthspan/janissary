import type { Role } from './shared.js';

export const DEFAULT_ROLES: readonly Role[] = [
  {
    name: 'planning',
    description: 'Research and development of plans for new product features.',
    commands: [],
    entries: [
      { harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' },
      { harness: 'claude', model: 'claude-opus-5-5', effort: 'xhigh' },
    ],
  },
  {
    name: 'research',
    description: 'Research, comparison, and information gathering for a task or question.',
    entries: [],
    commands: [],
  },
  {
    name: 'code review',
    description: 'Review of code changes for correctness, style, and risk.',
    entries: [],
    commands: [],
  },
  {
    name: 'implementation',
    description: 'Implementation of an approved plan or a described change.',
    entries: [],
    commands: [],
  },
  {
    name: 'documentation',
    description: 'Writing and updating specs, plans, and user or developer documentation.',
    entries: [],
    commands: [],
  },
  {
    name: 'ask',
    description: 'When you ask a question via ACP.',
    entries: [
      { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' },
      { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' },
      { harness: 'codex', model: 'gpt-6-luna', effort: 'high' },
    ],
    commands: [
      'db sqlite list', 'db sqlite query', 'browser goto', 'browser content',
      'question ask', 'question approve', 'file read', 'file glob', 'file grep', 'web search', 'web fetch',
      'notify',
    ],
  },
  {
    name: 'tell',
    description: 'When you tell a model to carry out a task via ACP.',
    entries: [
      { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' },
      { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' },
      { harness: 'codex', model: 'gpt-6-luna', effort: 'high' },
    ],
    commands: [
      'db sqlite create', 'db sqlite delete', 'db sqlite query', 'db sqlite list',
      'browser goto', 'browser content', 'browser eval', 'question ask', 'question approve', 'file read',
      'file glob', 'file grep', 'file write', 'file edit', 'file patch', 'web search', 'web fetch',
      'subagent', 'notify',
    ],
  },
  {
    name: 'user-interface',
    description: 'When you ask a model to arrange the user interface via ACP.',
    entries: [
      { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' },
      { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' },
      { harness: 'codex', model: 'gpt-6-luna', effort: 'high' },
    ],
    commands: ['tab'],
  },
];
