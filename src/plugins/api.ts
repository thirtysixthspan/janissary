import type { ComponentType, ReactNode } from 'react';
import type { PluginIntentReply, PluginIntentRequest } from '../protocol.js';

export const TAB_PLUGIN_API_VERSION = { major: 1, minor: 0 } as const;
export const TAB_PLUGIN_ACTIVATION_BUDGET_MS = 1000;
export const TAB_PLUGIN_HANDLER_BUDGET_MS = 5000;
export const TAB_PLUGIN_CLIENT_ACTIVATION_BUDGET_MS = 5000;

export type TabPluginApiVersion = { major: number; minor: number };

// Every capability v1 defines. A declaration naming anything else is rejected before import, and a
// plugin that calls a capability it did not declare fails through the ordinary guard.
export const TAB_PLUGIN_CAPABILITIES = [
  'transcript',
  'plugin-tabs',
  'served-files',
  'external-viewer',
  'external-open',
] as const;

export type TabPluginCapability = (typeof TAB_PLUGIN_CAPABILITIES)[number];

export type TabPluginDeclaration = {
  id: string;
  version: string;
  requiredApiVersion: TabPluginApiVersion;
  payloadSchemaVersion: number;
  // Label prefix for every tab this plugin opens ('video' -> `video`, `video-2`, …). The per-tab
  // display title is not declared here: it comes from each `openPluginTab` request, because a tab is
  // usually titled after the thing it opened.
  tab: { labelPrefix: string };
  commands?: readonly string[];
  opener?: {
    extensions: readonly string[];
    mimeTypes: Readonly<Record<string, string>>;
    editAction?: 'open external';
  };
  capabilities: readonly TabPluginCapability[];
};

export type TabPluginResourceCapabilities = {
  registerFile(absPath: string): string;
};

export type OpenPluginTabRequest = {
  originLabel: string;
  instanceKey: string;
  title: string;
  create(resources: TabPluginResourceCapabilities): unknown;
};

export type OpenPluginTabResult = { label: string; opened: boolean };

export type TabPluginServerCapabilities = {
  report(originLabel: string, text: string): void;
  openPluginTab(request: OpenPluginTabRequest): OpenPluginTabResult;
  externalViewer(): string;
  openExternally(absPath: string, application?: string): boolean;
};

export type TabPluginInvocation = {
  originLabel: string;
};

export type TabPluginIntentContext = TabPluginInvocation & {
  tabLabel: string;
  tabPayload: unknown;
  filePath(ref: string): string | undefined;
};

export type TabPluginActivation = {
  apiVersion: TabPluginApiVersion;
  payloadSchemaVersion: number;
  validateTabPayload(payload: unknown): boolean;
  commands?: Readonly<Record<string, (command: string, context: TabPluginInvocation) => void | Promise<void>>>;
  opener?: {
    inline(file: string, context: TabPluginInvocation): void | Promise<void>;
    external(file: string, context: TabPluginInvocation): void | Promise<void>;
  };
  validateIntent?(intent: string, payload: unknown): boolean;
  handleIntent?(request: PluginIntentRequest, context: TabPluginIntentContext): PluginIntentReply | Promise<PluginIntentReply>;
  validateIntentReply?(intent: string, payload: unknown): boolean;
  dispose?(): void | Promise<void>;
};

export type TabPluginServerModule = {
  activate(capabilities: TabPluginServerCapabilities): TabPluginActivation | Promise<TabPluginActivation>;
};

export type TabPluginServerLoader = () => Promise<TabPluginServerModule>;

export type TabPluginClientCapabilities = {
  resourceUrl(ref: string): string;
  pluginIntent(intent: string, payload: unknown): Promise<PluginIntentReply>;
  splitAction: ReactNode;
};

export type TabPluginClientComponentProperties = {
  payload: unknown;
  capabilities: TabPluginClientCapabilities;
};

export type TabPluginClientActivation = {
  apiVersion: TabPluginApiVersion;
  payloadSchemaVersion: number;
  validateTabPayload(payload: unknown): boolean;
  component: ComponentType<TabPluginClientComponentProperties>;
};

export type TabPluginClientModule = {
  activate(): TabPluginClientActivation | Promise<TabPluginClientActivation>;
};

export type TabPluginClientLoader = () => Promise<TabPluginClientModule>;

// Core commands resolve before contributed commands. Plugin command names are unique,
// case-insensitive first tokens with a word boundary, so an invocation has one provider.
// Opener claims use first match, but duplicate extensions and MIME claims are registration errors.
// Each matched handler is awaited; separate invocations may overlap. Returning nothing means the
// handler completed without opening a tab.
