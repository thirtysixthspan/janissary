#!/usr/bin/env node
// PreToolUse hook for the Bash tool. Deterministically blocks shell constructs
// that can't be statically permission-checked and that stall unattended runs
// (see ai/build-a-feature.md "Shell hygiene"). Complements that documented
// guidance with enforcement the agent can't drift from.

const CHECKS = [
  {
    name: "pipe",
    test: (cmd) => cmd.includes("|"),
    message: "contains a pipe (|)",
  },
  {
    name: "command substitution",
    test: (cmd) => cmd.includes("$(") || cmd.includes("`"),
    message: "contains command substitution ($(...) or `...`)",
  },
  {
    name: "redirect",
    test: (cmd) => />|</.test(cmd),
    message: "contains a redirect (>, >>, 2>, 2>&1, or <)",
  },
  {
    name: "chaining",
    test: (cmd) => cmd.includes("&&") || cmd.includes(";"),
    message: "contains && or ; chaining",
  },
  {
    name: "loop",
    test: (cmd) => /\bfor\s/.test(cmd) || /\bwhile\s/.test(cmd),
    message: "contains a for/while loop",
  },
  {
    name: "variable expansion",
    test: (cmd) => /\$\{?[A-Za-z_]/.test(cmd),
    message: "contains variable expansion ($VAR or ${VAR})",
  },
  {
    name: "direct node script invocation",
    test: (cmd) => /\bnode\s+scripts\//.test(cmd),
    message: "calls a script via `node scripts/...` directly instead of `./scripts/run.mjs <name>`",
  },
];

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const raw = await readStdin();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
if (typeof command !== "string" || command.length === 0) {
  process.exit(0);
}

const violation = CHECKS.find((check) => check.test(command));

if (violation) {
  const reason =
    `Blocked: command ${violation.message}. This construct can't be statically permission-checked ` +
    `and stalls unattended runs. Split the command into separate plain commands on their own lines, ` +
    `or use the Read tool instead — see ai/build-a-feature.md "Shell hygiene".`;
  process.stderr.write(reason + "\n");
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

process.exit(0);
