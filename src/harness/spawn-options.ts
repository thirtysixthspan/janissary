import type { RemoteAddress } from '../remote/address.js';

// The full set of decisions a harness tab is created from, grouped into one object so
// `HarnessManager`'s two launch paths (`open` and `openFromProfile`) name every field instead of
// repeating a long positional list — several fields share a type, so a transposition in one of the
// lists would otherwise compile silently.
export interface SpawnTabOptions {
  name: string;
  label: string;
  cwd: string;
  workspaceDir: string | undefined;
  offline: boolean;
  group: number;
  groupColor: string;
  dotColor: string;
  autoApprove: boolean;
  model?: string;
  effort?: string;
  // Set only for a workspace clone still in flight: the PTY spawn waits on it.
  ready?: Promise<void>;
  // Set for an `on <address>` launch: the harness runs on another host, `workspaceDir` stays
  // undefined (the clone is the remote's, and so is its cleanup), and the PTY is a remote session.
  remote?: RemoteAddress;
}
