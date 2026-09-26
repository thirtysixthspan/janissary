import { describe, expect, it, vi } from 'vitest';
import { deferredChannelTransport, isChannelFrame, CHANNEL_FRAME_TYPES } from './types.js';
import type { ChannelTransport } from './types.js';

// The transport a channel is built over before its PTY exists. Its whole purpose is to be a valid
// transport while the session slot is still empty, so every method is exercised in that window.
describe('deferredChannelTransport', () => {
  it('drops writes and kills while no session is there, and answers no id', () => {
    const transport = deferredChannelTransport({});

    expect(() => { transport.write('anything'); }).not.toThrow();
    expect(() => { transport.kill(); }).not.toThrow();
    expect(transport.id).toBe('');
  });

  it('passes writes, kills, and the id through once the session is filled in', () => {
    const session = { id: 'pty-1', write: vi.fn(), kill: vi.fn() };
    const holder: { session?: ChannelTransport } = {};
    const transport = deferredChannelTransport(holder);

    holder.session = session;
    transport.write('typed');
    transport.kill();

    expect(transport.id).toBe('pty-1');
    expect(session.write).toHaveBeenCalledExactlyOnceWith('typed');
    expect(session.kill).toHaveBeenCalledOnce();
  });

  // A write that lands between construction and the spawn is a keystroke for a ssh prompt that has no
  // PTY yet, so it is dropped rather than queued — there is nothing here that could replay it.
  it('reads a slot that is filled in later without having held the transport back', () => {
    const holder: { session?: ChannelTransport } = {};
    const transport = deferredChannelTransport(holder);
    const write = vi.fn();
    holder.session = { id: '', write, kill: vi.fn() };

    expect(() => { transport.write('early'); }).not.toThrow();
    expect(write).toHaveBeenCalledExactlyOnceWith('early');
  });
});

describe('isChannelFrame', () => {
  // The channel reads the handshake first and only treats bytes as frames after it, so this decides
  // what "a frame" means. A frame type outside the tab-level list belongs to a process's I/O instead.
  it.each([...CHANNEL_FRAME_TYPES])('claims the %s frame as the tab\'s own', (type) => {
    expect(isChannelFrame({ type } as never)).toBe(true);
  });

  it('leaves a session frame to the session listener', () => {
    expect(isChannelFrame({ type: 'session-output' } as never)).toBe(false);
    expect(isChannelFrame({ type: 'handshake' } as never)).toBe(false);
  });

  it('leaves an unknown type to the channel\'s unexpected-frame path', () => {
    expect(isChannelFrame({ type: 'not-a-frame' } as never)).toBe(false);
  });
});
