import { describe, expect, it } from 'vitest';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import { terminalConfinement } from './terminal-workspace.js';

const source = { workspaceDir: '/repo/.janissary/workspace/worker', offline: true };
const own = { workspaceDir: '/repo/.janissary/workspace/fresh', offline: false };

describe('terminalConfinement', () => {
  it('runs a terminal that names no workspace unconfined, even from a workspaced source', () => {
    expect(terminalConfinement(undefined, source, own)).toEqual({ fromSource: false });
  });

  it("confines to the source tab's own clone and keeps its offline mode", () => {
    expect(terminalConfinement({ dir: source.workspaceDir }, source, undefined)).toEqual({
      workspace: { dir: source.workspaceDir, offline: true },
      fromSource: true,
    });
  });

  it("confines to the opened tab's own clone", () => {
    expect(terminalConfinement({ dir: own.workspaceDir }, source, own)).toEqual({
      workspace: { dir: own.workspaceDir, offline: false },
      fromSource: false,
    });
  });

  it('routes to a labelled remote workspace only when the requested directory matches', () => {
    expect(terminalConfinement(
      { dir: '/remote/workspace', offline: false }, {}, undefined,
      { dir: '/remote/workspace', offline: true },
    )).toEqual({
      workspace: { dir: '/remote/workspace', offline: true }, fromSource: true, remote: true,
    });
    expect(() => terminalConfinement(
      { dir: '/remote/other' }, {}, undefined, { dir: '/remote/workspace', offline: false },
    )).toThrow(TabPluginRejection);
  });

  it('lets a plugin ask for offline on a clone that is online', () => {
    expect(terminalConfinement({ dir: own.workspaceDir, offline: true }, undefined, own).workspace)
      .toEqual({ dir: own.workspaceDir, offline: true });
  });

  it('refuses any other directory as a rejection rather than a failure', () => {
    expect(() => terminalConfinement({ dir: '/repo/.janissary/workspace/other' }, source, own))
      .toThrow(TabPluginRejection);
    expect(() => terminalConfinement({ dir: '/repo' }, {}, undefined)).toThrow(
      "Cannot confine a terminal to /repo: it is not this tab's workspace.",
    );
  });
});
