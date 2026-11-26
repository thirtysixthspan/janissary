<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the Hosts tab spec and in-app help so the metadata bar section includes the new Import and Export buttons.

Existing Issue: product/specs/hosts-tab.md's "The Hosts tab" paragraph enumerates only Refresh and New host between the Split control, and help/hosts.md's empty-state and creation bullets name only Refresh, New host and Split, so neither in-application reference describes the two buttons this commit adds to that bar. Severity: 5/10

Existing Risk: 4/10 - A reader of the spec or the help cannot discover the import and export entry points from the application's own references, and a contributor rebuilding the metadata bar from the spec would omit both controls and leave the registered intents unreachable from the UI.

Proposal Risk: 1/10 - The change is prose only and leaves web/src/plugins/hosts/HostList.tsx and its tests untouched, so a wrong sentence would pass every test and surface only when someone compares the documents with the rendered header.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "sync the Hosts tab spec and help with the new Import and Export buttons". In product/specs/hosts-tab.md, extend the "The Hosts tab" paragraph that names Refresh and New host in the metadata bar to state that icon-only Import from ssh config and Export to ssh config buttons sit after New host and before Split, remain present with an empty list, and fire their intents in one click with the outcome reported as a Hosts-tab notification and no dialog, busy state, or new chord. In help/hosts.md, change the empty-state bullet that says "Refresh, New host and Split still work" to include both new buttons, and add a short use-case line explaining that Import and Export act on the default ~/.ssh/config in one click and report the result in the notification feed. Leave the command Usage block, the grammar wording, src/plugins/hosts/ssh-intents.ts, and web/src/plugins/hosts/HostList.tsx unchanged. Verify by reading both documents against the rendered header in web/src/plugins/hosts/HostList.tsx and the intent-call assertions in web/src/plugins/hosts/HostList.test.tsx, which must keep passing untouched, and confirm no claim is made about operands or dialogs that the client and the server runner do not implement.
