// Generic typed pub/sub bus. Channels are named keys of the ChannelMap type parameter; within
// each channel events are discriminated by a `type` string. Listeners are isolated via per-call
// try/catch so a throwing subscriber never breaks the emit path.

import { errorText } from './error-text.js';
import type { LogEntry, Tab } from './tab/types.js';

export type Subscription = { unsubscribe: () => void };
export type Listener<E> = (event: E) => void;

// Each channel value must be a discriminated union with a string `type` field.
export type ChannelMap = Record<string, { type: string }>;

// Listeners are stored under the widest compatible parameter type and cast at subscribe/emit
// time. C[K] always extends BaseEvent by the ChannelMap constraint, so the runtime call is safe.
type BaseEvent = { type: string };
type AnyListener = Listener<BaseEvent>;

// Where a caught listener error goes. Injectable so no particular reporting module is wired in
// here; the default writes one line to stderr. The sink runs inside its own try in `emit`, so a
// throwing sink cannot break the emit path it was added to protect.
export type ListenerErrorSink = (channel: string, type: string, error: unknown) => void;

function defaultListenerError(channel: string, type: string, error: unknown): void {
  process.stderr.write(`message bus: ${channel}:${type} listener failed: ${errorText(error)}\n`);
}

export class MessageBus<C extends ChannelMap> {
  private listeners = new Map<string, Set<AnyListener>>();
  // Listeners whose failure on a `channel:type` key has already been reported. A listener failing
  // on every event of a high-frequency channel would otherwise produce one report per event; a
  // successful call clears the listener from the key, so a recovery is visible on its next failure.
  private reported = new Map<string, Set<AnyListener>>();
  private readonly onListenerError: ListenerErrorSink;

  constructor(onListenerError: ListenerErrorSink = defaultListenerError) {
    this.onListenerError = onListenerError;
  }

  private key(channel: keyof C, type: string): string {
    return `${String(channel)}:${type}`;
  }

  on<K extends keyof C>(
    channel: K,
    types: C[K]['type'] | Array<C[K]['type']>,
    listener: Listener<C[K]>
  ): Subscription {
    const typeArr = Array.isArray(types) ? types : [types];
    for (const type of typeArr) {
      const k = this.key(channel, type);
      const set = this.listeners.get(k) ?? new Set<AnyListener>();
      set.add(listener as unknown as AnyListener);
      this.listeners.set(k, set);
    }
    return {
      unsubscribe: () => {
        for (const type of typeArr) {
          this.listeners.get(this.key(channel, type))?.delete(listener as unknown as AnyListener);
        }
      },
    };
  }

  once<K extends keyof C>(
    channel: K,
    types: C[K]['type'] | Array<C[K]['type']>,
    listener: Listener<C[K]>
  ): Subscription {
    const ref: { sub?: Subscription } = {};
    const wrapper = (event: C[K]): void => {
      ref.sub?.unsubscribe();
      listener(event);
    };
    ref.sub = this.on(channel, types, wrapper);
    return ref.sub;
  }

  emit<K extends keyof C>(channel: K, event: C[K]): void {
    const k = this.key(channel, event.type);
    const set = this.listeners.get(k);
    if (!set) return;
    const snapshot = [...set];
    for (const fn of snapshot) {
      try {
        fn(event);
        this.reported.get(k)?.delete(fn);
      } catch (error) {
        // Isolate subscriber errors so a throwing listener cannot break the emit path, but do not
        // discard them where nothing can see them: report through the sink, deduplicated per
        // listener until a subsequent successful call clears it.
        const seen = this.reported.get(k) ?? new Set<AnyListener>();
        if (!seen.has(fn)) {
          seen.add(fn);
          this.reported.set(k, seen);
          try {
            this.onListenerError(String(channel), event.type, error);
          } catch {
            // A throwing sink must not break the emit path it was added to protect.
          }
        }
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export type BusEvent =
  | { type: 'entry:appended'; tabLabel: string; entry: LogEntry; tab: Readonly<Tab> }
  | { type: 'entries:trimmed'; tabLabel: string; count: number }
  | { type: 'tab:cleared'; tabLabel: string }
  | { type: 'tab:removed'; tabLabel: string };

type StateEvent = { type: 'dirty' };
type AppEvent = { type: 'exit' };
type PtyEvent =
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number }
  | { type: 'resize'; id: string; cols: number; rows: number };
type LayoutEvent = {
  type: 'update';
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
  focusLeft?: 'files' | 'notifications';
  focusRight?: 'files' | 'notifications';
};
// A one-shot request for every connected client's file-navigator selections, issued by
// `profile save` (see src/file-navigator/selection-request.ts) and broadcast as `collect-tree-state`.
type FileNavigatorEvent = { type: 'collect'; id: number };
// The scheduled-command set changed. Deliberately its own channel rather than a reason carried on
// `state: dirty`, which fires on essentially every mutation: this one is a named, low-frequency
// signal a tab plugin may subscribe to (see src/plugins/notifications.ts).
type ScheduleEvent = { type: 'changed' };
type ConversationsEvent = { type: 'changed' };
export type BusChannels = {
  transcript: BusEvent; state: StateEvent; app: AppEvent; pty: PtyEvent; layout: LayoutEvent;
  fileNavigator: FileNavigatorEvent; schedules: ScheduleEvent; conversations: ConversationsEvent;
};
export const messageBus = new MessageBus<BusChannels>();
