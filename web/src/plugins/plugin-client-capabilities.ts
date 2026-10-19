import { subscribeBackgroundReplies } from './background-replies';
import { resourceUrl } from '../shared/ws/session-url';
import { copyText as systemCopyText } from '../shared/system-clipboard';
import { openTranscriptLink } from '../shared/transcript/open-link';
import { transcriptIntents } from '../shared/transcript/transcript-intents';
import type { PluginClientCapabilityOptions, TabPluginClientCapabilities } from './api';
import type { AcpRef } from '@shared/protocol';

export function createPluginClientCapabilities(
  options: PluginClientCapabilityOptions,
): TabPluginClientCapabilities {
  const {
    host,
    pluginId,
    label,
    client,
    active,
    dock,
    onClose,
    splitAction,
    onDirtyHandle,
    claimedChords = [],
    dotColor,
    recording,
    transcript,
    remoteCapabilities,
  } = options;
  return {
    active,
    dock,
    label,
    claimedChords,
    dotColor,
    ...remoteCapabilities,
    close: onClose,
    openAcpTranscript: () => {
      const acpRef: AcpRef = { scope: 'tab', label };
      client.send({ method: 'openAcpTranscript', params: { acpRef } });
    },
    registerDirtyHandle: onDirtyHandle,
    resourceUrl,
    copyText: (text: string) => { systemCopyText(text); },
    intent: async <Result,>(name: string, payload: unknown) => {
      const result = await client.request<Result>({
        method: 'pluginIntent',
        params: { tab: label, intent: name, payload },
      });
      if (!result.ok) throw new Error(result.error ?? `Plugin intent "${name}" failed`);
      return result.value;
    },
    splitAction: splitAction ?? null,
    attachTerminal: async (ptyId, onData) => {
      const authorization = await client.request<{ ok: boolean; value?: boolean }>({
        method: 'pluginTerminalAttach', params: { id: ptyId, tab: label },
      });
      if (!authorization.ok || !authorization.value) throw new Error('terminal does not belong to this plugin tab');
      const exitHandlers = new Set<() => void>();
      const stopListening = client.onPtyExit((id) => {
        if (id !== ptyId) return;
        for (const handler of exitHandlers) handler();
      });
      // Buffered early output is flushed into `onData` by `attachPty` before this returns, so a
      // plugin attaching late still renders whatever the shell said before it did.
      const detachBytes = client.attachPty(ptyId, onData);
      return {
        write: (data) => { client.send({ method: 'ptyInput', params: { id: ptyId, data, tab: label } }); },
        resize: (cols, rows) => { client.send({ method: 'ptyResize', params: { id: ptyId, cols, rows, tab: label } }); },
        onExit: (handler) => { exitHandlers.add(handler); },
        detach: () => { detachBytes(); stopListening(); exitHandlers.clear(); },
      };
    },
    onBackgroundReply: (receive) => subscribeBackgroundReplies(client, label, receive),
    openFileNavigator: () => { client.send({ method: 'openFileNavigatorFor', params: { label } }); },
    launchShellHere: () => { client.send({ method: 'launchShellFor', params: { label } }); },
    openDiffHere: () => { client.send({ method: 'openDiffFor', params: { label } }); },
    openScheduleLaunch: () => { client.send({ method: 'command', params: { text: 'schedule' } }); },
    // Each path and its opener are supplied together or not at all: a plugin drawing the recording
    // flag or the transcript button needs one answer to "does this tab have one", and a handler with
    // no path behind it would be a button that opens nothing.
    ...(recording !== undefined && {
      recording,
      openRecording: () => { client.send({ method: 'openRecordingFor', params: { label } }); },
    }),
    ...(transcript !== undefined && {
      transcript,
      openTranscript: () => { client.send({ method: 'openTranscriptFileFor', params: { label } }); },
    }),
    openLink: (href) => { openTranscriptLink(href, transcriptIntents((call) => client.send(call))); },
    reportTerminalColors: (id, colors) => {
      const { fg, bg, palette } = colors;
      client.send({
        method: 'reportTerminalColors',
        params: { id, fg, bg, ...(palette && { palette }) },
      });
    },
    // The report is deduplicated here rather than in the layer above, so the one-report-per-plugin
    // rule covers a plugin component reporting its own failure — a bad intent result, say — and not
    // just the load, schema, timeout, and render failures the host detects for it. The first report
    // disables the plugin for this session; the server then closes its tabs, and any later report
    // from a component still finishing its work is dropped instead of racing the teardown.
    reportFailure: (reason) => {
      if (!host.disable(pluginId, reason)) return;
      client.send({ method: 'pluginFailed', params: { tab: label, reason } });
    },
  };
}
