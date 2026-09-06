// The one loopback address every participant in the e2e browser's private hop names.
//
// Four places have to agree: the guard's own listener, the URL the guard dials upstream, the
// browser server's listener in the child process, and the endpoint the agent is handed. Playwright's
// `launchServer` defaults its host to `localhost`, which is a name and not an address — on a host
// whose resolver answers it with `::1` first, the browser comes up on IPv6 loopback while the guard
// connects to IPv4 and is refused, with nothing exiting and nothing to notify the user about. So the
// address is written once, here, and the name is never used.
//
// `127.0.0.1` rather than `::1` because it is already what the published endpoint says. Loopback
// only, in every use: nothing here accepts a connection from off the host.

export const E2E_LOOPBACK_HOST = '127.0.0.1';

export function loopbackWsUrl(port: number, wsPath: string): string {
  return `ws://${E2E_LOOPBACK_HOST}:${port}${wsPath}`;
}
