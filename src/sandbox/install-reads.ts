// The read rule covering code the sandboxed process itself runs, as opposed to the project data it
// works on: its own executable, the node binary janissary hands it, and the directories janissary
// ships — its Playwright client, its `ai/` prompts, its `scripts/` runner. All of it is program text
// rather than user data, none of it is writable, and every entry is here for the same shape of
// reason: a path the process must be able to open to function, which the `$HOME` content deny in
// `profile.ts` would otherwise catch because a harness or a janissary installation commonly lives
// under `$HOME`.
//
// A separate `allow` form rather than more lines inside the profile's own read rule. Seatbelt's
// rules are additive and "last matching wins", and this one sits immediately before that rule with
// no `deny` between them, so splitting it out changes nothing about what is permitted — the secret
// denies still come after both. The params it names are bound in `index.ts` alongside the rest.

export const INSTALL_READ_RULE = `; A process reading its own executable (and the directory it lives in) is always safe to allow —
; frameworks the process links against may reopen its own binary for introspection (e.g. Keychain's
; SecItemCopyMatching calls CFBundleGetMainBundle, which does exactly this to determine code identity
; for ACL matching). Harness binaries installed under $HOME (nvm, ~/.opencode/bin, …) would otherwise
; fail that self-read and the harness would appear logged out even with a valid Keychain item.
; SERVER_NODE_DIR_L/R (the janissary server's own process.execPath directory) is carved in for the
; same self-read reasoning, and so a script running inside the sandbox can invoke the known-good
; node at JANISSARY_NODE (see index.ts) instead of relying on PATH resolution inside the
; sandboxed process, which doesn't always find a working node first.
; PLAYWRIGHT_DIR/PLAYWRIGHT_CORE_DIR are janissary's own copy of the Playwright client, which a
; harness launched with -b imports from JANISSARY_PLAYWRIGHT to drive the e2e browser (see
; src/browser/e2e-server.ts). Client and server must be the same version to connect, and a fresh
; workspace clone has no node_modules until the AI installs them, so the project's own copy cannot
; be relied on. playwright-core is carved in separately because it is playwright's only runtime
; dependency and in a hoisted layout sits as a sibling rather than nested, so the parent alone
; leaves every internal require denied. Unconditional rather than gated on -b: gating it would
; mean threading a field through SandboxOptions, spawnPty, PseudoterminalManager.spawn, and the
; remote's spawn path to withhold read access to two directories of janissary's own dependency tree
; that hold no user data.
; JANISSARY_AI_L/R is the running installation's own ai/ directory — the guidelines, personas, and
; executable task prompts that ship with janissary — in both literal and realpath-resolved form,
; since an npm-global install is commonly reached through a symlinked prefix. The task picker inserts
; an execute command naming $janissary/ai/tasks/ for a built-in task (see product/specs/task-picker.md), and
; without this the agent cannot open the file it was just told to run: an installation under $HOME
; (a global npm prefix, or a development checkout) falls under the $HOME content deny in profile.ts.
; Deliberately ai/ alone rather than the whole install root — that directory is prompts written to be
; read by an agent and holds no user data, while node_modules and the rest of the tree stay denied.
; Read-only, like every other janissary directory here: an agent that could write these prompts could
; rewrite what a later unsandboxed run follows.
; JANISSARY_SCRIPTS_L/R is that same installation's scripts/ directory, on the same terms and for the
; same reason one step further along: those task prompts tell the agent to run
; $janissary/scripts/run.mjs, so the runner and the scripts it dispatches to have to be readable too,
; or the prompt names a command the agent cannot execute. The scripts act on the agent's own working
; directory — the project — while coming from the installation, which is what makes reaching for them
; through $janissary correct rather than merely possible. Read-only for a sharper version of the same
; reason as ai/: these are executed, not just read.
(allow file-read-data file-read-xattr
  (subpath (param "SELF_DIR_L"))
  (subpath (param "SELF_DIR_R"))
  (subpath (param "SERVER_NODE_DIR_L"))
  (subpath (param "SERVER_NODE_DIR_R"))
  (subpath (param "PLAYWRIGHT_DIR"))
  (subpath (param "PLAYWRIGHT_CORE_DIR"))
  (subpath (param "JANISSARY_AI_L"))
  (subpath (param "JANISSARY_AI_R"))
  (subpath (param "JANISSARY_SCRIPTS_L"))
  (subpath (param "JANISSARY_SCRIPTS_R")))`;
