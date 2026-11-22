import type { Managers } from '../managers.js';
import type { AcpPromptResult } from './types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';
import type { PersonaRoleHooks } from './persona-role-state.js';
import { knownRoleSettings, exhaustedError, fallbackNotice } from './ask-role.js';
import { notify } from '../notifications/index.js';
import { tabRuntime } from '../tab/runtime.js';
import { personaRoleRuntime } from './persona-role-state.js';
import { prepareCorePromptRecord, runCorePrompt } from './run-prompt.js';
import { appendAcp, settleAcpPrompt } from './response.js';
import { beginCoreRecord, closeCoreRecord } from './record-feed.js';

export function unknownRoleNotice(persona: string, role: string): string {
  return `Persona "${persona}" requests unknown role "${role}".`;
}

export function noEnabledModelsNotice(persona: string, role: string): string {
  return `Persona "${persona}" finds no enabled models in role "${role}".`;
}

export async function promptPersonaRole(
  managers: Managers, label: string, prompt: string, role: string, persona: string,
): Promise<AcpPromptResult> {
  const settings = knownRoleSettings(managers.tab.launchDir, role);
  if (!settings) {
    const message = unknownRoleNotice(persona, role);
    notify(managers, 'manual', label, message);
    return { answered: false, error: message };
  }
  const queue = managers.acp.launchableEntries(label, settings, role);
  const [entry] = queue;
  if (!entry) {
    const message = noEnabledModelsNotice(persona, role);
    notify(managers, 'manual', label, message);
    return { answered: false, error: message };
  }
  const tab = managers.tab.byLabel(label);
  if (!tab) return { answered: false, error: 'Tab not found' };
  const runtime = tabRuntime(tab);
  const state = personaRoleRuntime(runtime, role);
  if (state.prompt) return { answered: false, error: 'ACP: a prompt is already running.' };
  const cwd = managers.tab.cwdOf(label) ?? process.cwd();
  const nativeSettings = managers.nativeCommandSettings?.current();
  const roleName = role as AcpRole;

  for (const [index, candidate] of queue.entries()) {
    const attempt = personaRoleRuntime(runtime, role);
    const hooks: PersonaRoleHooks = {
      onError: (message) => {
        const pending = attempt.prompt;
        if (!pending) return;
        pending.modelFailed = true;
        const output = message.startsWith('ACP:') ? message : `ACP: ${message}`;
        settleAcpPrompt(managers, label, { answered: false, error: output }, undefined, roleName, attempt);
      },
    };
    try {
      const session = managers.personaRoleSessions.session(label, role, candidate, cwd, hooks, persona);
      const request: AcpPendingPrompt = {
        finish: () => {}, abort: new AbortController(), prompt, role: roleName,
        roleName: settings.name, commands: [...settings.commands], runningEntries: new Set(), state: attempt,
      };
      const result = await new Promise<AcpPromptResult>((finish) => {
        request.finish = finish;
        attempt.prompt = request;
        prepareCorePromptRecord(managers.acpRecords, runtime, request, nativeSettings);
        beginCoreRecord(managers.acpRecords, runtime, {
          kind: 'acp', role: DEFAULT_ACP_ROLE, declaredRole: role,
          model: candidate.model, ownerLabel: label, ownerName: tab.title ?? label,
        }, attempt);
        runCorePrompt(managers, label, runtime, request, nativeSettings, session, attempt.identity ?? '',
          () => managers.personaRoleSessions.hasSession(label, role)
            && personaRoleRuntime(runtime, role).session === session);
      });
      if (result.answered) return result;
      const next = queue[index + 1];
      if (request.modelFailed !== true || request.replied === true || !next) return result;
      managers.personaRoleSessions.close(label, role);
      closeCoreRecord(managers.acpRecords, runtime, roleName, attempt);
      appendAcp(managers, label, { input: '', output: fallbackNotice(candidate, next) });
    } catch (error) {
      const output = `ACP error: ${error instanceof Error ? error.message : String(error)}`;
      appendAcp(managers, label, { input: '', output });
      managers.personaRoleSessions.close(label, role);
      return { answered: false, error: output };
    }
  }
  return { answered: false, error: exhaustedError([], role) };
}
