# Use shared path containment for the static asset boundary

**Complexity: 2/10** — 1 production file, 4 requirements and 4 test scenarios (p=3.95); a small, localized clamp replacement with no new modules.

The static file server clamps a requested asset with a character-prefix test (`file.startsWith(options.webDir)`) while the rest of the application uses one component-aware containment rule in `src/path-containment.ts`. The asset boundary is therefore defined twice, and a directory whose name merely shares the bundle directory's prefix can pass a prefix test that compares characters rather than path components.

## Goal

The built web UI's assets are served only from paths that sit inside the bundle directory by the same `containedAbsolute` rule every other file-serving path uses. A request that resolves outside the bundle directory — including one through a sibling whose name shares the bundle directory's prefix or through `../` segments — is answered with the SPA shell instead of a file outside the bundle. The `/open/<id>` route keeps its separate token and controller allow-list guard, and the origin gate and SPA fallback keep behaving as before.

## Approach

- In `src/serve-static.ts`, import `containedAbsolute` from `./path-containment.js` and resolve `options.webDir` once into an absolute `root` when `staticFileServer` is built, rather than re-deriving it per request.
- Build the requested file with `path.resolve(root, rel || 'index.html')` and accept it only when `containedAbsolute(root, file)` holds. Rejected paths fall back to `path.join(root, 'index.html')`, preserving the SPA behavior for client routes and unknown assets. Use the same resolved `root` for the index fallback read.
- Leave the `/open/` branch, its token check, the controller `openFilePath` allow-list, the origin gate, the MIME table, and the security headers untouched.
- Add cases to `src/index.test.ts` that give the bundle directory a sibling sharing its prefix and that send a URL containing `../` segments, asserting the shell is served and no file from outside the bundle directory is returned.

## Implementation steps

1. Update `src/serve-static.ts`: import `containedAbsolute`, compute the absolute root once, replace the `startsWith` clamp with a containment check, and use the root for the index fallback.
2. Run `check-diff`.
3. Add the two traversal/prefix-sibling cases to `src/index.test.ts`.
4. Run `check-diff` again; all checks must pass.

## Tests

- `src/index.test.ts`: a sibling directory whose name shares the bundle directory's prefix, holding a secret file, is never served — such a request answers with the shell and does not contain the secret.
- `src/index.test.ts`: a URL carrying `../` segments cannot escape the bundle directory — the shell is served and no outside file is read.
- Keep the existing SPA-fallback, origin-rejection, `/open/` token/allow-list, and malformed-URL cases passing unchanged.

## Spec

`product/specs/open.md`: add a short subsection stating that the built web UI's assets are served only from within the bundle directory using the same component-aware containment rule as other file-serving paths, and that any path resolving outside it — including a prefix-sharing sibling or a `../` escape — answers with the SPA shell while the `/open/` route keeps its own token and allow-list guard.

## Out of scope

Changing the `/open/` route's token or allow-list behavior, the origin gate, the MIME table, the security headers, the SPA fallback behavior for ordinary unknown paths, or any change to `src/path-containment.ts` itself.
