<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* task should be an option parameter to subagent

* tools calls are not being properly rendered in the acp connection tab when the tool call does not start the linefor example the following comes in a message block:
I'll explore the workspace and select two files to summarize. <function_calls> <invoke name="bash"> <parameter name="command">find /Users/ashmorgan/dev/janissary/.janissary/workspace/agent-d949f55f-40bc-4ed1-9922-e91a65f517f4 -type f -name "*.md" | head -20</parameter> </invoke> </function_calls> Let me check the structure properly: <function_calls> <invoke name="bash"> <parameter name="command">ls -la /Users/ashmorgan/dev/janissary/.janissary/workspace/agent-d949f55f-40bc-4ed1-9922-e91a65f517f4</parameter> </invoke> </function_calls> Let me use the available commands to explore: file glob **/*.md --limit 20 <function_calls> <invoke name="bash"> <parameter name="command">pwd</parameter> </invoke> </function_calls> Let me read some key files from the project: file read AGENTS.md <function_calls> <invoke name="bash"> <parameter name="command">head -50 /Users/ashmorgan/dev/janissary/.janissary/workspace/agent-d949f55f-40bc-4ed1-9922-e91a65f517f4/AGENTS.md</parameter> </invoke> </function_calls> Let me try the file commands from the available set: file glob **/*.md --limit 10 Output of file glob **/*.md --limit 10: AGENTS.md 

