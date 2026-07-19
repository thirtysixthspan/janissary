import type { MonitorSuggestion } from '../types.js';
import type { MonitorSub } from './manager.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { monitorTabs } from './window.js';

// Suggestion lookup/mutation across monitor reporting tabs, split out of window.ts: a distinct
// concern from tab creation/lifecycle that remains there.

// Find a suggestion anywhere in the monitor feeds by id.
export function findSuggestion(managers: Managers, id: string): MonitorSuggestion | undefined {
  return monitorTabs(managers)
    .flatMap((t) => t.monitor!.suggestions)
    .find((s) => s.id === id);
}

// Remove a suggestion from whichever feed holds it (thumbs-down).
export function removeSuggestion(managers: Managers, id: string): void {
  for (const tab of monitorTabs(managers)) {
    const before = tab.monitor!.suggestions.length;
    tab.monitor!.suggestions = tab.monitor!.suggestions.filter((s) => s.id !== id);
    if (tab.monitor!.suggestions.length !== before) messageBus.emit('state', { type: 'dirty' });
  }
}

// Run a suggestion's command in the tab the suggestion is about (a clicked command
// line). The suggestion stays in the feed — the history of what was suggested (and run)
// is part of the record. Monitor tabs themselves never execute commands.
export function runSuggestion(managers: Managers, id: string): void {
  const suggestion = findSuggestion(managers, id);
  if (!suggestion?.command) return;
  managers.command.dispatchTo(suggestion.about, suggestion.command);
}

// Thumbs up/down on a reporting-tab suggestion. The rating is fed back to the monitor through its
// normal batched prompt channel (queued on the owning monitor's buffer, no extra ACP round-trip),
// so the AI learns what the user found useful. Rating a suggestion means the user is done with it,
// so either direction removes it from the feed.
export function rateSuggestion(monitors: Iterable<MonitorSub>, managers: Managers, id: string, up: boolean): void {
  const suggestion = findSuggestion(managers, id);
  if (!suggestion) return;
  const reg = [...monitors].find((r) => !r.inline && r.persona.name === suggestion.persona);
  reg?.buffer.push({
    tabLabel: suggestion.about,
    entry: { input: '', output: `[user feedback] The user rated your suggestion "${suggestion.text}" as ${up ? 'helpful (thumbs up)' : 'not helpful (thumbs down)'}.` },
  });
  removeSuggestion(managers, id);
}
