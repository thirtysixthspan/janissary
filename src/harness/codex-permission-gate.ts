// The keystroke that accepts codex's highlighted approval option: a carriage return. codex's
// approval overlay is a list selection whose first ordinary-approval row is pre-highlighted, so
// Enter confirms the visible selection — a literal `y` is not used because the overlay follows the
// selected-row contract, not a request-specific shortcut.
export const CODEX_APPROVAL_KEYSTROKE = '\r';

// The glyph codex renders in front of the highlighted list option (e.g. `› 1. Yes, proceed`). Taken
// from the real HarnessScreenReader text capture, not a screenshot: `@xterm/headless` translation is
// the exact production input to this matcher, and codex uses `›` where claude uses `❯`.
const SELECTION_MARKER = '›';

// One codex approval-overlay family: the title anchor that identifies the request, plus a predicate
// over the highlighted first option's text. Both are matched on trimmed rendered lines with
// startsWith/endsWith checks rather than a broad regular expression, so variable commands, hosts,
// reasons, paths, and server names stay out of the signature.
type CodexFamily = { title: (line: string) => boolean; firstOption: (optionText: string) => boolean };

// The codex 0.144.4 approval-overlay families. Each requires an exact (or anchored) title and the
// highlighted one-time/ordinary first option — never codex's persistent prefix, session, host, or
// file allowlist choices. MCP elicitation's first option is request-specific, so only its title is
// anchored and any highlighted first option is accepted.
const CODEX_FAMILIES: CodexFamily[] = [
  {
    title: (line) => line === 'Would you like to run the following command?',
    firstOption: (text) => text.startsWith('Yes, proceed'),
  },
  {
    title: (line) => line.startsWith('Do you want to approve network access to "') && line.endsWith('"?'),
    firstOption: (text) => text.startsWith('Yes, just this once'),
  },
  {
    title: (line) => line === 'Would you like to make the following edits?',
    firstOption: (text) => text.startsWith('Yes, proceed'),
  },
  {
    title: (line) => line === 'Would you like to grant these permissions?',
    firstOption: (text) => text.startsWith('Yes, grant these permissions for this turn'),
  },
  {
    title: (line) => line.endsWith(' needs your approval.'),
    firstOption: () => true,
  },
];

// The highlighted first option's text (everything after `› 1.`), or undefined when `line` is not the
// selected option 1. The selection marker is required — an unhighlighted `1.` row means the overlay
// is defaulting to some other choice and must not receive a blind Enter.
function selectedFirstOptionText(line: string): string | undefined {
  if (!line.startsWith(SELECTION_MARKER)) return undefined;
  const afterMarker = line.slice(SELECTION_MARKER.length).trimStart();
  if (!afterMarker.startsWith('1.')) return undefined;
  return afterMarker.slice('1.'.length).trimStart();
}

// codex's confirm/cancel footer, e.g. `Press Enter to confirm · Esc to cancel`. Keyed on both action
// words so an approval overlay is distinguished from ordinary output that merely mentions one.
function isConfirmCancelFooter(line: string): boolean {
  return line.includes('to confirm') && line.includes('to cancel');
}

// codex's live composer send hint, present beneath the input box when codex is back at its prompt.
// The active approval overlay replaces the composer, so this hint is absent while a gate is live; its
// reappearance below a resolved footer means the menu above is stale scrollback, not a live gate.
function isLiveComposerLine(line: string): boolean {
  return line.includes('⏎ send');
}

// Whether `lines` (already trimmed) contain a live overlay for `family`, in order: the title, then a
// later highlighted first option matching the family, then a later confirm/cancel footer, with no
// live composer hint below that footer.
function matchesFamily(lines: string[], family: CodexFamily): boolean {
  const titleIndex = lines.findIndex((line) => family.title(line));
  if (titleIndex === -1) return false;
  const optionIndex = lines.findIndex((line, i) => {
    if (i <= titleIndex) return false;
    const text = selectedFirstOptionText(line);
    return text !== undefined && family.firstOption(text);
  });
  if (optionIndex === -1) return false;
  const footerIndex = lines.findIndex((line, i) => i > optionIndex && isConfirmCancelFooter(line));
  if (footerIndex === -1) return false;
  return lines.slice(footerIndex + 1).every((line) => !isLiveComposerLine(line));
}

// Whether the rendered screen `text` shows a live codex approval overlay this integration answers.
// Pure and deterministic: recognizes the overlay by its structure (title → highlighted ordinary
// first option → confirm/cancel footer, no live composer beneath) rather than by broad approval
// words, and rejects a stale menu sitting above codex's current input prompt.
export function detectCodexPermissionGate(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim());
  return CODEX_FAMILIES.some((family) => matchesFamily(lines, family));
}
