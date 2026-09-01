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
});
