import { useEffect, useRef } from 'react';
import type { TabView } from '@shared/protocol';
import { isReportingTab } from './ReportingSection';

export type Section = 'left' | 'center' | 'right' | 'reporting';

const SECTION_ORDER: Section[] = ['left', 'center', 'right', 'reporting'];
const SECTION_SELECTOR = '.sidebar-left, .sidebar-right, .reporting-section, .app-center';

// Which sections currently exist: center always does, the sidebars and reporting section only
// once something is docked/monitoring into them.
export function getPresentSections(tabs: TabView[]): Section[] {
  return SECTION_ORDER.filter((section) => {
    if (section === 'center') return true;
    if (section === 'left') return tabs.some((tab) => tab.dock === 'left');
    if (section === 'right') return tabs.some((tab) => tab.dock === 'right');
    return tabs.some((tab) => isReportingTab(tab));
  });
}

// Which section currently holds keyboard focus, derived from the DOM rather than stored state so
// mouse-driven focus changes are picked up for free. `.reporting-section` must be checked ahead of
// `.app-center` since it renders nested inside it — `closest()` naturally returns the nearer match.
export function resolveCurrentSection(activeElement: Element | null): Section {
  const root = activeElement?.closest(SECTION_SELECTOR);
  if (root?.classList.contains('sidebar-left')) return 'left';
  if (root?.classList.contains('sidebar-right')) return 'right';
  if (root?.classList.contains('reporting-section')) return 'reporting';
  return 'center';
}

// The next present section after `current`, wrapping the last back to the first. Falls back to
// center if `current` isn't one of the present sections (e.g. it dropped out mid-cycle).
export function nextSection(current: Section, present: Section[]): Section {
  const index = present.indexOf(current);
  if (index === -1) return 'center';
  return present[(index + 1) % present.length];
}

function focusSection(section: Section, focusCenter: () => void): void {
  if (section === 'center') { focusCenter(); return; }
  const selector = section === 'left' ? '.sidebar-left' : section === 'right' ? '.sidebar-right' : '.reporting-section';
  const root = document.querySelector(selector);
  root?.querySelector<HTMLElement>('[tabindex]')?.focus();
}

// Shift+Tab cycles keyboard focus across the currently-present application sections
// (left sidebar → center → right sidebar → reporting, wrapping), landing on each section's
// currently-visible tab. Runs in the capture phase so it intercepts the chord ahead of xterm
// (which would otherwise consume it inside a focused terminal) and ahead of the browser's own
// focus traversal.
export function useSectionNav(tabs: TabView[], focusCenter: () => void): void {
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const focusCenterRef = useRef(focusCenter);
  focusCenterRef.current = focusCenter;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const present = getPresentSections(tabsRef.current);
      const current = resolveCurrentSection(document.activeElement);
      const next = nextSection(current, present);
      e.preventDefault();
      e.stopPropagation();
      focusSection(next, () => focusCenterRef.current());
    };
    globalThis.addEventListener('keydown', onKeyDown, { capture: true });
    return () => globalThis.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}
