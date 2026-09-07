import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { OverlayOpenState } from './overlay-registry';
import type { useRouteChooser } from './useRouteChooser';
import type { useThemePicker } from './useThemePicker';
import type { useAppThemePicker } from './useAppThemePicker';
import type { useHistPicker } from './useHistPicker';
import type { useTabNav } from './useTabNav';
import type { useQuickOpen } from './useQuickOpen';
import type { useQueuePicker } from './useQueuePicker';
import type { usePopulatePickers } from './usePopulatePickers';

// Everything `usePickerOverlays` owns, in one type — the union of what the nine overlay hooks return
// plus the few values the hook derives for them. It is written as an intersection of `ReturnType`s
// rather than as a fifty-field literal on purpose: each hook already declares its own result, and
// restating those declarations here is exactly the duplication this module exists to remove. A field
// added to any hook reaches the projections below without a second edit.
//
// The projections (`buildPickerOverlayView`, `buildPickerKeyBindings`) take this type and nothing
// else, which is what lets them be plain functions testable without a render.
export type PickerOverlaysState =
  ReturnType<typeof useRouteChooser>
  & ReturnType<typeof useThemePicker>
  & ReturnType<typeof useAppThemePicker>
  & ReturnType<typeof useHistPicker>
  & ReturnType<typeof useTabNav>
  & ReturnType<typeof useQuickOpen>
  & ReturnType<typeof useQueuePicker>
  & ReturnType<typeof usePopulatePickers>
  & {
    // The active syntax theme, which the picker highlights but does not own — see the plan's note
    // on why it stays in `App.tsx`.
    syntaxTheme: string;
    // The history picker runs its selected row rather than populating the command line, so the key
    // handler needs the same submit path the pickers were built with.
    runCommand: (text: string) => void;
    // Derived from the active tab: the history picker's rows and the queue picker's rows.
    recent: string[];
    queueItems: string[];
    // The tab navigator renders every tab, not just the ones matching its query.
    tabs: TabView[];
    // Quick open focuses the command bar's textarea when it closes.
    commandInputRef: React.RefObject<HTMLTextAreaElement | null>;
    // Which overlay is up, from the one registry every consumer reads.
    overlays: OverlayOpenState;
  };
