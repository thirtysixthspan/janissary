// The disposable directory a screenshot run works in: a `work` directory seeded from the
// fixtures (made into a git repo with a local `origin`, so workspaced shots can clone), and a
// `home` directory so the app's homedir-scoped state (the global command history) never reads
// or pollutes the real one.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Fixture commits need an identity that works on any machine, without touching real git config.
const GIT_IDENTITY = ['-c', 'user.name=docs-screenshots', '-c', 'user.email=docs-screenshots@example.invalid'];

function git(cwd, ...gitArguments) {
  execFileSync('git', [...GIT_IDENTITY, ...gitArguments], { cwd, stdio: 'ignore' });
}

export function createScratch(fixturesDirectory) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'janus-docs-'));
  // Named like a real project ("harbor", matching the fixtures' theme) because the directory
  // name shows up in captured metadata headers.
  const work = path.join(root, 'harbor');
  const home = path.join(root, 'home');
  mkdirSync(work);
  mkdirSync(home);
  cpSync(fixturesDirectory, work, { recursive: true });
  // page.html is served by the fixture web server, not shown in the file tree.
  rmSync(path.join(work, 'page.html'));
  git(work, 'init', '--quiet');
  git(work, 'add', '--all');
  git(work, 'commit', '--quiet', '--message', 'fixtures');
  const origin = path.join(root, 'origin.git');
  git(root, 'clone', '--bare', '--quiet', work, origin);
  git(work, 'remote', 'add', 'origin', origin);
  return { root, work, home };
}

export function destroyScratch(scratch) {
  rmSync(scratch.root, { recursive: true, force: true });
}

// A tiny local server for the embedded-web-page shot, so capture never depends on the network
// or an external site staying up and stable.
export async function startPageServer(fixturesDirectory) {
  const html = await readFile(path.join(fixturesDirectory, 'page.html'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}
