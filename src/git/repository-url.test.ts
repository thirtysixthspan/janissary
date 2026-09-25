import { describe, it, expect } from 'vitest';
import {
  cloneUrlError, isGitHubUrl, repositoryName, sameRepository, toHttpsUrl, withoutCredentials,
} from './repository-url.js';

describe('toHttpsUrl', () => {
  it('converts an scp-style ssh url to https', () => {
    expect(toHttpsUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('converts an ssh:// url to https', () => {
    expect(toHttpsUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('leaves an already-https url unchanged', () => {
    expect(toHttpsUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });
});

describe('isGitHubUrl', () => {
  it.each([
    'git@github.com:owner/repo.git',
    'ssh://git@github.com/owner/repo.git',
    'https://github.com/owner/repo.git',
    'https://github.com/owner/repo',
  ])('accepts %s', (url) => {
    expect(isGitHubUrl(url)).toBe(true);
  });

  it.each([
    'git@gitlab.com:owner/repo.git',
    'https://github.example.com/owner/repo.git',
    '/srv/git/repo.git',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isGitHubUrl(url)).toBe(false);
  });
});

describe('sameRepository', () => {
  it('matches one repository across the scp, ssh://, and https forms', () => {
    expect(sameRepository('git@github.com:owner/repo.git', 'https://github.com/owner/repo.git')).toBe(true);
    expect(sameRepository('ssh://git@github.com/owner/repo.git', 'git@github.com:owner/repo.git')).toBe(true);
  });

  it('ignores host case, a trailing .git, and a trailing slash', () => {
    expect(sameRepository('https://GitHub.com/owner/repo', 'https://github.com/owner/repo.git')).toBe(true);
    expect(sameRepository('https://github.com/owner/repo/', 'git@github.com:owner/repo.git')).toBe(true);
  });

  it('tells different owners, repositories, and hosts apart', () => {
    expect(sameRepository('https://github.com/owner/repo.git', 'https://github.com/other/repo.git')).toBe(false);
    expect(sameRepository('https://github.com/owner/repo.git', 'https://github.com/owner/other.git')).toBe(false);
    expect(sameRepository('https://github.com/owner/repo.git', 'https://gitlab.com/owner/repo.git')).toBe(false);
  });

  it('matches an unparseable url only to an identical string', () => {
    expect(sameRepository('/srv/git/repo.git', '/srv/git/repo.git')).toBe(true);
    expect(sameRepository('/srv/git/repo.git', '/srv/git/repo')).toBe(false);
    expect(sameRepository('alpha:repos/repo.git', 'beta:repos/repo.git')).toBe(false);
  });
});

describe('repositoryName', () => {
  it.each([
    ['git@github.com:thirtysixthspan/janissary.git', 'janissary'],
    ['ssh://git@github.com/owner/repo.git', 'repo'],
    ['https://github.com/owner/repo', 'repo'],
    ['https://github.com/owner/repo.git/', 'repo'],
    ['/srv/git/project.git', 'project'],
    ['host:project.git', 'project'],
  ])('names %s as %s', (url, name) => {
    expect(repositoryName(url)).toBe(name);
  });

  it.each(['https://github.com', 'https://github.com/', 'https://github.com/owner/..', 'https://github.com/owner/.git'])(
    'has no name for %s', (url) => {
      expect(repositoryName(url)).toBeUndefined();
    },
  );
});

describe('cloneUrlError', () => {
  it.each(['--upload-pack=touch /tmp/pwned', '-oProxyCommand=touch /tmp/pwned:repo', '-c'])(
    'refuses %s as a git option', (url) => {
      expect(cloneUrlError(url)).toBe('the URL starts with "-", which git would read as an option');
    },
  );

  it.each([
    ['ext::sh -c touch% /tmp/pwned', 'ext'],
    ['EXT::sh -c id', 'ext'],
    ['fd::3', 'fd'],
  ])('refuses %s as a command transport', (url, transport) => {
    expect(cloneUrlError(url)).toBe(`the "${transport}::" transport runs a command rather than fetching a repository`);
  });

  it.each([
    'git@github.com:owner/repo.git',
    'ssh://git@github.com/owner/repo.git',
    'https://github.com/owner/repo.git',
    'file:///srv/git/repo.git',
    '/srv/git/repo.git',
    'codecommit::us-east-1://repo',
  ])('accepts %s', (url) => {
    expect(cloneUrlError(url)).toBeUndefined();
  });
});

describe('withoutCredentials', () => {
  it('clears an https username and password', () => {
    expect(withoutCredentials('https://user:secret@github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('clears a token carried as the https username alone', () => {
    expect(withoutCredentials('https://ghp_token@github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('keeps an ssh:// login while clearing its password', () => {
    expect(withoutCredentials('ssh://git:secret@github.com/owner/repo.git')).toBe('ssh://git@github.com/owner/repo.git');
    expect(withoutCredentials('ssh://git@github.com/owner/repo.git')).toBe('ssh://git@github.com/owner/repo.git');
  });

  it('passes the scp form and credential-free urls through unchanged', () => {
    expect(withoutCredentials('git@github.com:owner/repo.git')).toBe('git@github.com:owner/repo.git');
    expect(withoutCredentials('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });
});
