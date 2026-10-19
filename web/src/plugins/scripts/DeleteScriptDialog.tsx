import { ConfirmDialog } from '../api';
import { deleteTitle, openEditorLine, systemScheduleLine } from './scripts-delete-text';

type Properties = {
  name: string;
  schedules: number;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteScriptDialog({ name, schedules, open, onConfirm, onCancel }: Properties) {
  const notes = [systemScheduleLine(schedules), openEditorLine(open)].filter((note): note is string => note !== null);

  return (
    <ConfirmDialog
      title={deleteTitle(name)}
      notes={notes}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
