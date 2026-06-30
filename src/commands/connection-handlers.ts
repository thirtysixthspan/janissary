import type { CommandHandlerContext } from './types.js';
import {
  closeConnection, listOpenConnections,
} from '../connections.js';

export type HandlerContext = Pick<
  CommandHandlerContext,
  'activeTab' | 'shellsRef' | 'acpRef' | 'browserRef' | 'forgetDbConn' | 'setShellActive' | 'setAcpInfo' | 'shellName'
>;

export interface ParsedConnection {
  action: string;
  kind?: string;
  id?: string;
}

export function handleListConnections(context: HandlerContext): string {
  const { activeTab, shellsRef, acpRef, browserRef, shellName } = context;
  const tabIndex = activeTab;
  const lines: string[] = [];
  if (shellsRef.current.get(tabIndex)) lines.push(`shell:${shellName}`);
  if (acpRef.current.get(tabIndex)) lines.push('acp:opencode');
  const browserIds = browserRef.current.get(tabIndex)?.browser.windowIds() ?? [];
  for (const id of browserIds) lines.push(`browser:${id}`);
  for (const n of listOpenConnections()) lines.push(`sqlite:${n}`);
  return lines.length > 0 ? lines.join('\n') : 'No open connections.';
}

export function handleSqliteConnection(parsed: ParsedConnection, context: HandlerContext): string {
  const { forgetDbConn } = context;
  if (closeConnection(parsed.id!)) {
    forgetDbConn(parsed.id!);
    return `Closed connection sqlite:${parsed.id}.`;
  }
  return `No open connection sqlite:${parsed.id}.`;
}

export function handleShellConnection(parsed: ParsedConnection, context: HandlerContext): string {
  const { shellName } = context;
  if (parsed.id !== shellName) {
    return `No open connection shell:${parsed.id} (this tab's shell is "${shellName}").`;
  }
  const { activeTab, shellsRef, setShellActive } = context;
  const tabIndex = activeTab;
  if (shellsRef.current.get(tabIndex)) {
    shellsRef.current.get(tabIndex)?.kill();
    shellsRef.current.delete(tabIndex);
    setShellActive((previous) => { const c = { ...previous }; delete c[tabIndex]; return c; });
    return `Closed connection shell:${shellName}.`;
  }
  return `No open connection shell:${shellName}.`;
}

export function handleAcpConnection(parsed: ParsedConnection, context: HandlerContext): string {
  if (parsed.id !== 'opencode') {
    return `No open connection acp:${parsed.id} (the acp agent is "opencode").`;
  }
  const { activeTab, acpRef, setAcpInfo } = context;
  const tabIndex = activeTab;
  if (acpRef.current.get(tabIndex)) {
    acpRef.current.get(tabIndex)?.kill();
    acpRef.current.delete(tabIndex);
    setAcpInfo((previous) => { const c = { ...previous }; delete c[tabIndex]; return c; });
    return 'Closed connection acp:opencode.';
  }
  return 'No open connection acp:opencode.';
}
