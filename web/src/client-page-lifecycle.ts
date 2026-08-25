type DisposableClient = { dispose(): void };

export function startClientPageLifecycle<Client extends DisposableClient>(
  createClient: () => Client,
  render: (client: Client) => void,
): () => void {
  let client = createClient();
  render(client);

  const onPageHide = () => client.dispose();
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    client = createClient();
    render(client);
  };

  globalThis.addEventListener('pagehide', onPageHide);
  globalThis.addEventListener('pageshow', onPageShow);

  return () => {
    globalThis.removeEventListener('pagehide', onPageHide);
    globalThis.removeEventListener('pageshow', onPageShow);
  };
}
