import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { Managers } from '../managers.js';
import { expandUserPath } from '../paths.js';
import { resolveReplayTarget, type ReplayLookup } from './replay-target.js';

// `harness replay` and `ssh replay` differ only in the command they were typed as, so the two effects
// the resolution needs — what a label names, and whether a path is there — are supplied here rather
// than reached for inside it. The lookup is where the filesystem lives; the rule that chooses between
// them is the pure function beside it.
//
// A path is resolved the way `open` and `edit` resolve one: `~` expanded against the launch
// directory, relative paths against the invoking tab's working directory, and no glob — a recording
// is one file, and a wildcard naming several has nothing to mean here.

function resolvePath(managers: Managers, label: string, target: string): string {
  const expanded = expandUserPath(target, { root: managers.tab.launchDir });
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(managers.tab.cwdOf(label) ?? process.cwd(), expanded);
}

export function replayLookup(managers: Managers, invokingLabel: string): ReplayLookup {
  return {
    forLabel(label) {
      const tab = managers.tab.byLabel(label);
      if (!tab?.harness) return { error: `No recording found for "${label}".` };
      const recording = managers.harness.recordingPathOf(label);
      if (recording === undefined) {
        return { error: `No recording available for "${label}" yet.` };
      }
      return { path: recording };
    },
    forFile(target) {
      const file = resolvePath(managers, invokingLabel, target);
      if (!existsSync(file) || !statSync(file).isFile()) {
        return { error: `No such recording file: ${target}.` };
      }
      return { path: file };
    },
  };
}

export function resolveReplay(
  managers: Managers, invokingLabel: string, target: string,
): ReturnType<typeof resolveReplayTarget> {
  return resolveReplayTarget(target, replayLookup(managers, invokingLabel));
}
