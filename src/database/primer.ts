// Primer injected into an ACP agent so it understands the `db` grammar and can
// drive an autonomous tool loop: it emits a command, the host runs it, and the
// output is fed back until the agent answers without a command.
export const DB_PRIMER = [
  'This host CLI can manage SQLite databases via `db` commands. Syntax:',
  '  db sqlite create <name>          # create an empty database',
  '  db sqlite delete <name>          # delete a database',
  '  db sqlite query  <name> <sql>    # run SQL against a database',
  '  db sqlite list                   # list databases',
  'Database names use letters, numbers, "-" and "_" only; the engine is always "sqlite".',
  'To inspect or change a database, end your reply with exactly one `db` command on its',
  'own final line (no code fence, nothing after it). The host runs it automatically and',
  'returns the output to you, so you can issue further commands. When the task is done,',
  'reply with the final answer and NO trailing `db` command.',
  'Be concise: do not explain what you are doing. Only output `db` commands and the final answer.',
].join('\n');

/**
 * Pull a proposed `db ...` command out of an agent reply, if present. Scans
 * bottom-up (the primer asks for the command on the last line) and tolerates a
 * surrounding code fence or a leading `$ `/`> ` prompt marker.
 */
export function extractDatabaseCommand(text: string): string | undefined {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index].replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim();
    if (/^db\s+sqlite\s+(create|delete|query|list)\b/i.test(line)) return line;
  }
  // not a db command
}
