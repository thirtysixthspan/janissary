import { useEffect, useState } from 'react';

// Tracks OS-level focus of this window — lost when switching to another application or
// (in a browser) another tab. Distinct from which in-app tab is active.
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    globalThis.addEventListener('focus', onFocus);
    globalThis.addEventListener('blur', onBlur);
    return () => {
      globalThis.removeEventListener('focus', onFocus);
      globalThis.removeEventListener('blur', onBlur);
    };
  }, []);

  return focused;
}
