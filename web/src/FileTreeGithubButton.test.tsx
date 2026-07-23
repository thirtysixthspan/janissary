import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { JanusClient } from './ws';
import { FileTreeGithubButton } from './FileTreeGithubButton';

describe('FileTreeGithubButton', () => {
  it('sends an open command for the github url as an in-app page tab when clicked', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileTreeGithubButton githubUrl="https://github.com/owner/repo/commits/main/" client={client} />);
    fireEvent.click(container.querySelector('.files-github')!);
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open https://github.com/owner/repo/commits/main/' } });
  });
});
