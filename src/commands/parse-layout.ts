export const LAYOUT_SUBCOMMANDS = ['window', 'sidebar', 'split', 'reporting', 'show'];
export const LAYOUT_USAGE = 'Usage: layout window <width> <height> | sidebar left|right <width> | split <percent> | reporting <percent> | show.';

export type ParsedLayoutCommand =
  | { action: 'window'; width: number; height: number }
  | { action: 'sidebar'; side: 'left' | 'right'; width: number }
  | { action: 'split'; percent: number }
  | { action: 'reporting'; percent: number }
  | { action: 'show' }
  | { error: string };

function wholeNumber(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function pixelSize(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const size = wholeNumber(value);
  return size !== undefined && size > 0 ? size : undefined;
}

function percentage(value: string | undefined, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  const percent = wholeNumber(value);
  return percent !== undefined && percent >= minimum && percent <= maximum ? percent : undefined;
}

export function parseLayoutCommand(input: string): ParsedLayoutCommand {
  const match = /^layout(?:\s+|$)(.*)$/iu.exec(input.trim());
  const words = match?.[1].trim().split(/\s+/u).filter(Boolean) ?? [];
  const [subcommand, ...args] = words;
  if (subcommand === undefined) return { error: LAYOUT_USAGE };

  switch (subcommand.toLowerCase()) {
    case 'window': { return parseWindow(args); }
    case 'sidebar': { return parseSidebar(args); }
    case 'split': { return parsePercentageForm(args, 'split', 1, 99); }
    case 'reporting': { return parsePercentageForm(args, 'reporting', 0, 100); }
    case 'show': { return args.length === 0 ? { action: 'show' } : { error: LAYOUT_USAGE }; }
    default: {
      return { error: LAYOUT_USAGE };
    }
  }
}

function parseWindow(args: string[]): ParsedLayoutCommand {
  if (args.length !== 2) return { error: LAYOUT_USAGE };
  const width = pixelSize(args[0]);
  const height = pixelSize(args[1]);
  return width !== undefined && height !== undefined
    ? { action: 'window', width, height }
    : { error: LAYOUT_USAGE };
}

function parseSidebar(args: string[]): ParsedLayoutCommand {
  if (args.length !== 2) return { error: LAYOUT_USAGE };
  const side = args[0].toLowerCase();
  const width = pixelSize(args[1]);
  return (side === 'left' || side === 'right') && width !== undefined
    ? { action: 'sidebar', side, width }
    : { error: LAYOUT_USAGE };
}

function parsePercentageForm(
  args: string[], action: 'split' | 'reporting', minimum: number, maximum: number,
): ParsedLayoutCommand {
  if (args.length !== 1) return { error: LAYOUT_USAGE };
  const percent = percentage(args[0], minimum, maximum);
  return percent === undefined ? { error: LAYOUT_USAGE } : { action, percent };
}
