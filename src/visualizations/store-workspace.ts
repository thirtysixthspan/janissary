// The three directories one visualization owns, and the trust entry that goes with them.
//
// Split out of `store.ts` because they are about paths and the trust file rather than about a record: the
// store reads and writes documents, and the workspace is what the agent runs in.

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { trustWorkspace, untrustWorkspace } from '../workspace/index.js';

// The empty workspace the record's agent is confined to, and the one directory a file it acquired may be
// read from. Created on first use rather than at creation, so a visualization nobody ever asked anything
// of leaves nothing on disk.
export function workspaceOf(root: string, id: string, claudeJson: string): string {
  const workspace = path.join(root, id, 'workspace');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(`${workspace}.tmp`, { recursive: true });
  trustWorkspace(workspace, claudeJson);
  return workspace;
}

export function untrust(root: string, id: string, claudeJson: string): void {
  const workspace = path.join(root, id, 'workspace');
  untrustWorkspace(workspace, claudeJson);
  rmSync(path.join(root, id), { recursive: true, force: true });
}
