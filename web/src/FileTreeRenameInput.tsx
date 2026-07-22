import { renameSelectionRange } from './file-tree-rename';

type Properties = { name: string; dir: boolean; onCommit: (name: string) => void; onCancel: () => void };

export function FileTreeRenameInput({ name, dir, onCommit, onCancel }: Properties) {
  return (
    <input
      aria-label={`Rename ${name}`}
      autoFocus
      defaultValue={name}
      onBlur={onCancel}
      onFocus={(e) => {
        const [start, end] = renameSelectionRange(name, dir);
        e.currentTarget.setSelectionRange(start, end);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(e.currentTarget.value);
        else if (e.key === 'Escape') onCancel();
      }}
    />
  );
}
