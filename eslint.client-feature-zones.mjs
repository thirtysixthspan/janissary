const clientFeatureDirectories = [
  'context-menu',
  'editor',
  'file-navigator',
  'harness',
  'notifications',
  'pickers',
  'plugins',
  'QuitDialog',
  'SaveChangesDialog',
  'ScheduleLaunchDialog',
  'toasts',
];

const clientFeatureZones = [
  ...clientFeatureDirectories.flatMap((target) => clientFeatureDirectories
    .filter((source) => source !== target)
    .map((source) => ({
      target: `./web/src/${target}`,
      from: `./web/src/${source}`,
      message: 'Features must import shared modules or coordinate through the app shell, not import a sibling feature.',
    }))),
  {
    target: './web/src/shared',
    from: clientFeatureDirectories.map((source) => `./web/src/${source}`),
    message: 'Shared modules must not import a feature.',
  },
  {
    target: './web/src/shared',
    from: './web/src',
    except: ['shared', ...clientFeatureDirectories],
    message: 'Shared modules must not import the app-shell root.',
  },
];

const clientFeatureRootZones = clientFeatureDirectories.map((target) => ({
  target: `./web/src/${target}`,
  from: './web/src',
  except: ['shared', 'overlay-plugins', ...clientFeatureDirectories],
  message: 'Features must not import app-shell root modules.',
}));

// The overlay-plugin host sits outside the feature list because it has to reach the pickers, the
// command bar, and the context menu to build the one capability a plugin gets. Features reach it
// through the shared seam rather than importing it directly.
for (const target of clientFeatureDirectories) {
  clientFeatureZones.push({
    target: `./web/src/${target}`,
    from: './web/src/overlay-plugins',
    message: 'Features must reach an overlay plugin through shared/contributed-overlays.ts, not by importing the plugin layer.',
  });
}

export { clientFeatureZones, clientFeatureRootZones };
