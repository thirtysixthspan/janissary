# A reserved browser port band, denied to every confined harness

**Complexity: 6/10** — seven source files, eight test files, one spec, one documentation page. No new subsystem: the port allocator and the profile builder both already exist and both get smaller. The care is in three places — the band has to be the tail of the dynamic range so the guard range stays contiguous, the modulo walk has to survive a draw from outside its own range, and the new allocation failure has to reach `onGone` without breaking `startE2EBrowserServer`'s promise never to throw.

## Goal

No confined workspaced harness can open a TCP connection to any e2e browser's private Playwright port — not its own tab's, and not another tab's — whether or not that harness was launched with `-b`.

Today the deny covers exactly one port, bound at spawn time from `options.browserPort`. A Seatbelt profile is fixed for the life of the process it wraps, so a per-launch parameter can never name a browser that started afterwards, and a harness launched without `-b` gets the plain profile and is denied nothing at all. Both holes close the same way: the set of ports a browser can bind becomes known statically, so the deny can name it without knowing anything about any particular launch.

## Approach

Reserve a fixed contiguous band at the top of the dynamic port range and draw every browser port from it alone. Guard ports keep drawing from everything below the band, so the endpoint the harness is handed stays reachable and the guard remains the only transport route to the browser.

The profile then denies the whole band, statically, on every confined workspaced spawn. That deletes far more than it adds: `SandboxOptions.browserPort`, its `-D BROWSER_ENDPOINT` binding, the two `_WITH_BROWSER` profile variants, the profile-selection branch, and the `browserPort` field threaded through `harnessSpawnEnv`, `PseudoterminalManager.spawn`, the harness manager, and the remote spawn path all go. Nothing about a browser has to reach the sandbox any more.

The band is deliberately small. It caps concurrent browsers at its size and it costs one profile clause per port, so it is sized for what a machine can actually run rather than for the 8,192 the current allocator would permit.

## Design decisions

1. **The band is 256 ports at the top of the dynamic range: 65,280–65,535.** Placing it at the tail leaves the guard range contiguous (49,152–65,279, 16,128 ports) instead of splitting it in two, which keeps the allocator's forward walk a single modulo over one interval. 256 concurrent headless Chromium instances on one host is already far past what a machine will run, and at roughly 32 characters per clause the band costs about 8KB on a profile that is currently 17KB — nowhere near the 1MB macOS argument limit, and the profile travels as a single `-p` argument.

2. **One `(remote ip "localhost:<port>")` clause per band port, enumerated.** Seatbelt's `remote ip` filter takes a host and a port, with no range syntax. The two compact alternatives are both wrong: `localhost:*` would deny a harness every loopback service including the local dev server it is there to test, and binding browsers to a second loopback address like `127.0.0.2` needs an `ifconfig` alias the host does not have by default.

3. **The deny applies to every confined workspaced spawn, not only `-b` ones.** This is the half of the fix that closes the second hole. It also removes the only reason the sandbox ever needed to know a port, which is what lets `SandboxOptions.browserPort` and its threading go. The offline profile gets the clause too even though `(deny network*)` already covers it: keeping the two profiles structurally identical below the network line means a later change to the offline clause cannot silently drop the boundary.

4. **The band constants live in `src/sandbox/browser-ports.ts`, a new module both sides import.** The profile has to name the band and the allocator has to draw from it, and they sit in different directories. `src/browser/` already imports from `src/sandbox/`, so putting the constants under `src/sandbox/` keeps the dependency pointing the way it already does — a profile module reaching into browser code would invert it. The module also exports the built deny clause text, the same way `src/sandbox/paths.ts` exports built clauses for the path rules.

5. **`claimPort` normalizes the drawn value into its own range before walking.** It becomes range-parameterized (`first`, `count`) so one function serves both the band and the guard range, and `(drawn - first) % count` is negative in JavaScript whenever `drawn` sits below `first`. The existing suite mocks `randomInt` to a single constant for both draws, so a guard-range draw reaching the band walk is not hypothetical — without the normalization it would hand out a port below the band and quietly defeat the whole change.

6. **The guard and the browser now draw from disjoint ranges, so they cannot collide.** The explicit "if they came out equal, move the browser one along" step goes away as dead code. The test that pins the property stays: it is now structurally guaranteed rather than defended, and the test is what says so.

7. **An exhausted band throws rather than falling back outside it.** The current allocator hands back the drawn port when everything is spoken for, on the reasoning that a failed bind is a reported failure and better than a launch never attempted. Inside a band that reasoning inverts: a fallback that leaves the band binds a port no profile denies, which is exactly the hole being closed. A collision inside the band is the safe failure and is already reported, but throwing is clearer and is what the recorded finding asks for.

8. **The throw is caught at the top of `startE2EBrowserServer`, before anything is acquired.** That function documents that it never throws, because its caller is part-way through building a tab. The allocation is its first statement and nothing has been acquired when it fails, so the failure is reported by calling `options.onGone` directly and returning a handle whose `close` is a no-op — `newSession`/`stopSession` exist for the case where something *was* acquired. Every other failure path stays exactly as it is, including the deliberate behavior that `JANISSARY_BROWSER_WS_ENDPOINT` is still set when the guard or the child fails after the ports were allocated.

9. **`E2EBrowserServer.browserPort` is removed rather than kept for its test.** Its only purpose was feeding `SandboxOptions.browserPort`. The property its test pinned — that the private port never appears in the harness's environment — is worth keeping and is re-expressed against the guard mock's recorded `upstreamPort`, which needs no new surface.

10. **A harness's own loopback services stay reachable.** The band is 256 ports at the very top of the ephemeral range, so a dev server on 3000, 5173, or 8080 is unaffected. A harness that binds a listener inside the band and then connects to it would be denied; that is a real if unlikely cost, and it belongs in the spec rather than in a comment.

## Implementation steps

1. **Add `src/sandbox/browser-ports.ts`.** Export `BROWSER_PORT_BAND_FIRST` (65,280), `BROWSER_PORT_BAND_COUNT` (256), a derived `BROWSER_PORT_BAND_LAST`, and `BROWSER_PORT_BAND_DENY` — the `deny network-outbound` form carrying one `(remote ip "localhost:<port>")` filter per band port, built by mapping over the band. Comment why the band exists, why it sits at the tail of the dynamic range, and why the ports are enumerated rather than expressed as a range (decisions 1, 2).

2. **`src/sandbox/profile.ts`.** Import `BROWSER_PORT_BAND_DENY` and interpolate it immediately after `${networkClause}` in `buildProfile`, so it lands after the general network rule and wins under "last matching rule wins". Drop the `browserClause` parameter, `BROWSER_NETWORK_DENY`, `SANDBOX_PROFILE_WITH_BROWSER`, and `SANDBOX_PROFILE_OFFLINE_WITH_BROWSER`. Replace the old constant's comment with one saying the deny covers the whole band unconditionally and why that is what makes it hold for a browser started after this process (decision 3).

3. **`src/sandbox/index.ts`.** Delete the `browserPort` field from `SandboxOptions`, the `if (options.browserPort !== undefined)` profile-selection branch, the conditional `-D BROWSER_ENDPOINT=` entry, and the two now-unused profile imports.

4. **`src/browser/e2e-ports.ts`.** Import the band constants. Derive the guard range as the dynamic range below the band. Give `claimPort` `first`/`count` parameters, normalize the drawn offset with `((drawn - first) % count + count) % count`, and return `undefined` instead of falling back to the drawn port (decisions 5, 7). In `allocateBrowserPorts`, draw the browser port from the band and the guard port from the range below it, throw a message naming the band and its size when either comes back `undefined`, releasing the browser port first if the guard draw is the one that failed. Delete the equal-ports fallback (decision 6). Update the module header: the reservation is still the whole mechanism, but the band and the reason for it are now part of what it promises.

5. **`src/browser/e2e-server.ts`.** Remove `browserPort` from `E2EBrowserServer` and from the returned object. Wrap the `allocateBrowserPorts()` call in a `try`/`catch` that reports through `options.onGone` and returns `{ env: {}, handle: { close: () => {} } }` (decisions 8, 9). Leave the rest of the function, including the existing `try` around scratch/guard/child, untouched. Update the type's comment, which currently explains why the port is returned.

6. **Unthread `browserPort`.** `src/harness/scratch-dir.ts`: drop the field from `HarnessSpawnEnv` and from `harnessSpawnEnv`'s return. `src/harness/manager.ts`: drop the eighth argument at the `pty.spawn` call. `src/pseudoterminal-manager.ts`: drop the `browserPort` parameter and the property it set on the sandbox options. `src/remote/serve-processes.ts`: drop the conditional spread.

7. **`product/specs/sandbox.md`.** Rewrite the second paragraph of the End-to-end browser section. It currently says the profile denies "that specific port", that the port travels as Janissary-only spawn metadata, and that spawns without a browser use a profile with no deny. Replace with: browsers bind inside a fixed reserved band, every confined workspaced spawn denies the whole band whether or not it has a browser, so no confined harness reaches any browser — its own tab's or another's — and the guard is the only transport route. State the two costs the band buys that: a fixed ceiling on concurrent browsers, where a launch that finds no free port fails and is reported rather than binding outside the band, and loopback ports inside the band being unreachable from a confined harness. Leave the "Where confinement does not apply" paragraph alone — it is the subject of a separate backlog entry and its port claim stays true under this change.

8. **`documentation/user-documentation/advanced-agents/harness.md`.** The containment paragraph says the harness is blocked from connecting to "the browser's private port". Make it every e2e browser's private port, its own tab's and every other tab's. Do not touch the paragraph below it about `--no-workspace`, which belongs to a different entry.

## Tests

`src/browser/e2e-ports.test.ts` — four cases beside the existing five, which must all keep passing unchanged:

- Every browser port lies inside the band and no guard port does, across several launches.
- A draw that lands inside the band still yields a guard port outside it, driven with `mockReturnValueOnce` so the guard's draw is a band value.
- A band drawn down to its last port still allocates, and the next allocation throws with a message naming the band.
- The guard range survives the band being full: with the band exhausted, the throw happens before any guard port is reserved, so a later allocation after a release gets one.

`src/sandbox/index.test.ts` — rewrite the two cases that pin the parameterized shape:

- "selects and binds the browser profile only when a private port exists" becomes a case that every confined workspaced spawn gets `SANDBOX_PROFILE` (or `SANDBOX_PROFILE_OFFLINE`), that no `-D BROWSER_ENDPOINT` param is ever emitted, and that there is no browser-specific profile variant to select.
- "only browser variants deny their parameterized endpoint after the general network rule" becomes a case that both profiles carry the band deny, that it sits after `(allow network*)` / `(deny network*)`, and that it names the first and last band ports and not the port just below the band.

`src/sandbox/browser-port.sandbox.test.ts` — rewrite the single case into the one that fails today: bind two listeners on two different band ports, then from one workspaced spawn that owns neither, confirm `nc` is refused to both and still succeeds against an ordinary loopback port outside the band. Binding has to be explicit rather than port 0, so the test picks band ports and skips if either is already taken on the host.

`src/browser/e2e-server.test.ts` — replace the `server.browserPort` assertions with the same property expressed against `guardCall(0).upstreamPort`, and add a case that an allocator throw is reported through `onGone` and returns an environment carrying no endpoint, with `close()` safe to call.

`src/harness/scratch-dir.test.ts`, `src/harness/manager.test.ts`, `src/pseudoterminal-manager.test.ts`, `src/remote/serve-processes.test.ts` — drop the `browserPort` fixtures and assertions. `serve-processes.test.ts`'s "not to have property browserPort" case is asserting the absence of a field that no longer exists, so it goes rather than being inverted.

## Out of scope

- The `--no-workspace` and unconfined-browser wording in the spec's "Where confinement does not apply" paragraph and in the harness page's second containment paragraph. That is a separate backlog entry on this branch, and its claims stay true here.
- Making the browser's private transport unreachable by construction — a Unix socket, or an authenticated discovery route. The band deny is a Seatbelt boundary and still does nothing on a host without Seatbelt, which is what the protocol guard is for.
- Raising or making configurable the concurrent-browser ceiling the band imposes.
- The guard's own port, which stays reachable from every harness by design.
- `src/sandbox/browser-profile.ts` and the browser child's own profile, which are unaffected: the child binds its port rather than connecting to one, and the guard runs unsandboxed in the server process.

## Verification

`./scripts/run.mjs check-diff` after each step.

`npm run test:sandbox` is the only place the boundary meets a real Seatbelt profile, and the rewritten `browser-port.sandbox.test.ts` is the case that fails before this change and passes after. Run it explicitly; the diff-scoped runner does not.

By hand: open two `-b` harness tabs, and from the first one attempt a TCP connection to the second's browser port. It should be refused, where today it connects. Then open a third harness tab without `-b` and confirm it is refused both. Confirm each tab's own browser still works through its guard endpoint, and that an ordinary loopback service the harness starts on a conventional port is still reachable from inside it.
