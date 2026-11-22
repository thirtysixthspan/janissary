<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the launcher has the ask role but no tools. The preamble should explain the ask tools but incorrectly states:
You have no tools; answer in prose.
Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown.

* for acp connection tabs, the response to the query should be rendered as an expandable block that is expanded by default.
 
* there are two acp sessions started for a query from the editor - both are listed in the connections tab but only one in the connections popup. Only a single connection - the role based connection - should be launched and listed. The goal is to replace entirely the legacy connection. The role based connection should be given the persona's instructions and the response should be extracted.

