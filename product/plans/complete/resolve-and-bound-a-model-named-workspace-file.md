# Resolve and bound a model-named workspace file before reading it

A chart may draw from a file the agent acquired, and the host read that file by name. The containment check was purely lexical — `path.resolve` against a `realpathSync`'d base, with no `realpathSync` on the target — so a symlink the agent created inside its own workspace passed and the unsandboxed host read straight through it. `ln -s ~/.aws/credentials data.json` is one command away from a file whose contents the next prompt ships to the model, which is precisely what the spec said could not happen. The same lexical pass admits a link to `/dev/zero`, and `acquire` calls the read synchronously from inside the reply handler, so the host blocked the event loop on it. A file that is not a regular file, or one past a size a source is held to, had no check either.

`readWorkspaceFile` in `src/visualizations/reading.ts` now:

- wraps its whole body in a `try`, so a missing workspace is reported as a reason rather than thrown at three call sites that discard the promise;
- resolves the target through `realpathSync` after the lexical check and holds *that* to the workspace, the way `src/visualizations/fetch.ts`'s `resolvedTarget` does for a local source;
- refuses anything that is not a regular file;
- refuses a file past a named eight-megabyte ceiling, the same bound `fetch.ts` applies to a source, stated in the comment as the reason a model-named file is untrusted twice over.

A link that points back inside the workspace still resolves and is read.

`src/visualizations/reading.test.ts` gains cases for a link pointing out of the workspace, a link pointing back in, a directory, a file past the cap, and a missing workspace. The spec's claim that the agent cannot read a credential file the host's own read could not have read is restated to describe the check that now actually runs, and the user documentation's line about pointing at a credentials file is removed because the spec no longer overstates the boundary.
