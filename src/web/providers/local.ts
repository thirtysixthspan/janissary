import { acceptLanguage, DEFAULT_CHROME_MAJOR, randomBrowserProfile, type BrowserProfile } from '../../user-agent.js';
import {
  ProviderRequestError,
  type WebFetchPage,
  type WebFetchRequest,
  type WebFetchResult,
  type WebSearchCapability,
  type WebSearchProvider,
} from './contract.js';
import { attemptSignal, classifyRequestError } from './http.js';
import { LOCAL_MAX_BODY_BYTES, readCappedBody } from './local-body.js';
import { acceptedContentType, decodeBody, upgradedUrl } from './local-rules.js';

const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export function createLocalProvider({ profile }: { profile: () => BrowserProfile }) {
  return {
    async fetch(request: WebFetchRequest, capability: WebSearchCapability): Promise<WebFetchResult> {
      const signal = attemptSignal(capability, request.timeoutMs);
      const headers = browserHeaders(profile());
      let url = upgradedUrl(new URL(request.url));
      for (let hops = 0; ; hops += 1) {
        const response = await requestPage(url, headers, signal, capability, request.timeoutMs);
        const target = redirectTarget(response, url);
        if (target === undefined) {
          return finalResponse(url, response, capability, request.timeoutMs);
        }
        await discardBody(response);
        if (!followsRedirect(url, target)) {
          return { redirectedTo: target.href };
        }
        if (hops >= MAX_REDIRECTS) {
          throw new ProviderRequestError('too many redirects');
        }
        url = upgradedUrl(target);
      }
    },
  } satisfies WebSearchProvider;
}

export const provider = createLocalProvider({
  profile: () => randomBrowserProfile(DEFAULT_CHROME_MAJOR),
});

function redirectTarget(response: Response, answeringUrl: URL): URL | undefined {
  if (!REDIRECT_STATUSES.has(response.status)) return undefined;
  const location = response.headers.get('location');
  if (location === null || location === '' || !URL.canParse(location, answeringUrl)) return undefined;
  return new URL(location, answeringUrl);
}

function followsRedirect(answeringUrl: URL, target: URL): boolean {
  return (target.protocol === 'http:' || target.protocol === 'https:')
    && target.hostname === answeringUrl.hostname;
}

async function requestPage(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
  capability: WebSearchCapability,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await capability.fetch(url.href, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal,
    });
  } catch (error) {
    throw classifyRequestError(capability.signal, error, timeoutMs);
  }
}

async function finalResponse(
  url: URL,
  response: Response,
  capability: WebSearchCapability,
  timeoutMs: number,
): Promise<WebFetchPage> {
  if (!response.ok) {
    await discardBody(response);
    throw new ProviderRequestError(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  const contentType = response.headers.get('content-type');
  try {
    acceptedContentType(contentType);
  } catch (error) {
    await discardBody(response);
    throw error;
  }
  let bytes: Uint8Array;
  try {
    bytes = await readCappedBody(response, LOCAL_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw classifyRequestError(capability.signal, error, timeoutMs);
  }
  return { url: url.href, content: decodeBody(bytes, contentType) };
}

function browserHeaders(profile: BrowserProfile): Record<string, string> {
  return {
    'User-Agent': profile.userAgent,
    'Sec-CH-UA-Platform': `"${profile.platform}"`,
    'Accept-Language': acceptLanguage(profile.locale),
    Accept: ACCEPT,
  };
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    return;
  }
}
