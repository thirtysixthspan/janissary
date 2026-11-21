import type { HarnessLaunchView } from '@shared/protocol';
import type { HarnessLaunchFields } from './harness-launch-command';

// Whether `name` accepts auto-approve (`-y`), read from the catalog the server delivers so the
// dialog only ever builds a command the command parser will accept.
export function autoApproveSupported(view: HarnessLaunchView, name: string): boolean {
  return view.autoApprove.includes(name);
}

// Whether `name` accepts auto-resume (`--auto-resume`), read from the same delivered catalog.
export function autoResumeSupported(view: HarnessLaunchView, name: string): boolean {
  return view.autoResume.includes(name);
}

export function initialFields(view: HarnessLaunchView): HarnessLaunchFields {
  const name = view.names[0] ?? 'claude';
  return {
    name, label: '', workspace: true, offline: false, browser: true,
    autoApprove: autoApproveSupported(view, name), autoResume: autoResumeSupported(view, name),
    model: '', effort: '',
  };
}

export function modelValid(view: HarnessLaunchView, name: string, model: string): boolean {
  const text = model.trim();
  return text === '' || (view.models[name] ?? []).includes(text);
}

export function nextFields(
  previous: HarnessLaunchFields,
  patch: Partial<HarnessLaunchFields>,
  view: HarnessLaunchView,
): HarnessLaunchFields {
  const next = { ...previous, ...patch };
  if (patch.name !== undefined && !modelValid(view, next.name, next.model)) next.model = '';
  if (!autoApproveSupported(view, next.name)) next.autoApprove = false;
  else if (patch.name !== undefined && !autoApproveSupported(view, previous.name)) next.autoApprove = true;
  if (!autoResumeSupported(view, next.name)) next.autoResume = false;
  else if (patch.name !== undefined && !autoResumeSupported(view, previous.name)) next.autoResume = true;
  return next;
}
