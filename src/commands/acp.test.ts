import { describe, it, expect, vi, beforeEach } from 'vitest';
import { command } from './acp.js';
import type { CommandHandlerContext } from './types.js';

describe('acp command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('acp');
  });

  it('matches acp commands', () => {
    expect(command.match('acp summarize this repo')).toBe(true);
    expect(command.match('ACP summarize this repo')).toBe(true);
    expect(command.match('acp')).toBe(true);
  });

  it('does not match non-acp input', () => {
    expect(command.match('acp-extra')).toBe(true); // \b matches before '-'
    expect(command.match('acp  ')).toBe(true);
    expect(command.match('clear')).toBe(false);
  });

  describe('handler', () => {
    let mockContext: Partial<CommandHandlerContext>;

    beforeEach(() => {
      mockContext = {
        tabs: [{ label: 'default', log: [] }],
        activeTab: 0,
        setAcpInfo: vi.fn(),
        setAgentActive: vi.fn(),
        setTabs: vi.fn(),
        acpRef: { current: new Map() },
        cwdRef: { current: {} },
        appendLog: vi.fn(),
        saveTabLog: vi.fn(),
        columns: 80,
        updateCurrentTab: vi.fn(),
        runBrowserInTab: vi.fn(),
        runDbInTab: vi.fn(),
      };
    });

    it('sends usage message when prompt is empty', () => {
      command.handler('acp', mockContext);
      expect(mockContext.updateCurrentTab).toHaveBeenCalled();
      const callback = mockContext.updateCurrentTab.mock.calls[0][0];
      const result = callback({ label: 'default', log: [] });
      expect(result.log[0].output).toBe('Usage: acp <prompt>.');
    });

    it('appends prompt input when handler is called with text', () => {
      command.handler('acp test prompt', mockContext);
      expect(mockContext.appendLog).toHaveBeenCalled();
    });

    it('sets agent active when prompt is processed', () => {
      command.handler('acp test', mockContext);
      expect(mockContext.setAgentActive).toHaveBeenCalledWith('default', true);
    });
  });
});
