<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* the command and reply are not correct, they are mixed up with multiple commands coming in as command and reply, or multiple replies coming in as command and reply. for example:
make two file requests in a single message to list content in the root directory
thought
The user wants two file requests in a single message to list content in the root directory. Earlier, step limit may reset with a new user message. Let me issue two `file list .` commands.
message
```janissary file list . ``` ```janissary file list . ```
tool
command
file list .
reply
file list .
tool
command
dir drwxr-xr-x 160 2026-11-15T20:34:51.640Z .claude
... remainder of response
reply
dir drwxr-xr-x 160 2026-11-15T20:34:51.640Z .claude
... remainder of response

* the acp preamble should not be sent with every query, only once when the connection is established as context. The preamble should be rendered in the acp connection as a separate preable section, similar to how the final reply is rendered separately.

* the model may issue a reply before all queries have a response, and then follow up afterward when subsequent information comes in from other queries. the additional replies should also be rendered. by accepting multiple queries and answering async, the model may also make multiple async responses, not a single final response.


 


