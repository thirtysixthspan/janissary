import React from 'react';
import type { JanusClient } from '../ws';
import { SplitTabButton } from '../SplitTabButton';

export type TabPluginClientCapabilities = {
  resourceUrl(reference: string): string;
  intent<Result>(name: string, payload: unknown): Promise<Result>;
  splitAction: React.ReactNode;
  reportFailure(reason: string): void;
};

export function createPluginClientCapabilities(
  label: string,
  client: JanusClient,
  onSplit?: () => void,
): TabPluginClientCapabilities {
  return {
    resourceUrl: (reference) => {
      const token = new URLSearchParams(location.search).get('token') ?? '';
      return `${reference}?token=${encodeURIComponent(token)}`;
    },
    intent: async <Result,>(name: string, payload: unknown) => {
      const result = await client.request<Result>({
        method: 'pluginIntent',
        params: { tab: label, intent: name, payload },
      });
      if (result === undefined) throw new Error(`Plugin intent "${name}" failed`);
      return result;
    },
    splitAction: onSplit ? React.createElement(SplitTabButton, { onClick: onSplit }) : null,
    reportFailure: (reason) => {
      client.send({ method: 'pluginFailed', params: { tab: label, reason } });
    },
  };
}
