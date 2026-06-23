import { spawn, type ChildProcess } from 'node:child_process';

export function spawnShell(_tabIndex: number, extraEnv?: Record<string, string>): ChildProcess {
  const shell = spawn(process.env.SHELL || 'bash', ['--norc', '--noprofile'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });
  shell.stdout!.setEncoding('utf8');
  shell.stderr!.setEncoding('utf8');
  return shell;
}

export function executeShellCmd(
  shell: ChildProcess,
  cmd: string,
  tabIndex: number,
  onProgress: (outputBuffer: string) => void,
  onComplete: (result: string) => void,
): void {
  const prompt = `__JS_END_${tabIndex}_${Date.now()}__`;
  let outputBuffer = '';

  const done = () => {
    shell.stdout!.removeListener('data', onStdout);
    shell.stderr!.removeListener('data', onStderr);
  };

  const onStdout = (chunk: string) => {
    outputBuffer += chunk;
    const endIdx = outputBuffer.indexOf(prompt);
    if (endIdx >= 0) {
      const result = outputBuffer.substring(0, endIdx).trim();
      done();
      onComplete(result);
    } else {
      onProgress(outputBuffer);
    }
  };

  const onStderr = (chunk: string) => {
    outputBuffer += chunk;
    const endIdx = outputBuffer.indexOf(prompt);
    if (endIdx >= 0) {
      const result = outputBuffer.substring(0, endIdx).trim();
      done();
      onComplete(result);
    } else {
      onProgress(outputBuffer);
    }
  };

  shell.stdout!.on('data', onStdout);
  shell.stderr!.on('data', onStderr);
  shell.stdin!.write(`${cmd} 2>&1\necho "${prompt}"\n`);
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
    const endIdx = buffer.indexOf(prompt);
    if (endIdx >= 0) {
      shell.stdout!.removeListener('data', onData);
      shell.stderr!.removeListener('data', onData);
      onResult(buffer.substring(0, endIdx).trim());
    }
  };

  shell.stdout!.on('data', onData);
  shell.stderr!.on('data', onData);
  shell.stdin!.write(`pwd\necho "${prompt}"\n`);
}
