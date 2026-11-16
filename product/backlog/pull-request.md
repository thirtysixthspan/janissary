<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the shared-request debt by giving each provider attempt its own request object.

Existing Issue: `runWebSearch` creates one `WebSearchRequest` before the loop and passes the same object to every provider, while the subplan's per-manifest step builds the request and capability for each attempt and the plugin boundary is meant to expose only the data one attempt needs. Severity: 3/10

Existing Risk: 3/10 - A provider that normalizes or annotates its request in place silently changes the query, count, or depth a later fallback provider receives, and the mutable type accepts the change.

Proposal Risk: 1/10 - A provider can still mutate its own request, but the mutation is now confined to that attempt and no bundled provider relies on the shared object.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "give each provider attempt its own request object". In `src/web-search/search.ts`, move the `providerRequest` literal from before `for (const manifest of resolution.manifests)` to inside the loop, after the `deps.signal?.throwIfAborted()` call and next to the capability literal, so each attempt receives a fresh `{ query: request.query, numResults: request.numResults, depth: request.depth }`. `product/plans/complete/web-search-6-search-core.md` directs building the request and capability for each manifest, and the capability is already rebuilt per attempt. Extend `src/web-search/search.test.ts` with a first fake provider that mutates the request it receives (for example sets `numResults` to 1) and a second provider that succeeds; assert the second provider saw the command's original values and the output still renders from the command. The existing request-and-capability shape test and every fallback test must keep passing; no rendering or failure-line behavior changes.
