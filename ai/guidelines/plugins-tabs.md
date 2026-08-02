# Tab plugin checklist

Use this checklist when adding or changing a bundled tab plugin. The binding v1 types live in
`src/plugins/api.ts`; wire types live only in `src/protocol.ts`.

## Shape and boundaries

- Keep the plugin under `src/plugins/<id>/` with `manifest.ts`, `shared.ts`, `server/`, and `client/`.
- Import files directly. Do not add an `index.ts` barrel.
- Keep the manifest data-only and free of top-level side effects.
- Server code may use Node built-ins, packages, `src/plugins/api.ts`, its own manifest/shared files,
  and the documented pure `src/openers/size.ts` helper. Do not import managers, controllers, tab
  sessions, transport code, or another plugin.
- Client code may use packages, `src/plugins/api.ts`, and its own manifest/shared files. Do not
  import `JanusClient`, host components, transport code, server modules, or another plugin.
- Treat bundled plugin code as host-trusted. Capabilities contain mistakes; they are not a sandbox.
  Do not add sockets, ports, routes, or file-serving paths around the existing security checks.

## Declaration and registration

- Declare a unique lowercase id, plugin semver, required `{ major, minor }` host API, positive
  payload schema version, tab label prefix, requested capabilities, and static contributions. Each
  tab's display title comes from its `openPluginTab` request, not from the declaration.
- Request every capability the plugin actually uses. Naming one v1 does not define is rejected before
  import; calling one the declaration omits disables the plugin like any other contract breach.
- Commands are unique case-insensitive first tokens with a word boundary. Core commands always win.
- Openers use first match. Extension and MIME claims must not collide with core or another plugin.
- Command and opener claims are the only v1 activation triggers.
- Add the manifest to `src/plugins/manifests.ts`.
- Add one literal dynamic server import to `src/plugins/server/loaders.ts` and one literal dynamic
  client import to `src/plugins/client/loaders.ts`. Keep loader/manifests parity tests passing.
- Never use filesystem discovery, constructed import paths, `import.meta.glob`, or eager behavior
  imports.

## Contract semantics

- `TAB_PLUGIN_API_VERSION` is the host contract; a plugin's own version is separate.
- Compatibility means equal API major and `host.minor >= required.minor`. Payload schema versions
  match exactly.
- Core routes resolve before plugin commands. One command invocation has one provider.
- Opener selection is first match, with duplicate claims rejected during registration.
- The host awaits a matched command/opener/intent. Wildcard files run sequentially in sorted order;
  separate invocations may overlap. A void return means completion without opening a tab.
- Server import plus activation has a 1,000 ms budget. Each user handler, validator, intent, and
  disposal boundary has 5,000 ms. Client import plus activation shares one 5,000 ms deadline.

## Tabs, payloads, and resources

- Open tabs only through `capabilities.openPluginTab`.
- Choose a stable instance key. The host checks it before invoking the payload factory, so dedupe
  cannot allocate a resource or perform plugin work.
- Register served files only inside the payload factory. Keep every returned ref in the payload;
  never send an absolute path as a fetch URL.
- Make payloads and intent payloads JSON-compatible and validate them in the plugin's single
  `shared.ts` guard on both server and client.
- Do not put the instance key, origin, or owned refs on the wire. Do not mirror wire types.
- Use the client capability's scoped `pluginIntent`; never let concrete UI choose another tab label.
- Do not use intent names beginning with `$host/`.
- Let the host own tab labels, title chrome, grouping, focus, pane placement, visibility, split,
  closing, and persistent mounting.
- Reuse the host's shared view-tab chrome (`image-tab`, `image-meta`, `image-stage` and their
  children, declared in `web/src/theme.css`) so a plugin tab matches every other view tab. Put
  anything beyond that in the plugin's own `.css` file next to its component, where it is emitted as
  a lazy chunk. Changing the shape of that shared chrome changes what plugin views depend on.

## Failure and lifecycle

- Keep every import, activation, validator, handler, reply validator, render, and disposer behind
  the host boundary.
- A plugin-caused throw, rejection, timeout, incompatible contract, or invalid plugin output must
  disable only that plugin for the rest of the process. Never retry before restart.
- Preserve the exact message `Tab plugin "<id>" disabled: <reason>.` with a single-line reason and
  one final period.
- Report to the live origin and the already-open notifications feed only. Never recreate or buffer.
- Invalid client envelopes or a validator returning false are ordinary RPC errors and do not
  disable the plugin. A validator throwing is plugin failure and does disable it.
- Release resources acquired during failed tab creation, on tab close, on disable, and on shutdown.
  Make plugin disposal idempotent.

## Versions and deprecation

- Additive optional API surface is a minor change. Removal, rename, tighter types/validation,
  observable order changes, or a frozen-fixture break is a major change.
- Ship a replacement before deprecating. Name the replacement and removal version immediately,
  warn once per process at use, and retain the old path for at least two minor releases.
- Update `documentation/developer-documentation/tab-plugin-api-changelog.md` for every API change.

## Required proof

- Keep `src/plugins/fixture-v1/` passing. A break requires an API-major decision.
- Test manifest/loader parity, version compatibility, collisions, lazy exactly-once activation,
  concurrency, timing, timeouts, late disposal, process-lifetime disablement, exact reporting,
  notification policy, intent validation/replies, resource cleanup, and idempotent shutdown.
- Test command resolution through the shared command registry, async rejection observation, capture
  callback timing, opener selection, file-navigator metadata, and static MIME composition.
- Test the client loading fallback, unknown id, invalid payload, rejected/timed-out chunk, render
  exception, one `$host/client-failure`, no retry, sibling isolation, stable mounting, hidden and
  split placement, and no active-body duplicate.
- Preserve plugin-specific behavior tests beside the plugin.
- Update `product/specs/tab-plugins.md`, affected behavior specs, the contributor API reference, and
  this checklist.
- Run `./scripts/run.mjs check-diff`, `npm run check:full`, `npm run security:sast`,
  `npm run build:web`, and `npm run docs:build`. Inspect production assets to confirm concrete
  plugin JavaScript and CSS stay outside the entry assets.
