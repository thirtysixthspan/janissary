import type { TabView } from '../protocol/tab.js';

// The rule a user-typed tab name follows, shared by the server and the web client through the
// `@shared` alias so the two cannot drift: a name means a tab whose label or display alias (see
// `rename`) equals it, ignoring case. Typed over the two fields both the server `Tab` and the wire
// `TabView` carry, and free of runtime imports so the client bundle can load it.

export type NamedTab = Pick<TabView, 'label' | 'title'>;

export function matchesLabelOrAlias(tab: NamedTab, name: string): boolean {
  const key = name.toLowerCase();
  return tab.label.toLowerCase() === key || tab.title?.toLowerCase() === key;
}
