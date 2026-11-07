import { useEffect, useState, type RefObject } from 'react';

type FocusSnapshot = {
  inside: boolean;
  tab: string | undefined;
};

// The label of the tab body around an element. The host marks every tab body with `data-tab-label`,
// and the plugin boundary keeps a tab plugin from importing the host's lookup helper.
function enclosingTabLabel(element: Element | null): string | undefined {
  return element?.closest<HTMLElement>('[data-tab-label]')?.dataset.tabLabel;
}

// Which PDF tab a window key belongs to. A centre PDF tab answers while it is the current tab and
// focus is not in another tab, including when focus rests on the page itself. A docked PDF tab is
// never the current tab, so it answers only while focus is inside its own `.pdf-tab`: a sidebar can
// show it beside a centre PDF, and both would otherwise page their documents or close their find
// overlays at once. The chord claim needs none of this because `chordTabLabel` already routes a
// claimed chord by the focused tab.
export function usePdfKeyOwnership(
  tabRef: RefObject<HTMLDivElement | null>,
  active: boolean,
  docked: boolean,
): boolean {
  const [focus, setFocus] = useState<FocusSnapshot>({ inside: false, tab: undefined });
  useEffect(() => {
    const sync = () => {
      const element = document.activeElement;
      setFocus({
        inside: tabRef.current?.contains(element) ?? false,
        tab: enclosingTabLabel(element),
      });
    };
    sync();
    globalThis.addEventListener('focusin', sync);
    globalThis.addEventListener('focusout', sync);
    return () => {
      globalThis.removeEventListener('focusin', sync);
      globalThis.removeEventListener('focusout', sync);
    };
  }, [tabRef]);
  if (!active) return false;
  if (focus.inside) return true;
  return !docked && focus.tab === undefined;
}
