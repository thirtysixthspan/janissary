<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* reattaching an agent that has been detached opens the tab, pauses than closes the tab without error. the following errors occured: 
harun on 10.27.1.94 ended.
Unhandled pty write error [Error: EIO: i/o error, write] {
  errno: -5,
  code: 'EIO',
  syscall: 'write'
}

* closing a harness tab should terminate the harness, the remote connection and close the tab. the remote workspace should be removed as part of the remote teardown.

* reattaching to remote harness that has been detached works, but the screen is blank on reconnect. the transcript/history/current display has not been rendered on reconnect when it should.