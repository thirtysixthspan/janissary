import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TAB_PLUGIN_CAPABILITY_NAMES } from './api.js';
import { TAB_PLUGIN_NOTIFICATION_TOPICS } from './api-topics.js';
import { fixtureV1Manifest } from './fixture-v1/manifest.js';

// `documentation/developer-documentation/tab-plugins.md` presents itself as the authoritative
// description of the v1 contract, and presents `fixture-v1` as the worked example the test suite
// runs. Both claims were untrue for a while: the doc's manifest block had lost `rejectRequest` and
// its prose capability count had to be maintained by hand. Nothing here checks prose style — these
// assertions only pin the two facts a reader would copy straight into a new plugin.
const documentation = readFileSync(
  new URL('../../documentation/developer-documentation/tab-plugins.md', import.meta.url), 'utf8',
);
const specification = readFileSync(new URL('../../product/specs/tab-plugins.md', import.meta.url), 'utf8');
const guideline = readFileSync(new URL('../../ai/guidelines/plugins-tabs.md', import.meta.url), 'utf8');

const COUNT_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine',
  'thirty', 'thirty-one', 'thirty-two', 'thirty-three', 'thirty-four', 'thirty-five', 'thirty-six',
  'thirty-seven', 'thirty-eight', 'thirty-nine', 'forty', 'forty-one', 'forty-two',
  'forty-three', 'forty-four', 'forty-five', 'forty-six',
];

// The client-side count is a literal because its capability object lives in the web project, which
// this server-side test cannot import without dragging the client entry into the server graph. Raise
// it in the same change that adds a client capability, or the assertion below passes for the wrong
// reason once the two drift apart.
const CLIENT_CAPABILITY_COUNT_WORD = 'fourteen';

describe('tab plugin developer documentation', () => {
  it('shows the fixture manifest the repository actually ships', () => {
    const block = /```ts\n(?<manifest>export const fixtureV1Manifest = \{[^`]*?)```/u
      .exec(documentation)?.groups?.manifest;
    expect(block).toBeDefined();

    const documented = /capabilities: \[(?<list>[^\]]*)\]/u.exec(block ?? '')?.groups?.list;
    expect(documented).toBeDefined();
    const names = [...(documented ?? '').matchAll(/'(?<name>[^']+)'/gu)]
      .map((match) => match.groups?.name);
    expect(names).toEqual([...fixtureV1Manifest.capabilities]);

    // The real manifest names its schema constant rather than repeating the literal, so a bump in
    // one place cannot leave the documented example claiming the old number.
    expect(block).toContain('payloadSchemaVersion: FIXTURE_PAYLOAD_SCHEMA_VERSION');
    expect(block).toContain(`command: '${fixtureV1Manifest.command}'`);
  });

  it('documents every server capability the host actually supplies', () => {
    const count = TAB_PLUGIN_CAPABILITY_NAMES.length;
    expect(documentation).toContain(`The host supplies ${COUNT_WORDS[count]} capabilities:`);
    for (const capability of TAB_PLUGIN_CAPABILITY_NAMES) {
      expect(documentation).toContain(`- \`${capability}(`);
    }
  });

  // The topic count is hand-kept in three docs, so each doc's own sentence is pinned to the topic
  // list the code declares.
  it('states the notification topic count in each doc that carries it', () => {
    const word = COUNT_WORDS[TAB_PLUGIN_NOTIFICATION_TOPICS.length];
    expect(documentation).toContain(`v2 defines ${word} topics`);
    expect(specification).toContain(`This version defines ${word} kinds of host state`);
    expect(guideline).toContain(`v2 defines ${word} topics`);
  });

  it('keeps the API changelog honest about the same count', () => {
    const word = COUNT_WORDS[TAB_PLUGIN_CAPABILITY_NAMES.length];
    // The changelog entry opens a sentence, so match the count word however it is capitalized.
    expect(documentation.toLowerCase())
      .toContain(`${word} server and ${CLIENT_CAPABILITY_COUNT_WORD} client capabilities.`);
  });
});
