# Linting

```bash
npm run lint          # ESLint over the entire tree
npm run lint:files    # ESLint over only the files you care about
```

`npm run lint:files` defaults to every uncommitted file (staged, unstaged, and new untracked files), so you can check just your changes without waiting on a full-tree lint:

```bash
npm run lint:files                          # all uncommitted files
npm run lint:files -- src/foo.ts web/src/App.tsx   # only the named files
npm run lint:files -- --fix                 # autofix the uncommitted set
npm run lint:files -- --fix src/foo.ts      # autofix specific files
```

Arguments after `--` that start with `-` are passed straight to ESLint; everything else is treated as a path. Non-lintable paths (`.md`, `.json`, directories) are filtered out automatically. The script lives at `scripts/lint-files.mjs`.
