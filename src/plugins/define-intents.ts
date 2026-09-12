import type { TabPluginIntent, TabPluginServerCapabilities } from './api.js';

// One row of a plugin's intent table: the payload predicate a client's payload must satisfy and the
// code to run once both payloads are trusted. `run` receives the tab payload already narrowed to
// the plugin's own type; annotate the `payload` parameter at the definition site to keep the
// entry's own payload type visible.
export type TabPluginIntentEntry<Payload, IntentPayload> = {
  payload(value: unknown): value is IntentPayload;
  run(
    tabPayload: Payload,
    payload: IntentPayload,
    capabilities: TabPluginServerCapabilities,
  ): unknown | Promise<unknown>;
};

// The three shared steps every bundled plugin otherwise re-implements by hand in its `intent`
// callback: narrow the tab payload through the plugin's own guard, reject an intent name the table
// does not carry, and reject a payload the named entry's guard does not accept. The returned
// callback is the `intent` member `TabPluginActivation` already requires, so a plugin adopting the
// table changes nothing else about its activation.
//
// The tab payload is the host's own record, not client input, so a bad one means this plugin
// produced something invalid — a real failure rather than a request worth answering.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint erases each entry's own payload type; the definition site annotates it back.
export function defineIntents<Payload, Intents extends Record<string, TabPluginIntentEntry<Payload, any>>>(
  pluginId: string,
  isPayload: (value: unknown) => value is Payload,
  intents: Intents,
): (request: TabPluginIntent, capabilities: TabPluginServerCapabilities) => unknown | Promise<unknown> {
  return (request, capabilities) => {
    const tabPayload = request.tabPayload;
    if (!isPayload(tabPayload)) {
      return capabilities.reportFailure(`invalid ${pluginId} tab payload`);
    }
    const entry = intents[request.intent];
    if (entry === undefined) {
      return capabilities.rejectRequest(`unknown ${pluginId} intent "${request.intent}"`);
    }
    if (!entry.payload(request.payload)) {
      return capabilities.rejectRequest(`invalid ${request.intent} payload`);
    }
    return entry.run(tabPayload, request.payload, capabilities);
  };
}
