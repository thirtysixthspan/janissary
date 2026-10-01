import React, { Component, type ReactNode } from 'react';
import { errorFirstLine } from '@shared/error-text';
import type { ContributedOverlay } from '../shared/contributed-overlays';

// Every host call into a started overlay crosses the plugin boundary, so each one is guarded here,
// once, before the overlay is published: a throw disables that one plugin with its reason and
// leaves the window running. Unguarded, a throw while rendering unmounted the whole app to a blank
// window, and a throw in `onKey` escaped the window's key handler on every keystroke while the
// plugin stayed enabled.

class OverlayErrorBoundary extends Component<{
  children: ReactNode;
  onFailure(error: unknown): void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onFailure(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// The plugin's own `render` is called here, inside the boundary, rather than by whoever asked for the
// node — so a throw from the call itself is caught the same way as one from what it rendered, and is
// reported from the commit phase instead of as a state change in the middle of another render.
function RenderedOverlay({ overlay, anchor }: { overlay: ContributedOverlay; anchor: HTMLElement | null }) {
  return <>{overlay.render(anchor)}</>;
}

export function guardOverlay(overlay: ContributedOverlay, fail: (reason: string) => void): ContributedOverlay {
  const failWith = (error: unknown): void => { fail(errorFirstLine(error)); };
  return {
    name: overlay.name,
    claimsCommandBar: overlay.claimsCommandBar,
    render: (anchor) => (
      <OverlayErrorBoundary onFailure={failWith}>
        <RenderedOverlay overlay={overlay} anchor={anchor} />
      </OverlayErrorBoundary>
    ),
    onKey: (event) => {
      try { overlay.onKey(event); } catch (error) { failWith(error); }
    },
    onOpen: () => {
      try { overlay.onOpen(); } catch (error) { failWith(error); }
    },
  };
}
