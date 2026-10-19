import { describe, expect, it } from 'vitest';
import { deleteTitle, openEditorLine, systemScheduleLine } from './scripts-delete-text';

describe('deleteTitle', () => {
  it('names the runscript in the title', () => {
    expect(deleteTitle('deploy')).toBe('Delete runscript "deploy"?');
  });
});

describe('systemScheduleLine', () => {
  it('has no line for a runscript that no system schedule uses', () => {
    expect(systemScheduleLine(0)).toBeNull();
  });

  it('uses the singular for one system schedule', () => {
    expect(systemScheduleLine(1)).toBe('Used by 1 system schedule. It will fire as missing after this.');
  });

  it('uses the plural for two or more system schedules', () => {
    expect(systemScheduleLine(2)).toBe('Used by 2 system schedules. They will fire as missing after this.');
  });
});

describe('openEditorLine', () => {
  it('names the open editor tab when the runscript is open', () => {
    expect(openEditorLine(true)).toBe('Open in an editor tab. The tab keeps its text.');
  });

  it('has no line when the runscript is not open', () => {
    expect(openEditorLine(false)).toBeNull();
  });
});
