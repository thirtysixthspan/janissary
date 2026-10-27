import type { Command, CommandInvocationContext, CommandManagers } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { getClientLayout } from '../client-layout.js';
import { messageBus } from '../bus.js';
import { getWindowBoundsReader, getWindowResizer } from '../window-resizer.js';
import { errorFirstLine } from '../error-text.js';
import { notify } from '../notifications/index.js';
import { LAYOUT_USAGE, parseLayoutCommand } from './parse-layout.js';

type Reply = (output: string) => void;

async function resizeWindow(width: number, height: number, managers: CommandManagers, label: string): Promise<void> {
  const resizer = getWindowResizer();
  if (!resizer) return;
  try {
    await resizer(width, height);
  } catch (error) {
    notify(managers, 'layout', label, `Could not resize the window: ${errorFirstLine(error)}.`);
  }
}

async function showLayoutLines(
  managers: CommandManagers,
  label: string,
  append: Reply,
  hasSplit: boolean,
): Promise<void> {
  const lines: string[] = [];
  const reader = getWindowBoundsReader();
  if (reader) {
    try {
      const { width, height } = await reader();
      lines.push(`layout window ${Math.round(width)} ${Math.round(height)}`);
    } catch (error) {
      notify(managers, 'layout', label, `Could not read the window size: ${errorFirstLine(error)}.`);
    }
  }

  const layout = getClientLayout();
  if (layout) {
    lines.push(...layoutLines(layout, hasSplit));
  }

  if (lines.length === 0) {
    notify(managers, 'layout', label, 'No layout to show.');
    return;
  }
  append(lines.join('\n'));
}

function layoutLines(layout: NonNullable<ReturnType<typeof getClientLayout>>, hasSplit: boolean): string[] {
  return [
    `layout sidebar left ${Math.round(layout.sidebarLeft)}`,
    `layout sidebar right ${Math.round(layout.sidebarRight)}`,
    ...(hasSplit ? [`layout split ${Math.round(layout.splitPct)}`] : []),
    `layout reporting ${Math.round(100 - layout.tabAreaPct)}`,
  ];
}

export const command: Command = {
  name: 'layout',
  match: (input) => /^layout(?:\s|$)/i.test(input),
  samples: [
    'layout window 1280 800', 'layout sidebar left 300', 'layout split 60',
    'layout reporting 25', 'layout show',
  ],
  run: async (input, tab, managers, invocation?: CommandInvocationContext) => {
    const append = (output: string) => appendCommandOutput(managers, tab.label, { input, output }, invocation);
    const parsed = parseLayoutCommand(input);
    if ('error' in parsed) { append(LAYOUT_USAGE); return; }

    switch (parsed.action) {
      case 'window': { await resizeWindow(parsed.width, parsed.height, managers, tab.label); return; }
      case 'sidebar': {
        messageBus.emit('layout', parsed.side === 'left'
          ? { type: 'update', sidebarLeft: parsed.width }
          : { type: 'update', sidebarRight: parsed.width });
        return;
      }
      case 'split': {
        if (managers.tab.secondaryTabLabel === undefined) { append('No split is showing.'); return; }
        messageBus.emit('layout', { type: 'update', splitPct: parsed.percent });
        return;
      }
      case 'reporting': {
        messageBus.emit('layout', { type: 'update', tabAreaPct: 100 - parsed.percent });
        return;
      }
      case 'show': {
        await showLayoutLines(managers, tab.label, append, managers.tab.secondaryTabLabel !== undefined);
      }
    }
  },
};
