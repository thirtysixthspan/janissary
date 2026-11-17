const FIRST_BASE = 0x01_00_01_93;
const SECOND_BASE = 0x9e_37_79_b1;

type LineEntry = { id: number; positions: number[] };

type LineTable = {
  key: (line: string) => string;
  entries: Map<string, LineEntry>;
  first: Uint32Array;
  second: Uint32Array;
  powersFirst: Uint32Array;
  powersSecond: Uint32Array;
};

type BlockHash = { first: number; second: number };

export type LineSearch = {
  findLine(line: string, from: number): number;
  findBlock(block: string[], from: number, endOfFile: boolean): number;
};

const exactKey = (line: string): string => line;
const relaxedKey = (line: string): string => line.trimEnd();

function createTable(lines: readonly string[], key: (line: string) => string): LineTable {
  const entries = new Map<string, LineEntry>();
  const ids = new Uint32Array(lines.length);
  for (const [index, line] of lines.entries()) {
    const text = key(line);
    const entry = entries.get(text);
    const id = entry ? entry.id : entries.size;
    if (entry) entry.positions.push(index);
    else entries.set(text, { id, positions: [index] });
    ids[index] = id + 1;
  }
  const first = new Uint32Array(lines.length + 1);
  const second = new Uint32Array(lines.length + 1);
  const powersFirst = new Uint32Array(lines.length + 1);
  const powersSecond = new Uint32Array(lines.length + 1);
  powersFirst[0] = 1;
  powersSecond[0] = 1;
  for (let index = 0; index < lines.length; index += 1) {
    const id = ids[index];
    first[index + 1] = (Math.imul(first[index], FIRST_BASE) + id) >>> 0;
    second[index + 1] = (Math.imul(second[index], SECOND_BASE) + id) >>> 0;
    powersFirst[index + 1] = Math.imul(powersFirst[index], FIRST_BASE) >>> 0;
    powersSecond[index + 1] = Math.imul(powersSecond[index], SECOND_BASE) >>> 0;
  }
  return { key, entries, first, second, powersFirst, powersSecond };
}

function lowerBound(positions: readonly number[], from: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (positions[middle] < from) low = middle + 1;
    else high = middle;
  }
  return low;
}

function hashBlock(table: LineTable, block: readonly string[]): BlockHash | undefined {
  let first = 0;
  let second = 0;
  for (const line of block) {
    const entry = table.entries.get(table.key(line));
    if (!entry) return undefined;
    const id = entry.id + 1;
    first = (Math.imul(first, FIRST_BASE) + id) >>> 0;
    second = (Math.imul(second, SECOND_BASE) + id) >>> 0;
  }
  return { first, second };
}

function sameHash(table: LineTable, start: number, length: number, hash: BlockHash): boolean {
  const first = (table.first[start + length] - Math.imul(table.first[start], table.powersFirst[length])) >>> 0;
  const second = (table.second[start + length] - Math.imul(table.second[start], table.powersSecond[length])) >>> 0;
  return first === hash.first && second === hash.second;
}

function matchesAt(table: LineTable, lines: readonly string[], block: readonly string[], start: number): boolean {
  for (const [offset, line] of block.entries()) {
    if (table.key(lines[start + offset]) !== table.key(line)) return false;
  }
  return true;
}

function nextPosition(table: LineTable, line: string, from: number): number {
  const entry = table.entries.get(table.key(line));
  if (!entry) return -1;
  const index = lowerBound(entry.positions, from);
  return index < entry.positions.length ? entry.positions[index] : -1;
}

function searchBlock(table: LineTable, lines: readonly string[], block: readonly string[], from: number, last: number): number {
  const entry = table.entries.get(table.key(block[0]));
  const hash = entry ? hashBlock(table, block) : undefined;
  if (!entry || !hash) return -1;
  for (let index = lowerBound(entry.positions, from); index < entry.positions.length; index += 1) {
    const start = entry.positions[index];
    if (start > last) break;
    if (sameHash(table, start, block.length, hash) && matchesAt(table, lines, block, start)) return start;
  }
  return -1;
}

export function createLineSearch(lines: readonly string[]): LineSearch {
  let exact: LineTable | undefined;
  let relaxed: LineTable | undefined;
  const exactTable = (): LineTable => {
    exact ??= createTable(lines, exactKey);
    return exact;
  };
  const relaxedTable = (): LineTable => {
    relaxed ??= createTable(lines, relaxedKey);
    return relaxed;
  };
  return {
    findLine: (line: string, from: number): number => {
      const found = nextPosition(exactTable(), line, from);
      return found >= 0 ? found : nextPosition(relaxedTable(), line, from);
    },
    findBlock: (block: string[], from: number, endOfFile: boolean): number => {
      if (block.length === 0) return endOfFile ? lines.length : from;
      const last = lines.length - block.length;
      if (last < from) return -1;
      const begin = endOfFile ? last : from;
      const found = searchBlock(exactTable(), lines, block, begin, last);
      return found >= 0 ? found : searchBlock(relaxedTable(), lines, block, begin, last);
    },
  };
}
