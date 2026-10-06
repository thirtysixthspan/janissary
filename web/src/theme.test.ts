import { describe, expect, it } from 'vitest';
import theme from './theme.css?raw';
import pluginShared from './plugins/shared.css?raw';

describe('editor theme', () => {
  it('wraps editor sentences at word boundaries', () => {
    const editorContentRule = theme
      .split('\n')
      .find((line) => line.startsWith('.editor-content'));

    expect(editorContentRule).toContain('overflow-wrap: break-word');
    expect(editorContentRule).not.toContain('word-break: break-all');
  });
});

describe('metadata theme', () => {
  it('makes every host metadata text container selectable', () => {
    const metadataRule = theme.match(
      /\.tab-meta, \.monitor-meta, \.files-meta, \.editor-meta \{[^}]+\}/,
    )?.[0];

    expect(metadataRule).toBeDefined();
    expect(metadataRule).toContain('user-select: text');
    expect(metadataRule).not.toContain('user-select: none');
  });

  it('stacks the docked file navigator header onto two lines', () => {
    const dockedRule = theme.match(/\.files-header--docked \{[^}]+\}/)?.[0];
    const actionRule = theme.match(
      /\.tab-meta-actions, \.monitor-actions, \.editor-actions, \.files-actions \{[^}]+\}/,
    )?.[0];

    expect(dockedRule).toContain('flex-direction: column');
    expect(actionRule).toContain('margin-left: auto');
  });

  it('wraps the file navigator header buttons onto more rows when they do not fit', () => {
    const actionRule = theme.match(/^\.files-actions \{[^}]+\}/m)?.[0];

    expect(actionRule).toContain('flex-wrap: wrap');
    expect(actionRule).toContain('justify-content: flex-end');
    expect(actionRule).toContain('max-width: 100%');
  });

  it('lets the file navigator header drop its buttons below the root path', () => {
    const headerRule = theme.match(/^\.files-header \{[^}]+\}/m)?.[0];
    const metaRule = theme.match(/^\.files-meta \{[^}]+\}/m)?.[0];

    expect(headerRule).toContain('flex-wrap: wrap');
    expect(metaRule).toContain('flex: 1 1 16ch');
  });

  it('keeps host metadata action groups at the right edge', () => {
    const actionRule = theme.match(
      /\.tab-meta-actions, \.monitor-actions, \.editor-actions, \.files-actions \{[^}]+\}/,
    )?.[0];

    expect(actionRule).toBeDefined();
    expect(actionRule).toContain('margin-left: auto');
  });

  // The recording flag is the one flag in this row that is also a control, so it is a `<button>` and
  // carries a class the plain flags do not. That class sits *after* `.tab-flag--active` in this file,
  // which is the whole hazard: two single-class rules, and whichever comes last wins. So the rule that
  // resets the button's chrome must not declare a colour, or it silently takes the lit green away from
  // the flag in both of its states — a bug that renders, that no component test can see, and that a
  // test asserting the class name sails straight past.
  it('leaves the recording flag\'s green to the active-flag rule', () => {
    const recordingRule = theme.match(/^\.tab-recording \{[^}]+\}/m)?.[0];
    const activeRule = theme.match(/^\.tab-flag--active \{[^}]+\}/m)?.[0];

    expect(recordingRule).toBeDefined();
    expect(activeRule).toContain('color: var(--success)');
    expect(recordingRule).not.toContain('color:');
    expect(theme.indexOf('.tab-recording {')).toBeGreaterThan(theme.indexOf('.tab-flag--active {'));
  });

  // The same class is on the inert `<span>`, and there the pointer and the hover are both untrue. A
  // hand cursor over a flag that cannot be pressed misreports the one thing the flag exists to say.
  it('gives the recording flag its pointer only when it is a button', () => {
    expect(theme).toMatch(/^button\.tab-recording \{[^}]*cursor: pointer/m);
    expect(theme).toMatch(/^button\.tab-recording:hover \{/m);
    expect(theme).not.toMatch(/^\.tab-recording \{[^}]*cursor/m);
    expect(theme).not.toMatch(/^\.tab-recording:hover/m);
  });

  // The plugin half of the two rules above. Splitting them is what keeps a plugin's styling inside
  // its own lazy chunk, so the host stylesheet must not carry a plugin selector back in.
  it('leaves plugin metadata containers to the plugin stylesheets', () => {
    expect(pluginShared).toContain('.plugin-meta');
    expect(pluginShared).toContain('user-select: text');
    expect(pluginShared).toContain('.plugin-actions');
    expect(theme).not.toContain('.plugin-meta');
    expect(theme).not.toContain('.plugin-actions');
  });

  it('keeps a plugin header size on one line', () => {
    const sizeRule = pluginShared.match(/\.plugin-meta \.plugin-size \{[^}]+\}/)?.[0];

    expect(sizeRule).toContain('white-space: nowrap');
    expect(theme).not.toContain('.plugin-size');
  });
});

describe('plugin stylesheet ownership', () => {
  it('keeps every plugin-owned selector out of the application stylesheet', () => {
    for (const selector of ['.plugin-tab', '.plugin-stage', '.image-edit-', '.image-crop-', '.audio-', '.markdown-stage', '.page-tab', '.schedules-']) {
      expect(theme).not.toContain(selector);
    }
  });

  // `.tab-split` is rendered by the host's own SplitTabButton as well as by a plugin, so it is the
  // one control in this family that stays with the host.
  it('keeps the host-rendered split control in the application stylesheet', () => {
    expect(theme).toContain('.tab-split');
  });
});

describe('tab strip theme', () => {
  it('makes tab labels non-selectable', () => {
    const tabRule = theme.match(/^\.tab \{[^}]+\}/m)?.[0];

    expect(tabRule).toBeDefined();
    expect(tabRule).toContain('user-select: none');
  });
});

describe('notification theme', () => {
  it('sets a notification line\'s file links side by side with no gap between them', () => {
    const groupRule = theme.match(/\.line\.message \.message-files \{[^}]+\}/)?.[0];

    expect(groupRule).toBeDefined();
    expect(groupRule).toContain('display: inline-flex');
    expect(groupRule).not.toContain('gap');
  });
});
