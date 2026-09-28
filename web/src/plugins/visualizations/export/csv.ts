// The rows a chart was drawn from, as text.
//
// The table under a card is the chart's own data in HTML, and this is the same rows in a file anyone can
// open in anything: a spreadsheet, a notebook, a diff. Datawrapper and Flourish both ship it for the same
// reason — it is the export a reader who cannot see the picture most needs, and it is the one that
// survives being pasted into an issue.
//
// Generated from the marks rather than from the source, for the reason the table is: a chart over a
// transformed table is a chart of the transformed table, and a CSV of the source would answer a different
// question than the picture does.

// The shape of the table this is given, declared here rather than imported: a tab plugin reaches its own
// modules only through the shared contract, and two structural types need no contract between them.
export type CsvCell = string | number;

export type CsvTable = { columns: { name: string }[]; rows: CsvCell[][] };

// A leading # line, which every spreadsheet and every diff tool treats as a comment, naming what the rows
// are — so a file found on its own three months later still says which chart and which transformations
// produced it.
export type CsvHeader = { title: string; source: string; notes: readonly string[] };

export function csvOf(data: CsvTable, header: CsvHeader): string {
  const columns = data.columns.map((column) => field(column.name)).join(',');
  const rows = data.rows.map((row) => row.map((cell) => cellOf(cell)).join(','));
  const context = [
    ` # ${field(header.title)}`,
    ...header.notes.map((note) => ` # ${field(note)}`),
    ` # ${field(header.source)}`,
  ];
  return [...context, columns, ...rows].join('\n') + '\n';
}

// A value that would otherwise end the row, end the field, or arrive as a formula. The last is the one
// that bites: a cell beginning =, + or - is read as a formula by every spreadsheet, and data out of
// somebody's log beginning with a minus sign is not a formula.
function cellOf(cell: CsvCell): string {
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  // A cell that opens with one of these is a formula to a spreadsheet and a number to a person, and the
  // two readings differ, so it is quoted and both are visible.
  if (/^[=+\-@\t\r]/u.test(cell)) return quoted(cell);
  return field(cell);
}

// Quoting follows RFC 4180: a field is quoted when it contains a delimiter, a quote or a line break, and
// a quote inside it is doubled. A value holding a comma is the common case and the one a naive join turns
// into three columns.
function field(value: string): string {
  return /[",\n\r]/u.test(value) ? quoted(value) : value;
}

function quoted(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
