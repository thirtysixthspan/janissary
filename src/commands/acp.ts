import type { Command } from './types.js';
import type { AcpInfo } from '../types.js';
import { connectAcp } from '../acp.js';
import { runAcpToolLoop } from '../acp-loop.js';
import { DB_PRIMER, extractDatabaseCommand } from '../database.js';
import { extractBrowserCommand, BROWSER_PRIMER } from '../browser-command.js';
import { wordWrap } from '../tab.js';
import { appendEntry, getTimeStr as getTimeString } from '../logger.js';

export const command: Command = {
  name: 'acp',
  match: (command_) => /^acp\b/i.test(command_),
  handler: (command_, context) => {
    const { tabs, activeTab, setAcpInfo, setAgentActive, setTabs, acpRef, cwdRef, appendLog, saveTabLog, columns } = context;
    const tabLabel = tabs[activeTab].label;
    const tabIndex = activeTab;
    const prompt = command_.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) {
      context.updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: command_, output: 'Usage: acp <prompt>.' }], scrollOffset: 0 }
      ));
      return;
    }
    let session = acpRef.current.get(tabIndex);
    if (!session) {
      const command = 'opencode';
      const arguments_ = ['acp'];
      const opencodeConfig = { model: 'google/gemini-3.1-flash-lite' };
      const slash = opencodeConfig.model.indexOf('/');
      const acpLabel: AcpInfo = slash === -1
        ? { model: opencodeConfig.model }
        : { provider: opencodeConfig.model.slice(0, slash), model: opencodeConfig.model.slice(slash + 1) };
      session = connectAcp({
        command,
        args: arguments_,
        cwd: cwdRef.current[tabLabel] ?? process.cwd(),
        onError: (message) => appendLog(tabLabel, { input: '', output: `ACP: ${message}` }),
        onConnect: () => setAcpInfo((previous) => ({ ...previous, [tabIndex]: acpLabel })),
        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(opencodeConfig) },
      });
      acpRef.current.set(tabIndex, session);
    }
    const acpSession = session;
    const wrapWidth = Math.max(20, (columns || 80) - 6);
    const updateRunning = (output: string, isRunning: boolean) => {
      if (!isRunning && output) appendEntry({ timestamp: getTimeString(), agent: tabLabel, text: output });
      setTabs((previous) => previous.map((t) => {
        if (t.label !== tabLabel) return t;
        const log = [...t.log];
        const index = log.findLastIndex((entry) => entry.running);
        if (index !== -1) log[index] = { ...log[index], output, running: isRunning };
        saveTabLog(t.label, log);
        return { ...t, log };
      }));
    };
    runAcpToolLoop(
      acpSession,
      prompt,
      {
        primer: `${DB_PRIMER}\n\n${BROWSER_PRIMER}`,
        runCommand: (runCommand) =>
          /^browser\b/i.test(runCommand) ? context.runBrowserInTab(tabIndex, runCommand) : context.runDbInTab(tabLabel, runCommand),
        extractCommand: (text) => extractBrowserCommand(text) ?? extractDatabaseCommand(text),
      },
      {
        startTurn: (isFirst) => {
          setAgentActive(tabLabel, true);
          appendLog(tabLabel, { input: isFirst ? prompt : '', output: '', running: true });
        },
        chunk: (buffer) => updateRunning(buffer, true),
        endTurn: (final) => updateRunning(final, false),
        ranCommand: (runCommand, result) => {
          appendLog(tabLabel, { input: runCommand, output: result, acp: true });
        },
        finished: (reason, maxSteps) => {
          setAgentActive(tabLabel, false);
          if (reason === 'capped') appendLog(tabLabel, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        },
        error: (message) => { updateRunning(wordWrap(`ACP error: ${message}`, wrapWidth), false); setAgentActive(tabLabel, false); },
      },
    );
  },
};
