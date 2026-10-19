import { useRef, useState } from 'react';
import { errorText } from '@shared/error-text';
import type { TabPluginClientCapabilities } from '../api';

type Intent = TabPluginClientCapabilities['intent'];

export function useRoleCreation(intent: Intent, onRefusal: (message: string | null) => void) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const typed = useRef('');
  const inFlight = useRef<string | null>(null);

  const typeName = (next: string) => {
    typed.current = next;
    setNewName(next);
  };

  const closeNewRole = () => {
    typed.current = '';
    setNewName('');
    setAdding(false);
  };

  const commitNewRole = async () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      closeNewRole();
      return;
    }
    if (inFlight.current === trimmed) return;
    inFlight.current = trimmed;
    onRefusal(null);
    try {
      await intent('add-role', { name: trimmed });
      if (typed.current.trim() !== trimmed) return;
      closeNewRole();
    } catch (error) {
      onRefusal(errorText(error));
    } finally {
      if (inFlight.current === trimmed) inFlight.current = null;
    }
  };

  return {
    adding,
    newName,
    openNewRole: () => setAdding(true),
    typeName,
    closeNewRole,
    commitNewRole,
  };
}
