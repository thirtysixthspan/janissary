export function isRunscriptName(name: string): boolean {
  if (name.length === 0) return false;
  let previousWasHyphen = true;
  for (const character of name) {
    const isLowercaseLetter = character >= 'a' && character <= 'z';
    const isDigit = character >= '0' && character <= '9';
    if (character === '-') {
      if (previousWasHyphen) return false;
      previousWasHyphen = true;
    } else if (isLowercaseLetter || isDigit) {
      previousWasHyphen = false;
    } else {
      return false;
    }
  }
  return !previousWasHyphen;
}

export function parseRunscriptText(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  });
}
