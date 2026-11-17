import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';

export function reportProviderDisabled(managers: Managers, label: string): (name: string, reason: string) => void {
  return (name, reason) => {
    notify(managers, 'plugin-failure', label, `Web provider "${name}" disabled: ${reason}.`);
  };
}
