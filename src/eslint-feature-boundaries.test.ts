import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: path.join(process.cwd(), 'eslint.config.mjs'),
});

async function boundaryMessages(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath: path.join(process.cwd(), filePath) });
  return result.messages.filter((message) => message.ruleId === 'import-x/no-restricted-paths');
}

describe('client feature boundaries', () => {
  // ESLint loads eslint.config.mjs lazily on the first lint, so the whole config — typescript-eslint,
  // four plugins, the TypeScript import resolver — would otherwise be billed to whichever case runs
  // first and blow the default 5s test timeout on a loaded CI runner. The server project allows 30s
  // for hooks, so pay the cold start here.
  beforeAll(async () => {
    await boundaryMessages('export {};', 'web/src/harness/HarnessTab.tsx');
  });

  it('rejects an import from a sibling feature', async () => {
    const messages = await boundaryMessages(
      "import { AgentTabBody } from '../agent-tabs/AgentTabBody'; void AgentTabBody;",
      'web/src/harness/HarnessTab.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('not import a sibling feature');
  });

  it('includes newly colocated picker modules in feature isolation', async () => {
    const messages = await boundaryMessages(
      "import { HarnessTab } from '../harness/HarnessTab'; void HarnessTab;",
      'web/src/pickers/PickerOverlays.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('not import a sibling feature');
  });

  it('includes the schedule launch dialog in feature isolation', async () => {
    const messages = await boundaryMessages(
      "import { HarnessTab } from '../harness/HarnessTab'; void HarnessTab;",
      'web/src/ScheduleLaunchDialog/ScheduleDialog.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('not import a sibling feature');
  });

  it('includes the plugin host in feature isolation', async () => {
    const messages = await boundaryMessages(
      "import { HarnessTab } from '../harness/HarnessTab'; void HarnessTab;",
      'web/src/plugins/PluginTabLayer.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('not import a sibling feature');
  });

  it('rejects a feature importing the default context menu', async () => {
    const messages = await boundaryMessages(
      "import { DefaultContextMenu } from '../context-menu/DefaultContextMenu'; void DefaultContextMenu;",
      'web/src/harness/HarnessTab.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('not import a sibling feature');
  });

  it('rejects a shared module importing the toast stack', async () => {
    const messages = await boundaryMessages(
      "import { ToastStack } from '../toasts/ToastStack'; void ToastStack;",
      'web/src/shared/DockCycleHeader.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('Shared modules must not import a feature');
  });

  it('allows an import within the same feature', async () => {
    const messages = await boundaryMessages(
      "import { harnessLaunchCommand } from './harness-launch-command'; void harnessLaunchCommand;",
      'web/src/harness/HarnessTab.tsx',
    );
    expect(messages).toEqual([]);
  });

  it('allows a feature to import shared UI', async () => {
    const messages = await boundaryMessages(
      "import { AgentTabMeta } from '../shared/AgentTabMeta'; void AgentTabMeta;",
      'web/src/harness/HarnessTab.tsx',
    );
    expect(messages).toEqual([]);
  });

  it('rejects a shared module importing a feature', async () => {
    const messages = await boundaryMessages(
      "import { HarnessTab } from '../harness/HarnessTab'; void HarnessTab;",
      'web/src/shared/AgentTabMeta.tsx',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('Shared modules must not import a feature');
  });

  // The overlay-plugin host sits outside the feature list because it has to reach the pickers, the
  // command bar, and the context menu to build the one capability a plugin gets. Nothing may reach
  // back: the seam in `shared` is the only way in, and this is what keeps that direction one-way.
  it('rejects a feature reaching into the overlay-plugin layer', async () => {
    const messages = await boundaryMessages(
      "import { createOverlayPluginHost } from '../overlay-plugins/host'; void createOverlayPluginHost;",
      'web/src/pickers/overlay-registry.ts',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('shared/contributed-overlays');
  });

  it('allows a feature to reach an overlay through the shared seam', async () => {
    const messages = await boundaryMessages(
      "import { openContributedOverlay } from '../shared/contributed-overlays'; void openContributedOverlay;",
      'web/src/context-menu/useDefaultContextMenu.ts',
    );
    expect(messages).toEqual([]);
  });

  it('allows the overlay-plugin host to import a feature, which is what it exists to compose', async () => {
    const messages = await boundaryMessages(
      "import { defaultMenuGroups } from '../context-menu/default-menu-target'; void defaultMenuGroups;",
      'web/src/overlay-plugins/host.ts',
    );
    expect(messages).toEqual([]);
  });
});
