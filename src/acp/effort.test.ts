import { describe, expect, it } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { selectAcpEffort } from './effort.js';

const configOptions: SessionConfigOption[] = [{
  id: 'reasoning',
  name: 'Reasoning effort',
  category: 'thought_level',
  type: 'select',
  currentValue: 'medium',
  options: [
    { value: 'low', name: 'Low' },
    { group: 'reasoning', name: 'Reasoning', options: [{ value: 'high', name: 'High' }] },
  ],
}];

describe('selectAcpEffort', () => {
  it('matches advertised values and labels in flat or grouped options', () => {
    expect(selectAcpEffort(configOptions, 'HIGH', 'provider/model')).toEqual({ configId: 'reasoning', value: 'high' });
  });

  it('refuses an unavailable effort or missing provider option', () => {
    expect(selectAcpEffort(configOptions, 'extreme', 'provider/model')).toEqual({
      error: 'Agent: unsupported effort "extreme" for model "provider/model".',
    });
    expect(selectAcpEffort(undefined, 'medium', 'provider/model')).toEqual({
      error: 'Agent: unsupported effort "medium" for model "provider/model".',
    });
  });
});
