type DisposableClient = { dispose(): void; reconnect?(): void };

export function startClientPageLifecycle<Client extends DisposableClient>(
  createClient: () => Client,
  render: (client: Client) => void,
): () => void {
  let client = createClient();
  render(client);

  const onPageHide = () => client.dispose();
  const onOnline = () => client.reconnect?.();
  const onVisibility = () => { if (document.visibilityState === 'visible') onOnline(); };
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    client = createClient();
    render(client);
  };

  globalThis.addEventListener('pagehide', onPageHide);
  globalThis.addEventListener('pageshow', onPageShow);
  globalThis.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    globalThis.removeEventListener('pagehide', onPageHide);
    globalThis.removeEventListener('pageshow', onPageShow);
    globalThis.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
