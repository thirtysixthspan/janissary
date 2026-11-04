import React from 'react';
import { act, fireEvent, render as renderBare, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import { createPluginHost, PluginHostProvider, type PluginHost } from './host';
import { PluginBody } from './PluginBody';
import { AppCommandBarProvider, useAppCommandBar } from '../shared/command-bar/AppCommandBar';
import {
  clientPlugin,
  type ClientPluginLoader,
  type ClientPluginRegistration,
} from './registry';

// Each case owns its registry and its failure ledger, so a fixture plugin never has to be written
// into the production map and a disabled plugin cannot leak into the next case.
let registry: Map<string, ClientPluginRegistration>;
let host: PluginHost;

// Shadows Testing Library's `render` so every call site below gets the provider without saying so.
function render(ui: React.ReactElement) {
  return renderBare(ui, {
    wrapper: ({ children }) => <PluginHostProvider host={host}>{children}</PluginHostProvider>,
  });
}

function plugin(id = 'fixture', schemaVersion = 1): NonNullable<TabView['plugin']> {
  return { id, schemaVersion, payload: { valid: true } };
}

function client() {
  const send = vi.fn();
  const request = vi.fn();
  return { value: { send, request } as unknown as JanusClient, send };
}

function registration(loader: ClientPluginLoader): ClientPluginRegistration {
  return clientPlugin(1, loader);
}

const acceptsAnyPayload = (value: unknown): value is unknown => value !== undefined;

function body(id = 'fixture', label = id, active = true) {
  const fixture = client();
  const view = { plugin: plugin(id) };
  return {
    fixture,
    element: (
      <PluginBody
        plugin={view.plugin} label={label} client={fixture.value}
        active={active} onClose={() => {}}
      />
    ),
  };
}

beforeEach(() => {
  registry = new Map();
  host = createPluginHost(registry);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginBody failure isolation', () => {
  it('renders a plugin body that mounts cleanly without reporting anything', async () => {
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const { fixture, element } = body();
    render(element);
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('contains a render exception, reports it once, and keeps a sibling plugin rendering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ThrowingPlugin = () => { throw new Error('render exploded'); };
    registry.set('bad', registration(async () => ({
      default: ThrowingPlugin, isPayload: acceptsAnyPayload,
    })));
    registry.set('good', registration(async () => ({
      default: () => <div>good plugin</div>, isPayload: acceptsAnyPayload,
    })));
    const bad = body('bad');
    const good = body('good');
    render(<>
      {bad.element}
      {good.element}
    </>);
    await waitFor(() => { expect(screen.getByText('good plugin')).toBeInTheDocument(); });
    await waitFor(() => {
      expect(bad.fixture.send).toHaveBeenCalledWith({
        method: 'pluginFailed', params: { tab: 'bad', reason: 'render exploded' },
      });
    });
    expect(bad.fixture.send).toHaveBeenCalledOnce();
    expect(good.fixture.send).not.toHaveBeenCalled();
    expect(screen.queryByText('render exploded')).not.toBeInTheDocument();
    expect(screen.getByText('good plugin')).toBeInTheDocument();
  });

  it('reports one activation timeout and drops the plugin when the import never resolves', async () => {
  // Each body arms its own deadline, so the mock hands out signals from a queue and the case
  // aborts only the first one — the fixture's — leaving the sibling's timer running.
  const controllers = [new AbortController(), new AbortController()];
  let armed = 0;
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => controllers[armed++]!.signal);
  registry.set('fixture', registration(() => new Promise(() => {})));
  registry.set('good', registration(async () => ({
    default: () => <div>good plugin</div>, isPayload: acceptsAnyPayload,
  })));
  const { fixture, element } = body();
  const good = body('good');
  render(<>
    {element}
    {good.element}
  </>);

  act(() => { controllers[0]!.abort(); });

    await waitFor(() => {
      expect(fixture.send).toHaveBeenCalledWith({
        method: 'pluginFailed',
        params: { tab: 'fixture', reason: 'client activation timed out after 5000 ms' },
      });
    });
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(good.fixture.send).not.toHaveBeenCalled();
    await waitFor(() => { expect(screen.getByText('good plugin')).toBeInTheDocument(); });
    expect(screen.queryByText(/Loading fixture/)).not.toBeInTheDocument();
  });

  it('lets the deadline pass quietly once the plugin has mounted', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const { fixture, element } = body();
    render(element);
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });

    act(() => { controller.abort(); });

    expect(fixture.send).not.toHaveBeenCalled();
    expect(screen.getByText('fixture mounted')).toBeInTheDocument();
  });

  it('reports an unknown plugin id once through the pre-mount failure effect', async () => {
    const { fixture, element } = body('unknown');
    const rendered = render(element);
    await waitFor(() => {
      expect(fixture.send).toHaveBeenCalledWith({
        method: 'pluginFailed',
        params: { tab: 'unknown', reason: 'unknown client plugin "unknown"' },
      });
    });

    rendered.rerender(element);

    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it('reports a schema mismatch once and never invokes the loader', async () => {
    const load = vi.fn(async () => ({ default: () => <div />, isPayload: acceptsAnyPayload }));
    registry.set('fixture', registration(load));
    const fixture = client();
    const mismatched = { plugin: plugin('fixture', 2) };
    const element = (
      <PluginBody
        plugin={mismatched.plugin} label="fixture" client={fixture.value}
        active onClose={() => {}}
      />
    );
    const rendered = render(element);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed',
      params: { tab: 'fixture', reason: 'payload schema 2 is not supported; expected 1' },
    });

    rendered.rerender(element);

    expect(fixture.send).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it('throws when no PluginHostProvider sits above the body', () => {
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const { value } = client();
    expect(() => {
      renderBare(
        <PluginBody
          plugin={plugin()} label="fixture" client={value}
          active onClose={() => {}}
        />,
      );
    }).toThrow('no PluginHostProvider above this plugin');
  });
});

describe('PluginBody command bar scope', () => {
  it('binds the command bar a plugin body reads to the tab the host rendered it for', async () => {
    const intercept = vi.fn(() => true);
    function Reader() {
      const bar = useAppCommandBar();
      return <button type="button" onClick={() => { bar.intercept('theme'); }}>ask</button>;
    }
    registry.set('fixture', registration(async () => ({ default: Reader, isPayload: acceptsAnyPayload })));
    const { element } = body('fixture', 'shell-left');

    render(<AppCommandBarProvider bar={{ intercept, ghostHistory: [] }}>{element}</AppCommandBarProvider>);
    fireEvent.click(await screen.findByText('ask'));

    expect(intercept).toHaveBeenCalledWith('theme', 'shell-left', true);
  });

  // The host, not the plugin, knows whether a body is on screen, and a hidden one must open no picker.
  it('tells the application when the body asking is not on screen', async () => {
    const intercept = vi.fn(() => true);
    function Reader() {
      const bar = useAppCommandBar();
      return <button type="button" onClick={() => { bar.intercept('tasks'); }}>ask</button>;
    }
    registry.set('fixture', registration(async () => ({ default: Reader, isPayload: acceptsAnyPayload })));
    const { element } = body('fixture', 'shell-hidden', false);

    render(<AppCommandBarProvider bar={{ intercept, ghostHistory: [] }}>{element}</AppCommandBarProvider>);
    fireEvent.click(await screen.findByText('ask'));

    expect(intercept).toHaveBeenCalledWith('tasks', 'shell-hidden', false);
  });
});

describe('PluginBody core docked questions without a plugin response hook', () => {
  beforeEach(() => {
    registry.set('fixture', registration(async () => ({
      default: () => <div>no-hook plugin</div>, isPayload: acceptsAnyPayload,
    })));
  });

  it.each(['left', 'right'] as const)('routes free text, approval and Cancel to the %s dock owner', async (dock) => {
    const fixture = client();
    const question = { id: `q-${dock}`, tab: `owner-${dock}`, kind: 'ask' as const, question: 'Which port?' };
    const element = (pendingQuestion: TabView['pendingQuestion']) => <>
      <PluginBody plugin={plugin()} label="centre-other" client={fixture.value} active onClose={() => {}} />
      <PluginBody plugin={plugin()} label={`owner-${dock}`} client={fixture.value} active dock={dock}
        pendingQuestion={pendingQuestion} onClose={() => {}} />
    </>;
    const rendered = render(element(question));
    expect(await screen.findByRole('dialog')).toHaveTextContent(`Question from owner-${dock}`);
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: '8080' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(fixture.send).toHaveBeenLastCalledWith({ method: 'answerQuestion', params: { tab: question.tab, id: question.id, answer: '8080' } });

    const approval = { ...question, id: `approve-${dock}`, kind: 'approve' as const, question: 'Proceed?', options: ['Allow', 'Deny'] };
    rendered.rerender(element(approval));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(fixture.send).toHaveBeenLastCalledWith({ method: 'answerQuestion', params: { tab: question.tab, id: approval.id, answer: 'Allow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.send).toHaveBeenLastCalledWith({ method: 'answerQuestion', params: { tab: question.tab, id: approval.id, answer: null } });
    expect(fixture.send).toHaveBeenCalledTimes(3);
    rendered.rerender(element(undefined));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['left', 'right'] as const)('follows active and resolved state in the %s sidebar independently of responses', async (dock) => {
    const fixture = client();
    const question = { id: 'q-visibility', tab: 'owner', kind: 'ask' as const, question: 'Still pending?' };
    const element = (active: boolean, pendingQuestion: TabView['pendingQuestion'] = question) => (
      <PluginBody plugin={plugin()} label="owner" client={fixture.value} active={active} dock={dock}
        pendingQuestion={pendingQuestion} onClose={() => {}} />
    );
    const rendered = render(element(false));
    await screen.findByText('no-hook plugin');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rendered.rerender(element(true));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rendered.rerender(element(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rendered.rerender(element(true));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    rendered.rerender(<PluginBody plugin={plugin()} label="owner" client={fixture.value} active dock={dock} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('leaves centre questions to the app and keeps disabled docked plugins isolated', async () => {
    const fixture = client();
    const question = { id: 'q-centre', tab: 'centre-other', kind: 'approve' as const, question: 'Proceed?' };
    const rendered = render(<PluginBody plugin={plugin()} label="centre-other" client={fixture.value} active pendingQuestion={question} onClose={() => {}} />);
    await screen.findByText('no-hook plugin');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    host.disable('fixture', 'disabled');
    rendered.rerender(<PluginBody plugin={plugin()} label="owner" client={fixture.value} active dock="left" pendingQuestion={question} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('no-hook plugin')).not.toBeInTheDocument();
  });
});
