import type { RootRefusal } from '../remote/root-refusal.js';

// A remote host's `name-in-use` answer, carried as the rejection of a remote launch's `ready` so it
// reaches the same failure funnel every other provisioning failure does, and can still be told apart
// there from a clone failure or a lost channel. With `path` and `reason`, the host found a leftover
// workspace it could not remove; without them, something with this label is running there.
export class LaunchNameRefusal extends Error {
  constructor(
    readonly label: string,
    readonly host: string,
    readonly path?: string,
    readonly reason?: string,
  ) {
    super(path === undefined ? `"${label}" is already running on ${host}.` : `Could not remove leftover workspace "${label}" on ${host}.`);
    this.name = 'LaunchNameRefusal';
  }
}

// A remote host's `root-refused` answer: it could not settle a project root for the launch — the
// clone was declined or failed, or the path holds something that is not a clone of this project.
// Carried as the rejection of the launch's `ready`, like `LaunchNameRefusal`, so the failure funnel
// can compose the line with the tab's name and post it.
export class RemoteRootRefusal extends Error {
  constructor(readonly host: string, readonly refusal: RootRefusal) {
    super(`No usable project root on ${host}.`);
    this.name = 'RemoteRootRefusal';
  }
}

// A channel that ended before the host answered the provision — unreachable, failed auth, or gone
// for any other reason. The check the provision carries never ran, so the launch is refused with
// the channel's own message as the reason, and the tab keeps showing that message as today.
export class LaunchCheckUnanswered extends Error {
  constructor(readonly host: string, message: string) {
    super(message);
    this.name = 'LaunchCheckUnanswered';
  }
}
