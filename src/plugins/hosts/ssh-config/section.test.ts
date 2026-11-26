import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readEffectiveAliases } from './parse.js';
import { findManagedSections, serializeManagedSection, spliceManagedSection } from './section.js';

const BEGIN = '# BEGIN janissary hosts';
const END = '# END janissary hosts';
const HEADER = '# Managed by Janissary; edits inside this section are replaced on export.';

describe('findManagedSections', () => {
  it('finds a complete pair with an inclusive range and ignores unmatched markers', () => {
    const text = `${BEGIN}\nHost inside\n  HostName in.example\n${END}\n`;
    const found = findManagedSections(text);
    expect(found.ranges).toEqual([{ start: 0, end: text.length }]);
    expect(found.remainingText).toBe('');
    expect(found.outsideAliases).toEqual([]);

    const loneBegin = `Host keep\n${BEGIN}\nHost orphan\n`;
    expect(findManagedSections(loneBegin).ranges).toEqual([]);
    expect(findManagedSections(loneBegin).remainingText).toBe(loneBegin);
    expect(findManagedSections(loneBegin).outsideAliases).toEqual(['keep', 'orphan']);

    const loneEnd = `${END}\nHost keep\n`;
    expect(findManagedSections(loneEnd).ranges).toEqual([]);
    expect(findManagedSections(loneEnd).outsideAliases).toEqual(['keep']);
  });

  it('pairs the first BEGIN with the END and leaves a nested BEGIN inside the section', () => {
    const text = [BEGIN, BEGIN, 'Host nested', END].join('\n') + '\n';
    expect(findManagedSections(text).ranges).toEqual([{ start: 0, end: text.length }]);
    expect(findManagedSections(text).remainingText).toBe('');
    expect(findManagedSections(text).outsideAliases).toEqual([]);
  });

  it('treats indented markers and markers with extra text as ordinary lines', () => {
    const text = [
      `  ${BEGIN}`,
      'Host keep',
      `${BEGIN} extra`,
      `${END} extra`,
      `${END} `,
    ].join('\n') + '\n';
    const found = findManagedSections(text);
    expect(found.ranges).toEqual([]);
    expect(found.remainingText).toBe(text);
    expect(found.outsideAliases).toEqual(['keep']);
  });

  it('reports literal aliases outside complete sections only', () => {
    const text = [
      'Host Keep',
      '  HostName keep.example',
      'Host web*',
      'Match host ghost',
      BEGIN,
      'Host inside',
      END,
      'Host partialKeep',
      BEGIN,
      'Host inPartial',
      '# no END here',
      'Host keep',
    ].join('\n');
    const found = findManagedSections(text);
    expect(found.ranges).toHaveLength(1);
    expect(found.outsideAliases).toEqual(['Keep', 'partialKeep', 'inPartial']);
    expect(found.outsideAliases).not.toContain('inside');
  });

  it('classifies literal names the same way as the alias reader', () => {
    const text = [
      'Host Keep',
      'Host web1',
      'Host keep',
      'Host web*',
      'Host !blocked',
      'Host ""',
    ].join('\n');
    const outside = findManagedSections(text).outsideAliases;
    expect(outside).toEqual(['Keep', 'web1']);
    expect(outside).toEqual(readEffectiveAliases(text).map((alias) => alias.name));
  });
});

describe('serializeManagedSection', () => {
  it('writes the header and indented settings from stored fields, with no path line', () => {
    const stored = { name: 'dev', host: 'dev.example', user: 'ops', port: 2200, path: '/srv' };
    expect(serializeManagedSection([stored])).toBe([
      BEGIN,
      HEADER,
      'Host dev',
      '    HostName dev.example',
      '    User ops',
      '    Port 2200',
      END,
      '',
    ].join('\n'));
  });

  it('orders hosts case-insensitively with one blank line between them', () => {
    expect(serializeManagedSection([
      { name: 'zeta', host: 'z.example' },
      { name: 'Alpha', host: 'a.example' },
      { name: 'beta', host: 'b.example', user: 'ops' },
    ])).toBe([
      BEGIN,
      HEADER,
      'Host Alpha',
      '    HostName a.example',
      '',
      'Host beta',
      '    HostName b.example',
      '    User ops',
      '',
      'Host zeta',
      '    HostName z.example',
      END,
      '',
    ].join('\n'));
  });

  it('serializes a header-only section for an empty host list', () => {
    expect(serializeManagedSection([])).toBe(`${BEGIN}\n${HEADER}\n${END}\n`);
  });
});

describe('spliceManagedSection', () => {
  it('appends a section after the last line when none is complete', () => {
    const section = serializeManagedSection([{ name: 'alpha', host: 'alpha.example' }]);
    expect(spliceManagedSection('Host keep\n  HostName keep.example', [], section)).toBe(
      `Host keep\n  HostName keep.example\n${section}`,
    );
    expect(spliceManagedSection('', [], section)).toBe(section);
    const crlf = 'Host keep\r\n  HostName keep.example\r\n';
    expect(spliceManagedSection(crlf, [], section)).toBe(`${crlf}${section}`);
  });

  it('rewrites the first section and removes later ones', () => {
    const section = serializeManagedSection([{ name: 'alpha', host: 'alpha.example' }]);
    const text = [
      'Host keep',
      BEGIN,
      'Host old',
      END,
      'Host between',
      BEGIN,
      'Host duplicate',
      END,
      'Host tail',
      '',
    ].join('\n');
    expect(spliceManagedSection(text, findManagedSections(text).ranges, section)).toBe(
      `Host keep\n${section}Host between\nHost tail\n`,
    );
  });

  it('keeps every byte outside sections, including CRLF and a missing trailing newline', () => {
    const section = serializeManagedSection([{ name: 'alpha', host: 'alpha.example' }]);
    const text = [
      'Host keep',
      '  HostName keep.example',
      BEGIN,
      'Host old',
      END,
      'Host middle',
      BEGIN,
      'Host old2',
      END,
      'Host lower',
      '  Port 2200',
    ].join('\r\n');
    const found = findManagedSections(text);
    expect(spliceManagedSection(text, found.ranges, section)).toBe(
      `Host keep\r\n  HostName keep.example\r\n${section}Host middle\r\nHost lower\r\n  Port 2200`,
    );
    expect(found.outsideAliases).toEqual(['keep', 'middle', 'lower']);
  });

  it('splices the verification config while keeping its outside block byte for byte', () => {
    const section = serializeManagedSection([{
      name: 'web1', host: 'web1.corp.example', user: 'ops',
    }]);
    const text = [
      'Host keep',
      '  HostName keep.example',
      BEGIN,
      'Host stale',
      '    HostName stale.example',
      END,
      BEGIN,
      'Host duplicate',
      END,
      'Host tail',
      '',
    ].join('\n');
    const found = findManagedSections(text);
    const spliced = spliceManagedSection(text, found.ranges, section);
    expect(spliced).toBe(`Host keep\n  HostName keep.example\n${section}Host tail\n`);
    expect(found.outsideAliases).toEqual(['keep', 'tail']);
    expect(spliced).toContain(HEADER);
    expect(spliced).toContain('    HostName web1.corp.example');
    expect(spliced).not.toContain('Host stale');
    expect(spliced).not.toContain('Host duplicate');
  });
});

describe('module imports', () => {
  it('keeps imports inside ./ or package specifiers with .js extensions', () => {
    for (const file of ['./section.ts', './section.test.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const entry of source.matchAll(/^import .* from '([^']+)';/gm)) {
        const specifier = entry[1] ?? '';
        expect(specifier).not.toContain('../');
        if (specifier.startsWith('.')) expect(specifier).toMatch(/\.js$/);
      }
    }
  });
});
