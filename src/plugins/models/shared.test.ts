import { describe, expect, it } from 'vitest';
import { modelsManifest } from './manifest.js';
import {
  MODELS_PAYLOAD_SCHEMA_VERSION,
  isDeleteIntent,
  isEmptyIntent,
  isModelsPayload,
  type ModelGroup,
} from './shared.js';

const GROUP: ModelGroup = {
  label: 'OpenAI',
  rows: [{ harness: 'codex', id: 'gpt-6-sol', name: 'GPT 6 Sol', disabled: false }],
};

describe('models shared contract', () => {
  it('accepts an empty and a complete model payload', () => {
    expect(isModelsPayload({ groups: [], refreshing: false })).toBe(true);
    expect(isModelsPayload({ groups: [GROUP], refreshing: true })).toBe(true);
  });

  it('rejects malformed payload and row fields', () => {
    expect(isModelsPayload(null)).toBe(false);
    expect(isModelsPayload([])).toBe(false);
    expect(isModelsPayload({ groups: {}, refreshing: false })).toBe(false);
    expect(isModelsPayload({ groups: [null], refreshing: false })).toBe(false);
    expect(isModelsPayload({ groups: [{ label: 'x', rows: [{ ...GROUP.rows[0], disabled: 0 }] }], refreshing: false }))
      .toBe(false);
    expect(isModelsPayload({ groups: [], refreshing: 'no' })).toBe(false);
  });

  it('guards empty refresh and nonempty Delete intents', () => {
    expect(isEmptyIntent({})).toBe(true);
    expect(isEmptyIntent({ extra: true })).toBe(false);
    expect(isDeleteIntent({ harness: 'codex', id: 'gpt-6-sol' })).toBe(true);
    expect(isDeleteIntent({ harness: '', id: 'gpt-6-sol' })).toBe(false);
    expect(isDeleteIntent({ harness: 'codex', id: '  ' })).toBe(false);
    expect(isDeleteIntent(null)).toBe(false);
  });
});

describe('models manifest', () => {
  it('pins the payload schema and claims only the models command and topic', () => {
    expect(modelsManifest.payloadSchemaVersion).toBe(MODELS_PAYLOAD_SCHEMA_VERSION);
    expect(modelsManifest.command).toBe('models');
    expect(modelsManifest.notifications).toEqual(['models']);
    expect(modelsManifest.fileExtensions).toEqual({});
    expect([...modelsManifest.capabilities].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'dockTab', 'openOrFocusTab', 'rejectRequest', 'reportFailure', 'topicAction', 'topicData', 'updateTab',
    ]);
  });
});
