<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

*in the sessions tab and the metadata bar,
for showing the status of a connection, use the plug icon. 
the plug should be blue on dark for a detached connection.
the plug should be green on dark for an active connection.
the plug should be red on dark for a closed connection.
for a button to detach a connection, use the plug-circle-minus icon
for a button to reattached a connection, use the plug-circle-plus icon
for a button to terminate a connection, use the plug-circle-xmark icon

* in the UI, code and specs
where close, disconnect or detach are used to refer to closing the connection without terminating the remote agent or harnes, update the terminology to detach.
where open, create or connect are used to refer to creating a connection to a remote agent or harnes, update the terminology to create.
where reconnect or reattach are used to refer to establishing a connection to a remote agent or harnes previously detached, update the terminology to attach.
where stop, terminate, destroy or end are used to refer to ending a connection to a remote and terminating the agent or harnes previously created, update the terminology to terminate.

* closing a harness tab still generates the following error
Unhandled pty write error [Error: EIO: i/o error, write] {
  errno: -5,
  code: 'EIO',
  syscall: 'write'
}
and fails to stop the remote harness or clear the workspace
