// Generic typed pub/sub bus. Channels are named keys of the ChannelMap type parameter; within
// each channel events are discriminated by a `type` string. Listeners are isolated via per-call
// try/catch so a throwing subscriber never breaks the emit path.

import type { LogEntry, Tab } from './types.js';

export type Subscription = { unsubscribe: () => void };
export type Listener<E> = (event: E) => void;

// Each channel value must be a discriminated union with a string `type` field.
export type ChannelMap = Record<string, { type: string }>;

// Listeners are stored under the widest compatible parameter type and cast at subscribe/emit
// time. C[K] always extends BaseEvent by the ChannelMap constraint, so the runtime call is safe.
type BaseEvent = { type: string };
type AnyListener = Listener<BaseEvent>;

export class MessageBus<C extends ChannelMap> {
  private listeners = new Map<string, Set<AnyListener>>();

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
    const set = this.listeners.get(this.key(channel, event.type));
    if (!set) return;
    const snapshot = [...set];
    for (const fn of snapshot) {
      try {
        fn(event);
      } catch {
        // Isolate subscriber errors so a throwing listener cannot break the emit path.
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

export type BusChannels = { transcript: BusEvent };
type Bus = MessageBus<BusChannels>;
type BusEventType = BusEvent['type'];
export const messageBus = new MessageBus<BusChannels>();
