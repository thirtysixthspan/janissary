# Make the manager teardown order an explicit, stated list

**Complexity: 4/10** — one ordered constant with a compile-time completeness check, one loop rewritten, one header comment corrected, and the tests that pin it. Small in surface, but it corrects a real teardown defect rather than only documenting the current order.

`Controller.shutdown` (`src/controller.ts:108`) does `Object.keys(this.managers).toReversed()` and calls `dispose?.()` on each, so teardown order is exactly the reverse of the assignment order in `createManagers` (`src/controller/create-managers.ts`). That file's header says only that "later managers may reference earlier ones via `this.managers` at call time, not construction time, so the object need not be fully populated yet" — an invitation to reorder. Two files hold contradictory beliefs about whether that order is load-bearing.

It is load-bearing, and it is currently wrong.

## The defect this exposes

`managers.remote` is assigned after `managers.pty`, `acp`, and `fileNavigator`, so `RemoteManager.dispose` — which closes every channel — runs **before** all three. And `RemoteChannel.send` (`src/remote/channel.ts:95`) returns early unless the channel is still `attached`:

| Manager | What its teardown sends | Where |
|---|---|---|
| `pty` | `{ type: 'kill', id }` per remote PTY | `src/remote/pty-session.ts:49` |
| `acp` | `{ type: 'acp-close', id }` per remote ACP session | `src/remote/acp-session.ts:74` |
| `fileNavigator` | a session close per remote navigator port | `src/file-navigator/remote-port.ts:43` |

All three are dropped on the floor at shutdown today. The processes they address live on another host, so nothing local notices — they are simply never told to stop.

## Goal

Teardown order is a stated list a reviewer can check against, a manager added without a position fails the build, and every manager that speaks over a remote channel while tearing down is disposed before the channel it speaks over.

## Design decisions

**One ordered constant beside the registry.** `MANAGER_DISPOSE_ORDER` lives in `src/managers.ts`, next to the `ManagerRegistry` type it orders, so the two are read together. `shutdown` iterates it instead of `Object.keys`.

**Completeness is a compile error, not a convention.** `as const satisfies readonly (keyof Managers)[]` rejects a name that is not a manager. The other direction — a manager with no position — is caught by an exported type-level assertion whose failure message names the missing key:

```ts
type Missing = Exclude<keyof Managers, (typeof MANAGER_DISPOSE_ORDER)[number]>;
export const MANAGER_DISPOSE_ORDER_IS_COMPLETE: [Missing] extends [never] ? true : Missing = true;
```

Types cannot see a duplicate entry, so "exactly once" is the one part left to a test.

**`remote` moves late rather than three managers moving early.** The rule is "the transport outlives everything that sends over it", and the cheapest expression of it is one move: `remote` goes after the last session-holding manager (`conversations`) and before the infrastructure tier (`questions`, `tab`, `database`). Moving `pty`, `acp`, and `fileNavigator` individually would fix the three known cases and leave the next channel user to rediscover this.

**Every other manager keeps its current relative position.** Only `remote` moves. The existing order is the one the app has been shipping, and a wholesale reshuffle would change behavior in ways no test covers — the point is to make the order *stated*, not to redesign it.

**`createManagers`'s header is corrected in the same change.** Its comment currently implies the assignment order is free to change; that is true again now, but only because teardown no longer derives from it, and the comment has to say so or the next reader draws the old conclusion from the old sentence.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The registry the order is keyed by | `ManagerRegistry` / `Managers`, `src/managers.ts` |
| The loop being replaced | `Controller.shutdown`, `src/controller.ts:108` |
| The `Record<Union, …>` completeness idiom this parallels | `CLIENT_FRAME_TYPES`, `src/remote/protocol.ts` |
| The dependent pair that motivates the fix | `PseudoterminalManager.closeAll` (`src/pseudoterminal-manager.ts:142`) → `RemoteChannel.send` (`src/remote/channel.ts:95`) |
| A test already pinning one ordered pair | `src/controller/create-managers.test.ts:44` |

## Implementation steps

1. **`src/managers.ts`.** Add `MANAGER_DISPOSE_ORDER` — all twenty-five keys, current relative order, `remote` moved after `conversations` — with a comment on each dependent group recording why it sits there: session and process owners first, the remote transport after everything that sends over it, and `questions`/`tab`/`database` last as the state the others read while tearing down. Add the completeness assertion below it.

2. **`src/controller.ts`.** Iterate `MANAGER_DISPOSE_ORDER` in `shutdown`.

3. **`src/controller/create-managers.ts`.** Extend the header comment: its order still governs construction-time references, and no longer determines teardown, which `MANAGER_DISPOSE_ORDER` states.

## Tests

- **`src/managers.test.ts`** (new) — `MANAGER_DISPOSE_ORDER` lists every registry key exactly once (the half the compiler cannot check), and `remote` comes after `pty`, `acp`, and `fileNavigator`, named individually so the regression that motivated this cannot come back quietly.
- **`src/controller.test.ts`** — `shutdown` disposes in the declared order, not in reverse construction order: attach a recording disposer to several managers and assert the sequence matches their positions in `MANAGER_DISPOSE_ORDER`. Its two existing shutdown cases must keep passing.
- **`src/controller/create-managers.test.ts`** — the `openFile`-before-`plugins` case keeps passing (both keep their relative positions); its title and comment name "reverse shutdown", a mechanism this removes, so the wording is corrected while the assertion stands.

## Out of scope

- **Giving `Managers` a real lifecycle protocol** — a dependency graph, or `dispose` returning a promise the shutdown awaits. The list is hand-maintained by design; this makes it visible, not automatic.
- **Reordering anything but `remote`.**
- **Making `RemoteChannel.send` report a dropped frame.** Worth considering, but it is a change to the channel's contract and every caller's error handling.
- **Awaiting remote acknowledgement of the kill/close frames.** `shutdown` is synchronous, and making it async reaches the CLI's exit path.
