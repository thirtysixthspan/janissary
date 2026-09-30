import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../config.js';
import { readPluginSettings, savePluginSettings } from './settings.js';

describe('plugin settings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'plugin-settings-test-'));
    loadConfig(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('answers an empty object for a plugin that has saved nothing', () => {
    expect(readPluginSettings('search')).toEqual({});
  });

  it('saves one plugin\'s settings without touching another\'s, and survives a reload', () => {
    expect(savePluginSettings('search', { regex: true })).toBe(true);
    expect(savePluginSettings('audio', { volume: 3 })).toBe(true);
    expect(savePluginSettings('search', { regex: false, wholeWord: true })).toBe(true);

    loadConfig(tmpDir);

    expect(readPluginSettings('search')).toEqual({ regex: false, wholeWord: true });
    expect(readPluginSettings('audio')).toEqual({ volume: 3 });
    const parsed = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'config.json'), 'utf8'));
    expect(parsed.pluginSettings.search).toEqual({ regex: false, wholeWord: true });
  });

  it('hands back a copy, so changing it does not change the running config', () => {
    savePluginSettings('search', { regex: true });
    const read = readPluginSettings('search');
    read.regex = false;

    expect(readPluginSettings('search')).toEqual({ regex: true });
  });

  it('answers false and keeps the running settings when the write fails', () => {
    rmSync(path.join(tmpDir, '.janissary'), { recursive: true, force: true });

    expect(savePluginSettings('search', { regex: true })).toBe(false);
    expect(readPluginSettings('search')).toEqual({});
  });
});
