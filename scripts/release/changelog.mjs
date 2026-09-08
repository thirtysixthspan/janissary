// Turns the conventional-commit subjects since the last tag into one CHANGELOG section.
//
// Two kinds of commit are dropped rather than categorized. A release's own version bump is
// bookkeeping about the changelog, not a change to report in it. And `sync: <filename>` is what
// the editor's save cycle commits every time somebody saves a synced backlog or spec file
// (`src/git/sync.ts`) — hundreds accumulate between tags, none of them names a change to the
// product, and left in they bury every real entry in the Other section under repeats of
// `sync: issues.md`.

// In the order they are printed. `other` collects the subjects that carry no recognized type.
const CATEGORY_LABELS = {
  feat: 'Features',
  fix: 'Bug Fixes',
  docs: 'Documentation',
  refactor: 'Refactoring',
  chore: 'Chores',
  other: 'Other',
};

const CONVENTIONAL_SUBJECT = /^(\w+)(?:\(.+?\))?!?:\s(.+)$/;

export function isReleaseCommit(subject) {
  return /^\w+(\(.+?\))?!?:\s*bump version to \d+\.\d+\.\d+/i.test(subject);
}

// Anchored on the subject's type, so `feat(git-sync): …` and `fix: report asynchronous …` — which
// name the feature or merely contain the word — keep their own category and stay in the changelog.
export function isSyncCommit(subject) {
  return /^sync(\(.+?\))?!?:\s/i.test(subject);
}

export function isOmittedCommit(subject) {
  return isReleaseCommit(subject) || isSyncCommit(subject);
}

// The breaking-changes list and the categories are both derived from `reported`, so a subject the
// changelog omits is omitted from every part of it.
export function changelogSection(version, date, subjects) {
  const reported = subjects.filter((subject) => !isOmittedCommit(subject));

  let md = `## [${version}] - ${date}\n\n`;
  md += breakingChanges(reported);
  md += categories(reported);

  return md.trimEnd() + '\n';
}

function breakingChanges(reported) {
  const breaking = reported.filter((s) => s.includes('BREAKING CHANGE') || /^\w+\(.+\)!:/.test(s));
  if (breaking.length === 0) return '';

  let md = '### ⚠ Breaking Changes\n\n';
  for (const subject of breaking) md += `- ${subject}\n`;
  return md + '\n';
}

// A category with nothing in it prints no heading — which is what keeps an `### Other` heading out
// of a release whose only uncategorized commits were sync commits.
function categories(reported) {
  const grouped = groupByType(reported);

  let md = '';
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const items = grouped[key];
    if (items.length === 0) continue;
    md += `### ${label}\n\n`;
    for (const item of items) md += `- ${item}\n`;
    md += '\n';
  }
  return md;
}

// A recognized type contributes its description; anything else contributes the whole subject, since
// there is no prefix to strip off it.
function groupByType(reported) {
  const grouped = Object.fromEntries(Object.keys(CATEGORY_LABELS).map((key) => [key, []]));

  for (const subject of reported) {
    const match = subject.match(CONVENTIONAL_SUBJECT);
    const type = match?.[1];
    if (type && Object.hasOwn(grouped, type)) grouped[type].push(match[2]);
    else grouped.other.push(subject);
  }

  return grouped;
}
