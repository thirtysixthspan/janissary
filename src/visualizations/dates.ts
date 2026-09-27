// Recognizing an unambiguous date, and refusing to guess at one.
//
// The pattern alone is not enough, which is the whole reason this file exists. `Date.parse` checks no
// calendar: it reads `2024-02-31` as the second of March and `2023-02-29` as the first of March, so a
// column of typos would type as a date and then plot the rollovers as if they were real instants. The
// calendar check below is what makes "this is a date" a statement about the data rather than about the
// shape of its text.
//
// Recognition is the server's alone. The client is handed the type and parses the value, so this
// validator has exactly one implementation and cannot disagree with itself.

// Four patterns and no optional groups anywhere, and that is the reason rather than a style. An optional
// group wrapping anything quantified is the shape `security/detect-unsafe-regex` exists to refuse, and
// suppressing that rule to save three lines would be a worse trade than writing them out. So the date,
// the fraction, the seconds and the minutes each get their own pattern, longest first, and what is left
// over is checked to be a zone or nothing at all.
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const FRACTION = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})\.\d+/u;
const SECOND = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/u;
const MINUTE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/u;
const ZONE = /^(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/u;

// Longest first: `2026-01-31T09:00` must not be read as `09:00:30` truncated, and the minute pattern
// would happily match the first eight characters of a timestamp with seconds.
const SHAPES = [FRACTION, SECOND, MINUTE] as const;

function zoneOrNothing(rest: string): boolean {
  return rest === '' || ZONE.test(rest);
}

type Parts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
};

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  // A table of lengths rather than a Date round-trip: constructing a Date to check a date is the same
  // trust in the thing being checked that this file exists to avoid.
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

function partsOf(value: string): Parts | undefined {
  const text = value.trim();
  const date = DATE.exec(text);
  if (date) return { year: Number(date[1]), month: Number(date[2]), day: Number(date[3]) };
  for (const shape of SHAPES) {
    const found = shape.exec(text);
    if (!found) continue;
    if (!zoneOrNothing(text.slice(found[0].length))) continue;
    return {
      year: Number(found[1]),
      month: Number(found[2]),
      day: Number(found[3]),
      hour: Number(found[4]),
      minute: Number(found[5]),
      ...(found[6] !== undefined && { second: Number(found[6]) }),
    };
  }
  return undefined;
}

// Every field in range, so that `2024-13-01` and an hour of `24` are text rather than dates that roll.
function inCalendar(parts: Parts): boolean {
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) return false;
  if (parts.hour !== undefined && parts.hour > 23) return false;
  if (parts.minute !== undefined && parts.minute > 59) return false;
  return parts.second === undefined || parts.second <= 59;
}

// Whether a value is a date this feature is willing to call one. ISO 8601 only: `2024-6-1` and
// `06/01/2024` are both readable by `Date.parse` and both ambiguous to a person — the second could be
// June or March — so a column in either format stays a category, which is what it is today.
export function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = partsOf(value);
  return parts !== undefined && inCalendar(parts);
}

// The instant a date names, in milliseconds. A timestamp carrying no offset is read in the browser's
// local zone, which is what `Date.parse` does with it; choosing a zone instead is a decision this
// feature does not make on a user's behalf, and the module comment says so.
export function instantOf(value: string): number {
  return Date.parse(value.trim());
}
