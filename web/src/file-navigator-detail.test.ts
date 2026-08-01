import { describe, it, expect } from 'vitest';
import {
  detailTooltip, formatModified, formatPermissions, formatSize, nextDetail, rowDetail,
} from './file-navigator-detail';
import type { FileNavigatorRow } from '@shared/protocol';

const row = (extra: Partial<FileNavigatorRow> = {}): FileNavigatorRow => ({
  path: 'a.txt', name: 'a.txt', depth: 0, dir: false, ...extra,
});

describe('nextDetail', () => {
  it('cycles name → size → modified → permissions → name', () => {
    expect(nextDetail('name')).toBe('size');
    expect(nextDetail('size')).toBe('modified');
    expect(nextDetail('modified')).toBe('permissions');
    expect(nextDetail('permissions')).toBe('name');
  });

  it('treats an absent mode as name', () => {
    expect(nextDetail(undefined)).toBe('size');
  });
});

describe('detailTooltip', () => {
  it('names each mode', () => {
    expect(detailTooltip('name')).toBe('Show name only');
    expect(detailTooltip('size')).toBe('Show size');
    expect(detailTooltip('modified')).toBe('Show modified');
    expect(detailTooltip('permissions')).toBe('Show permissions');
  });
});

describe('formatSize', () => {
  it('renders each unit with no decimals', () => {
    expect(formatSize(0)).toBe('0b');
    expect(formatSize(22)).toBe('22b');
    expect(formatSize(24 * 1024)).toBe('24k');
    expect(formatSize(32 * 1024 * 1024)).toBe('32M');
    expect(formatSize(5 * 1024 * 1024 * 1024)).toBe('5G');
  });

  it('switches unit exactly at 1024', () => {
    expect(formatSize(1023)).toBe('1023b');
    expect(formatSize(1024)).toBe('1k');
  });

  it('is empty for a missing size', () => {
    expect(formatSize(undefined)).toBe('');
  });
});

describe('formatModified', () => {
  it('renders month, zero-padded day, and a 24-hour time', () => {
    expect(formatModified(new Date(2024, 6, 13, 23, 29).getTime())).toBe('Jul 13 23:29');
  });

  it('renders midnight as 00:00 rather than 24:00', () => {
    expect(formatModified(new Date(2024, 0, 5, 0, 0).getTime())).toBe('Jan 05 00:00');
  });

  it('is empty for a missing timestamp', () => {
    expect(formatModified(undefined)).toBe('');
  });
});

describe('formatPermissions', () => {
  it('renders a regular file, a directory, and a symlink', () => {
    expect(formatPermissions(0o10_0644)).toBe('-rw-r--r--');
    expect(formatPermissions(0o04_0755)).toBe('drwxr-xr-x');
    expect(formatPermissions(0o12_0777)).toBe('lrwxrwxrwx');
  });

  it('is empty for a missing mode', () => {
    expect(formatPermissions(undefined)).toBe('');
  });
});

describe('rowDetail', () => {
  it('picks the value the mode asks for', () => {
    expect(rowDetail(row({ size: 22 }), 'size')).toBe('22b');
    expect(rowDetail(row({ mode: 0o04_0755, dir: true }), 'permissions')).toBe('drwxr-xr-x');
  });

  it('is empty in name mode, with no mode, and for a row missing the value', () => {
    expect(rowDetail(row({ size: 22 }), 'name')).toBe('');
    expect(rowDetail(row({ size: 22 }), undefined)).toBe('');
    expect(rowDetail(row(), 'size')).toBe('');
  });
});
