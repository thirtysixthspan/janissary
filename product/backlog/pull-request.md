<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* collapsable tool sections in the connections tab should have both a command and reply section rather than two tool seperate tool sections

* provide more guidance to the subagent about generating and delineating a final result section so that it can be cleanly extracted and no thought processes or tool calls are included in the response to the caller. the delimiters themselved should not be returned to the caller, just the contents.

* supplement the subagents tool preamble to identify which standard harness tools are not enabled and should not be called. For example, ask sessions do not include access to the bash or shell tool.

* include the preamble that subagents receive in the connection tab transcript.
