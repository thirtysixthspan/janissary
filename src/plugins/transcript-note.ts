import type { Managers } from '../managers.js';
import type { PluginFailureOrigin } from './failure.js';

// A line a plugin raised with no client waiting on it goes to the transcript of the tab it was
// raised from, which is where a user would look for it — exactly as a rejected command does. A menu
// or a navigator selection sends its request and moves on, so there is no socket left to answer.
//
// The tab is checked first because the user may have closed it in the moment between the request and
// its outcome, and appending to a label nothing holds would either fail or land on a tab that has
// since been reopened for something else.
export function noteInOriginTab(
  managers: Managers, origin: PluginFailureOrigin, output: string,
): void {
  if (managers.tab.tabs.some((tab) => tab.label === origin.label)) {
    managers.tab.append(origin.label, { input: origin.command, output });
  }
}
