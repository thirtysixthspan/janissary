import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

const python = '/usr/bin/python3';
const preferencesProbe = `
import ctypes
cf = ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
cf.CFStringCreateWithCString.restype = ctypes.c_void_p
cf.CFPreferencesCopyAppValue.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
cf.CFPreferencesCopyAppValue.restype = ctypes.c_void_p
cf.CFPreferencesAppSynchronize.argtypes = [ctypes.c_void_p]
cf.CFPreferencesAppSynchronize.restype = ctypes.c_ubyte
cf.CFRelease.argtypes = [ctypes.c_void_p]
domain = cf.CFStringCreateWithCString(None, b'com.openai.codex', 0x08000100)
key = cf.CFStringCreateWithCString(None, b'requirements_toml_base64', 0x08000100)
value = cf.CFPreferencesCopyAppValue(key, domain)
if value:
    cf.CFRelease(value)
print(cf.CFPreferencesAppSynchronize(domain))
cf.CFRelease(key)
cf.CFRelease(domain)
`;

const sharedMemoryProbe = `
import ctypes, errno, json, os, sys
libc = ctypes.CDLL(None, use_errno=True)
results = []
for name, flags in [(sys.argv[1], os.O_RDONLY), (sys.argv[1], os.O_RDWR), (sys.argv[2], os.O_RDONLY)]:
    fd = libc.shm_open(name.encode(), flags, 0o600)
    results.append('allowed' if fd >= 0 else errno.errorcode[ctypes.get_errno()])
    if fd >= 0:
        os.close(fd)
print(json.dumps(results))
`;

const sharedMemoryOwner = `
import ctypes, os, subprocess, sys, uuid
libc = ctypes.CDLL(None, use_errno=True)
suffix = uuid.uuid4().hex[:8]
names = ['apple.cfprefs.' + suffix, 'janus.other.' + suffix]
created = []
try:
    for name in names:
        fd = libc.shm_open(name.encode(), os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
        if fd < 0:
            raise OSError(ctypes.get_errno(), 'shm_open fixture failed')
        os.close(fd)
        created.append(name)
    subprocess.run(sys.argv[1:] + names, check=True)
finally:
    for name in created:
        libc.shm_unlink(name.encode())
`;

describe.skipIf(!sandboxAvailable())('Codex managed preferences in a workspace sandbox', () => {
  let root: string;
  let workspaceDir: string;

  beforeEach(() => {
    const temp = path.resolve('temp');
    mkdirSync(temp, { recursive: true });
    root = mkdtempSync(path.join(temp, 'codex-preferences-'));
    workspaceDir = path.join(root, 'workspace');
    mkdirSync(workspaceDir);
    mkdirSync(`${workspaceDir}.tmp`);
    loadConfig(root);
  });

  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it.each([false, true])('synchronizes managed requirements after reading preferences (offline=%s)', (offline) => {
    const spec = sandboxSpawn({ workspaceDir, offline }, python, ['-c', preferencesProbe]);
    const output = execFileSync(spec.command, spec.args, {
      cwd: workspaceDir, env: spec.env, encoding: 'utf8', stdio: 'pipe',
    });
    expect(output.trim()).toBe('1');
  });

  it.each([false, true])('allows preference-cache reads but denies writes and unrelated shared memory (offline=%s)', (offline) => {
    const spec = sandboxSpawn({ workspaceDir, offline }, python, ['-c', sharedMemoryProbe]);
    const output = execFileSync(python, ['-c', sharedMemoryOwner, spec.command, ...spec.args], {
      cwd: workspaceDir, env: spec.env, encoding: 'utf8', stdio: 'pipe',
    });
    expect(JSON.parse(output)).toEqual(['allowed', 'EPERM', 'EPERM']);
  });
});
