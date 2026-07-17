// The dialog's field values, assembled into the equivalent `harness …` command.
export type HarnessLaunchFields = {
  name: string;
  label: string;
  workspace: boolean;
  offline: boolean;
  autoApprove: boolean;
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
  if (fields.workspace) parts.push('-w');
  if (fields.offline) parts.push('--offline');
  if (fields.autoApprove) parts.push('-y');
  if (fields.model) parts.push('--model', fields.model);
  const effort = fields.effort.trim();
  if (effort) parts.push('--effort', effort);
  return parts.join(' ');
}
