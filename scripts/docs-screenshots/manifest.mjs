// The shot manifest for `./scripts/run.mjs docs-screenshots`. One entry per screenshot used by
// the pages in public-documentation/; the entry name is the output filename, so a doc page's
// image path (/screenshots/<name>.png) stays stable across reruns.
//
// Each entry may carry:
//   setup          commands typed into the command bar, one at a time (Enter after each).
//                  `{{PAGE_URL}}` is replaced with the fixture web server's URL.
//   actions        staged input after setup: { type } text without submitting, { press } a key
//                  (Playwright key syntax), { wait } milliseconds.
//   target         the data-doc-shot attribute of the element to crop to, or 'page' for the
//                  whole viewport.
//   settle         milliseconds to wait after each setup command (default 800).
//   cropToChildren narrow the crop to the extent of these child elements (e.g. the tab strip
//                  spans the viewport but its tabs occupy the left edge).
//   clipHeight     cut the crop below this many CSS pixels, for tall bodies whose content sits
//                  at the top.
//   stabilize      'busy-dot' waits for the blinking busy dot's lit phase, so a still can't
//                  catch it dark.
//   requiresBinary skip this shot (with a warning) unless the binary is on PATH; those shots
//                  are captured manually on a machine that has it.
export default [
  // Getting started: the window on first launch, and the tab strip's signals.
  { name: 'app-overview', setup: [], target: 'page' },
  {
    name: 'tabs-overview',
    setup: ['agent bilal', 'shell sleep 30', 'agent cavus', 'msg janus info morning report ready'],
    stabilize: 'busy-dot',
    target: 'tab-strip',
    cropToChildren: '.tab',
  },
  {
    name: 'tabs-groups',
    setup: ['agent bilal', 'profile launch demo'],
    settle: 1500,
    target: 'tab-strip',
    cropToChildren: '.tab',
  },

  // Command bar.
  { name: 'tab-completion', actions: [{ type: 'open sa' }, { press: 'Tab' }], target: 'command-bar' },
  { name: 'shell-output', setup: ['shell ls -la'], settle: 1200, target: 'transcript', clipHeight: 400 },
  {
    name: 'history-picker',
    setup: ['shell ls -la', 'shell git status', 'state'],
    actions: [{ press: 'Control+r' }],
    target: 'history-overlay',
  },
  { name: 'ghost-text', setup: ['shell git status'], actions: [{ type: 'shell git' }], target: 'command-bar' },

  // View tabs.
  { name: 'image-tab', setup: ['open ./sample.png'], actions: [{ press: 'PageUp' }], target: 'image-view' },
  { name: 'markdown-tab', setup: ['open ./sample.md'], target: 'markdown-view' },
  { name: 'page-tab', setup: ['open {{PAGE_URL}}'], settle: 2000, target: 'page-view' },
  {
    name: 'editor-tab',
    setup: ['edit ./sample.ts'],
    actions: [{ type: '// TODO: tighten these types' }],
    target: 'editor-view',
    clipHeight: 560,
  },
  {
    name: 'file-tree',
    setup: ['files .'],
    actions: [{ press: 'ArrowDown' }, { press: 'ArrowDown' }, { press: 'ArrowRight' }, { wait: 500 }],
    target: 'file-tree-view',
    clipHeight: 380,
  },
  {
    name: 'file-tree-sidebar',
    setup: ['files left .'],
    settle: 1000,
    target: 'sidebar-left',
  },

  // Advanced agents and automation.
  {
    name: 'workspaced-agent',
    setup: ['agent emrah --workspace', 'shell pwd'],
    settle: 2500,
    target: 'status-panels',
  },
  {
    name: 'schedule-window',
    setup: ['schedule standup every day at 9:00 state', 'schedule tests every 2h shell ls'],
    target: 'status-panels',
  },
  {
    name: 'profile-group',
    setup: ['profile launch demo'],
    settle: 1500,
    target: 'tab-strip',
    cropToChildren: '.tab',
  },
  {
    name: 'harness-tab',
    setup: ['harness claude'],
    settle: 5000,
    target: 'harness-view',
    clipHeight: 540,
    requiresBinary: 'claude',
  },
];
