import type { Command } from './types.js';
import type { AcpInfo } from '../types.js';
import { connectAcp } from '../acp.js';
import { runAcpToolLoop } from '../acp-loop.js';
import { DB_PRIMER, extractDbCommand } from '../db.js';
import { extractBrowserCommand, BROWSER_PRIMER } from '../browser-command.js';
import { wordWrap } from '../tab.js';
import { appendEntry, getTimeStr } from '../logger.js';

export const command: Command = {
  name: 'acp',
  match: (cmd) => /^acp\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { tabs, activeTab, setAcpInfo, setAgentActive, setTabs, acpRef, cwdRef, appendLog, saveTabLog, columns } = ctx;
    const tabLabel = tabs[activeTab].label;
    const tabIndex = activeTab;
    const prompt = cmd.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) {
      ctx.updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: cmd, output: 'Usage: acp <prompt>.' }], scrollOffset: 0 }
      ));
      return;
    }
    let session = acpRef.current.get(tabIndex);
    if (!session) {
      const command = 'opencode';
      const args = ['acp'];
      const opencodeConfig = { model: 'google/gemini-3.1-flash-lite' };
      const slash = opencodeConfig.model.indexOf('/');
      const acpLabel: AcpInfo = slash >= 0
        ? { provider: opencodeConfig.model.slice(0, slash), model: opencodeConfig.model.slice(slash + 1) }
        : { model: opencodeConfig.model };
      session = connectAcp({
        command,
        args,
        cwd: cwdRef.current[tabLabel] ?? process.cwd(),
        onError: (msg) => appendLog(tabLabel, { input: '', output: `ACP: ${msg}` }),
        onConnect: () => setAcpInfo((prev) => ({ ...prev, [tabIndex]: acpLabel })),
        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(opencodeConfig) },
      });
      acpRef.current.set(tabIndex, session);
    }
    const acpSession = session;
    const wrapWidth = Math.max(20, (columns || 80) - 6);
    const updateRunning = (output: string, running: boolean) => {
      if (!running && output) appendEntry({ timestamp: getTimeStr(), agent: tabLabel, text: output });
      setTabs((prev) => prev.map((t) => {
        if (t.label !== tabLabel) return t;
        const log = [...t.log];
        const i = log.findLastIndex((e) => e.running);
        if (i >= 0) log[i] = { ...log[i], output, running };
        saveTabLog(t.label, log);
        return { ...t, log };
      }));
    };
    runAcpToolLoop(
      acpSession,
      prompt,
      {
        primer: `${DB_PRIMER}\n\n${BROWSER_PRIMER}`,
        runCommand: (runCmd) =>
          /^browser\b/i.test(runCmd) ? ctx.runBrowserInTab(tabIndex, runCmd) : ctx.runDbInTab(tabLabel, runCmd),
        extractCommand: (text) => extractBrowserCommand(text) ?? extractDbCommand(text),
      },
      {
        startTurn: (isFirst) => {
          setAgentActive(tabLabel, true);
          appendLog(tabLabel, { input: isFirst ? prompt : '', output: '', running: true });
        },
        chunk: (buf) => updateRunning(buf, true),
        endTurn: (final) => updateRunning(final, false),
        ranCommand: (runCmd, result) => {
          appendLog(tabLabel, { input: runCmd, output: result, acp: true });
        },
        finished: (reason, maxSteps) => {
          setAgentActive(tabLabel, false);
          if (reason === 'capped') appendLog(tabLabel, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        },
        error: (msg) => { updateRunning(wordWrap(`ACP error: ${msg}`, wrapWidth), false); setAgentActive(tabLabel, false); },
      },
    );
  },
};
