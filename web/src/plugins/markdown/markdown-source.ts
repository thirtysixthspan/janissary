export async function loadMarkdownSource(
  source: string,
  signal: AbortSignal,
  fetchSource: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchSource(source, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
