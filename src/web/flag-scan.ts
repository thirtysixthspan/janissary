export function flagValue(value: string | undefined): string | undefined {
  if (value === undefined || value.startsWith('--')) return undefined;
  return value;
}

export function scanFlagArguments<T>(
  words: string[],
  scanned: T,
  scanFlag: (scanned: T, flag: string, value: string | undefined) => number | undefined,
): T | undefined {
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    if (!word.startsWith('--')) return undefined;
    const consumed = scanFlag(scanned, word, words[index + 1]);
    if (consumed === undefined) return undefined;
    index += consumed;
  }
  return scanned;
}
