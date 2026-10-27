import { defineRoutes } from 'vitepress';
import path from 'node:path';
import { commandNames, helpDirectory, renderCommandPage } from '../../.vitepress/command-reference';

const directory = helpDirectory();

export default defineRoutes({
  watch: path.join(directory, '*.md'),
  paths(watchedFiles) {
    const names = new Set(commandNames());
    return watchedFiles
      .filter((file) => path.dirname(file) === directory && path.extname(file) === '.md')
      .map((file) => path.basename(file, '.md'))
      .filter((name) => names.has(name))
      .map((command) => ({
        params: { command },
        content: renderCommandPage(command),
      }));
  },
});
