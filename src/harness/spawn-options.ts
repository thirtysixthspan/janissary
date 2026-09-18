import type { RemoteAddress } from '../remote/address.js';
import type { RemoteResume } from '../remote/resume.js';

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
  // `-b`/`--browser`: start a headless Chromium for this tab behind a protocol guard and inject the
  // two variables the harness drives it through. Owned by the tab's `HarnessRuntime`, so it is
  // stopped by the same disposal the reader and recorder go through.
  browser: boolean;
  model?: string;
  effort?: string;
  // Set only for a workspace clone still in flight: the PTY spawn waits on it.
  ready?: Promise<void>;
  // Set for an `on <address>` launch: the harness runs on another host, `workspaceDir` stays
  // undefined (the clone is the remote's, and so is its cleanup), and the PTY is a remote session.
  remote?: RemoteAddress;
  // Set when this launch is really a reattach to a peer that is already running the harness: the
  // channel asks to reattach instead of asking for a clone, and the PTY adopts the recorded spawn id
  // rather than minting a new one, so it binds to the process already out there.
  resume?: RemoteResume;
  // The spawn id the far side already knows this process by. Only meaningful alongside `resume`.
  resumePtyId?: string;
}
