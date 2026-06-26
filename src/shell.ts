import { spawn, type ChildProcess } from 'node:child_process';

export function spawnShell(_tabIndex: number, extraEnvironment?: Record<string, string>): ChildProcess {
  const shell = spawn(process.env.SHELL || 'bash', ['--norc', '--noprofile'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnvironment },
  });
  shell.stdout.setEncoding('utf8');
  shell.stderr.setEncoding('utf8');
  return shell;
}

export function executeShellCmd(
  shell: ChildProcess,
  command: string,
  tabIndex: number,
  onProgress: (outputBuffer: string) => void,
  onComplete: (result: string) => void,
): void {
  const prompt = `__JS_END_${tabIndex}_${Date.now()}__`;
  let outputBuffer = '';

  const done = () => {
    shell.stdout!.removeListener('data', onChunk);
    shell.stderr!.removeListener('data', onChunk);
  };

  const onChunk = (chunk: string) => {
    outputBuffer += chunk;
    const endIndex = outputBuffer.indexOf(prompt);
    if (endIndex === -1) {
      onProgress(outputBuffer);
    } else {
      const result = outputBuffer.slice(0, Math.max(0, endIndex)).trim();
      done();
      onComplete(result);
    }
  };

  shell.stdout!.on('data', onChunk);
  shell.stderr!.on('data', onChunk);
  shell.stdin!.write(`${command} 2>&1\necho "${prompt}"\n`);
}

export function queryShellPwd(
  shell: ChildProcess,
  tabIndex: number,
  onResult: (pwd: string) => void,
): void {
  const prompt = `__PWD_${tabIndex}_${Date.now()}__`;
  let buffer = '';

  const onData = (chunk: string) => {
    buffer += chunk;
    const endIndex = buffer.indexOf(prompt);
    if (endIndex !== -1) {
      shell.stdout!.removeListener('data', onData);
      shell.stderr!.removeListener('data', onData);
      onResult(buffer.slice(0, Math.max(0, endIndex)).trim());
    }
  };

  shell.stdout!.on('data', onData);
  shell.stderr!.on('data', onData);
  shell.stdin!.write(`pwd\necho "${prompt}"\n`);
}
