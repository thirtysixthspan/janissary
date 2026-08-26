import { describe, it, expect } from 'vitest';
import { remoteServeCommand } from './manager.js';
import { parseRemoteAddress, type RemoteAddress } from './address.js';

function address(token: string): RemoteAddress {
  const parsed = parseRemoteAddress(token);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
}

describe('remoteServeCommand', () => {
  it('runs remote-serve through an interactive shell so rc-file PATH setup applies', () => {
    expect(remoteServeCommand(address('devbox'))).toBe(`ssh -t devbox '$SHELL -ic "janus remote-serve"'`);
  });

  it('puts the remote path inside the interactive shell command', () => {
    expect(remoteServeCommand(address('devbox:/srv/proj')))
      .toBe(`ssh -t devbox '$SHELL -ic "janus remote-serve /srv/proj"'`);
  });

  it('keeps the user@host destination outside the quoted command, as ssh\'s own argument', () => {
    expect(remoteServeCommand(address('admin@devbox')))
      .toBe(`ssh -t admin@devbox '$SHELL -ic "janus remote-serve"'`);
  });

  // Single quotes, so the local `$SHELL -lc` that spawnPty builds cannot expand `$SHELL` before ssh
  // sees it: the expansion has to happen on the remote, where the user's own shell is.
  it('leaves $SHELL single-quoted for the remote to expand', () => {
    expect(remoteServeCommand(address('devbox'))).toContain(`'$SHELL -ic`);
  });

  // The inner double quotes are consumed by the remote login shell, so the interactive shell parses
  // `~/dev/proj` unquoted and expands it — as it did before the wrapper existed.
  it('leaves a home-relative path unquoted inside the inner command so the remote expands it', () => {
    expect(remoteServeCommand(address('admin@devbox:~/dev/proj')))
      .toBe(`ssh -t admin@devbox '$SHELL -ic "janus remote-serve ~/dev/proj"'`);
  });
});
