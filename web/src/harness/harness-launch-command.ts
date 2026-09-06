// The dialog's field values, assembled into the equivalent `harness …` command.
export type HarnessLaunchFields = {
  name: string;
  label: string;
  workspace: boolean;
  offline: boolean;
  autoApprove: boolean;
  // `-b`: start a headless browser for the tab and inject the endpoint the harness drives it
  // through. Accepted for every harness, so unlike auto-approve there is no per-harness disabling.
  browser: boolean;
  model: string;
  effort: string;
};

// Assemble the `harness <name> …` command string from the dialog's field values, submitted through
// the normal `command` RPC so the server's existing parsing/validation/launch runs unchanged.
//
// Values are inserted verbatim, NOT shell-quoted: this string is re-parsed by the server's
// whitespace-splitting `parseHarnessCommand`, which does not unquote — so quoting a value would
// corrupt it (the quotes would become part of the token) rather than protect an embedded space.
// Model options come from a fixed catalog and effort levels are short tokens, so spaces do not
// arise for those in practice; a label with a space is the user's own freeform text.
export function buildHarnessLaunchCommand(fields: HarnessLaunchFields): string {
  const parts = ['harness', fields.name];
  const label = fields.label.trim();
  if (label) parts.push('as', label);
  if (!fields.workspace) parts.push('--no-workspace');
  if (fields.offline) parts.push('--offline');
  if (fields.browser) parts.push('-b');
  if (!fields.autoApprove) parts.push('--no-auto-approve');
  if (fields.model) parts.push('--model', fields.model);
  const effort = fields.effort.trim();
  if (effort) parts.push('--effort', effort);
  return parts.join(' ');
}
