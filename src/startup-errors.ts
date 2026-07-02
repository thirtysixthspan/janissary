import { appVersion } from './cli-args.js';

export function explainStartupError(error: unknown, context: { port?: number } = {}): string | null {
  const code = (error as NodeJS.ErrnoException)?.code;
  const port = context.port === undefined ? 'the requested port' : String(context.port);

  if (code === 'EADDRINUSE') {
    return `port ${port} is already in use.\n  Another janus (or other app) is listening there. Pick another port with --port=<n>,\n  or omit --port to choose a free port automatically.`;
  }
  if (code === 'EACCES') {
    return `permission denied binding to port ${port}.\n  Ports below 1024 need elevated privileges. Pick a port above 1024 with --port=<n>.`;
  }
  return null;
}

export function formatFatal(message: string): string {
  return `${appVersion()} — failed to start: ${message}`;
}

export function maybeStack(error: unknown): string {
  if (!process.env.JANUS_DEBUG) return '';
  const stack = error instanceof Error ? error.stack : undefined;
  return stack ? `${stack}\n` : '';
}
