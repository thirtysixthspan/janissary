import { messageBus } from '../bus.js';

// Runs one command and collects the output of every transcript entry appended to `label` while it
// runs, in order. The one capture seam behind both a messaged command's reply and a plugin tab's
// dispatched line, so a fix to how output is read back lands in both.
//
// Counted from the append events rather than the log's length: a tab at its transcript cap drops its
// oldest entry on every append, so its length stops growing. With a limit, the wait ends there and
// the caller gets what was said so far; the command keeps running, and anything it says later lands
// in the tab's own record as it always would.
export async function executeAndCapture(
  label: string,
  run: () => Promise<void>,
  limitMs?: number,
): Promise<string[]> {
  const outputs: string[] = [];
  const subscription = messageBus.on('transcript', 'entry:appended', (event) => {
    if (event.type === 'entry:appended' && event.tabLabel === label) outputs.push(event.entry.output);
  });
  let limit: ReturnType<typeof setTimeout> | undefined;
  try {
    await (limitMs === undefined
      ? run()
      : Promise.race([run(), new Promise<void>((resolve) => { limit = setTimeout(resolve, limitMs); })]));
  } finally {
    clearTimeout(limit);
    subscription.unsubscribe();
  }
  return outputs;
}
