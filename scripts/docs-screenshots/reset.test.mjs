import { describe, expect, it, vi } from 'vitest';
import { resetApp, resetProfile } from './reset.mjs';

// A stand-in for the running app: enough tab-strip behaviour to drive the whole reset choreography
// without a browser. Tabs live in the centre strip unless marked `sidebar`; `agent <name>` and
// `profile launch <name>` each open a tab and focus it; a tab marked `dirty` raises the save dialog
// on close and only goes once the dialog's discard button is clicked.
const CLOSABLE = [
  '.center-strip-left .tab:not(.active)',
  '.center-strip-right .tab',
  '.sidebar .tab',
  '.reporting-strip .tab',
].join(', ');

const centerTabs = (app) => app.tabs.filter((tab) => tab.strip !== 'sidebar');
const activeCenterTab = (app) => centerTabs(app).find((tab) => tab.active);
const closableTabs = (app) => app.tabs.filter((tab) => tab.strip === 'sidebar' || !tab.active);

function focus(app, target) {
  for (const tab of app.tabs) tab.active = tab === target;
}

function openTab(app, label) {
  const tab = { label, commandBar: true, active: false };
  app.tabs.push(tab);
  focus(app, tab);
}

function removeTab(app, target) {
  app.tabs = app.tabs.filter((tab) => tab !== target);
  app.log.push(`close:${target.label}`);
}

function submit(app) {
  const text = app.typed;
  app.typed = '';
  app.log.push(`run:${text}`);
  const agent = /^agent (\S+)$/.exec(text);
  if (agent) openTab(app, agent[1]);
  else if (text.startsWith('profile launch ')) openTab(app, 'janus');
}

function closeTab(app, target) {
  if (!target) return;
  if (target.dirty) {
    app.dialog = target;
    return;
  }
  removeTab(app, target);
}

function select(app, selector) {
  switch (selector) {
  case '.command textarea': { return activeCenterTab(app)?.commandBar ? [{ label: 'command' }] : []; }
  case '.center-strip-left .tab': { return centerTabs(app); }
  case '.center-strip-left .tab.active': { const tab = activeCenterTab(app); return tab ? [tab] : []; }
  case '.center-strip-left .tab.active .dot.busy': { return activeCenterTab(app)?.busy ? [{ label: 'busy' }] : []; }
  case CLOSABLE: { return closableTabs(app); }
  case '.modal-button': { return app.dialog ? [{ label: "Don't Save (n)" }] : []; }
  case '.tab': { return app.tabs; }
  default: { return []; }
  }
}

function nodes(app, selector, options) {
  const all = select(app, selector);
  return options?.hasText ? all.filter((node) => node.label.includes(options.hasText)) : all;
}

function clickNode(app, selector, node) {
  if (selector === '.center-strip-left .tab') {
    focus(app, node);
  } else if (selector === '.modal-button') {
    const target = app.dialog;
    app.dialog = undefined;
    removeTab(app, target);
  }
}

// The two children a tab locator is asked for: its close button, and its busy dot.
function childLocator(app, child, node) {
  return {
    count: async () => (child === '.dot.busy' && node?.busy ? 1 : 0),
    click: async () => { closeTab(app, node); },
  };
}

function makeLocator(app, selector, options, index) {
  return {
    count: async () => nodes(app, selector, options).length,
    first: () => makeLocator(app, selector, options, 0),
    nth: (at) => makeLocator(app, selector, options, at),
    isVisible: async () => nodes(app, selector, options).length > 0,
    waitFor: async (waitOptions) => {
      const found = nodes(app, selector, options).length;
      if (waitOptions?.state === 'detached') {
        if (found > 0) throw new Error(`still attached: ${selector}`);
        return;
      }
      if (found === 0) throw new Error(`never appeared: ${selector}`);
    },
    fill: async (value) => { app.typed = value; app.log.push('clear-command-bar'); },
    click: async () => { clickNode(app, selector, nodes(app, selector, options)[index]); },
    locator: (child) => childLocator(app, child, nodes(app, selector, options)[index]),
  };
}

function fakeApp(tabs) {
  const app = { tabs: tabs.map((tab) => ({ ...tab })), dialog: undefined, typed: '', log: [] };
  app.page = {
    keyboard: {
      press: async (key) => {
        app.log.push(`press:${key}`);
        if (key === 'Enter') submit(app);
      },
      type: async (text) => { app.typed += text; },
    },
    waitForTimeout: async () => {},
    locator: (selector, options) => makeLocator(app, selector, options, 0),
  };
  return app;
}

// What a shot can leave behind: an editor tab active with no command bar of its own and unsaved work
// in it, an agent tab still running a long command, and a docked sidebar tab.
const MESSY = [
  { label: 'janus', commandBar: true, active: false },
  { label: 'bilal', commandBar: true, active: false, busy: true },
  { label: 'sample.ts', commandBar: false, active: true, dirty: true },
  { label: 'harbor', strip: 'sidebar' },
];

function run(app) {
  const hooks = {
    writeProfile: vi.fn(() => { app.log.push('write-profile'); }),
    restore: vi.fn(() => { app.log.push('restore'); }),
  };
  return { hooks, done: resetApp(app.page, { work: '/scratch/harbor' }, hooks) };
}

describe('resetProfile', () => {
  it('declares one focused agent entry carrying the root tab\'s label, colour and group', () => {
    const profile = resetProfile();
    expect(profile.tabs).toHaveLength(1);
    expect(profile.tabs[0]).toMatchObject({
      type: 'agent', name: 'janus', color: '#5b9cff', group: 1, cwd: '$root', focus: true,
    });
  });
});

describe('resetApp', () => {
  it('leaves exactly one tab, labelled janus, with a command bar of its own', async () => {
    const app = fakeApp(MESSY);
    await run(app).done;
    expect(app.tabs).toHaveLength(1);
    expect(app.tabs[0].label).toBe('janus');
    expect(app.tabs[0].active).toBe(true);
  });

  it('dismisses the last shot\'s overlay and empties the command bar before anything else', async () => {
    const app = fakeApp(MESSY);
    await run(app).done;
    expect(app.log.slice(0, 2)).toEqual(['press:Escape', 'press:Escape']);
    expect(app.log.indexOf('clear-command-bar')).toBeLessThan(app.log.indexOf('run:agent resetting'));
  });

  // A busy tab queues what is typed into it instead of running it, so everything the shot opened has
  // to be gone — and the surviving tab has to be an idle one — before the first command is typed.
  it('closes the tabs the shot left before it types anything', async () => {
    const app = fakeApp(MESSY);
    await run(app).done;
    const lastClose = app.log.lastIndexOf('close:harbor');
    expect(lastClose).toBeLessThan(app.log.indexOf('run:agent resetting'));
  });

  it('types from an idle tab, passing over a busy one that has a command bar', async () => {
    const app = fakeApp([
      { label: 'bilal', commandBar: true, active: true, busy: true },
      { label: 'janus', commandBar: true, active: false },
    ]);
    await run(app).done;
    expect(app.log.indexOf('close:bilal')).toBeLessThan(app.log.indexOf('run:agent resetting'));
  });

  it('closes every tab the shot left, the docked one included, and the staging tab after it', async () => {
    const app = fakeApp(MESSY);
    await run(app).done;
    expect(app.log.filter((entry) => entry.startsWith('close:'))).toEqual([
      'close:bilal', 'close:sample.ts', 'close:harbor', 'close:janus', 'close:resetting',
    ]);
  });

  it('discards unsaved work rather than saving it over a fixture file', async () => {
    const app = fakeApp(MESSY);
    await run(app).done;
    expect(app.dialog).toBeUndefined();
    expect(app.tabs.some((tab) => tab.dirty)).toBe(false);
  });

  it('writes the reset profile before launching it and restores the work directory after', async () => {
    const app = fakeApp(MESSY);
    const { hooks, done } = run(app);
    await done;
    expect(app.log.indexOf('write-profile')).toBeLessThan(app.log.indexOf('run:profile launch docs-screenshot-reset'));
    expect(app.log.at(-1)).toBe('restore');
    expect(hooks.writeProfile).toHaveBeenCalledWith({ work: '/scratch/harbor' });
  });

  it('restores the work directory even when the reset cannot finish, so the profile never survives', async () => {
    const app = fakeApp([{ label: 'sample.ts', commandBar: false, active: true }]);
    const { hooks, done } = run(app);
    await expect(done).rejects.toThrow('no tab with a command bar to reset from');
    expect(hooks.restore).toHaveBeenCalledWith({ work: '/scratch/harbor' });
  });
});
