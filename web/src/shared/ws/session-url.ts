function pageToken(): string {
  return new URLSearchParams(location.search).get('token') ?? '';
}

export function resourceUrl(reference: string): string {
  return `${reference}?token=${encodeURIComponent(pageToken())}`;
}

export function webSocketUrl(): string {
  return `ws://${location.host}/?token=${encodeURIComponent(pageToken())}`;
}
