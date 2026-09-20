<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* when an agent is detached - the remote shell is terminated and when reattaching an error occurs:
Remote shell on 10.27.1.94 ended — start a new agent or shell to continue.

* closing a harness tab generates the following error
Unhandled pty write error [Error: EIO: i/o error, write] {
  errno: -5,
  code: 'EIO',
  syscall: 'write'
}
and fails to stop the remote harness or clear the workspace

