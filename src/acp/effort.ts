import type { SessionConfigOption, SessionConfigSelectOption } from '@agentclientprotocol/sdk';

function optionsFor(option: SessionConfigOption): SessionConfigSelectOption[] {
  if (option.type !== 'select') return [];
  return option.options.flatMap((entry) => 'options' in entry ? entry.options : [entry]);
}

export function selectAcpEffort(
  configOptions: readonly SessionConfigOption[] | null | undefined,
  effort: string,
  model: string,
): { configId: string; value: string } | { error: string } {
  const option = configOptions?.find((candidate) => candidate.category === 'thought_level');
  const selected = option && optionsFor(option).find((candidate) =>
    candidate.value.toLowerCase() === effort.toLowerCase() || candidate.name.toLowerCase() === effort.toLowerCase());
  return selected && option
    ? { configId: option.id, value: selected.value }
    : { error: `Agent: unsupported effort "${effort}" for model "${model}".` };
}
