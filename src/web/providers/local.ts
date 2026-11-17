import { acceptLanguage, DEFAULT_CHROME_MAJOR, randomBrowserProfile, type BrowserProfile } from '../../user-agent.js';
import {
  ProviderRequestError,
  type WebFetchPage,
  type WebFetchRequest,
  type WebSearchCapability,
  type WebSearchProvider,
} from './contract.js';
import { attemptSignal, classifyRequestError } from './http.js';
import { LOCAL_MAX_BODY_BYTES, readCappedBody } from './local-body.js';
import { acceptedContentType, decodeBody, upgradedUrl } from './local-rules.js';

const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

export function createLocalProvider({ profile }: { profile: () => BrowserProfile }) {
  return {
    async fetch(request: WebFetchRequest, capability: WebSearchCapability): Promise<WebFetchPage> {
      const url = upgradedUrl(new URL(request.url));
      const signal = attemptSignal(capability, request.timeoutMs);
      const headers = browserHeaders(profile());
      let response: Response;
      try {
        response = await capability.fetch(url.href, {
          method: 'GET',
          redirect: 'manual',
          headers,
          signal,
        });
      } catch (error) {
        throw classifyRequestError(capability.signal, error, request.timeoutMs);
      }
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
        throw classifyRequestError(capability.signal, error, request.timeoutMs);
      }
      return { url: url.href, content: decodeBody(bytes, contentType) };
    },
  } satisfies WebSearchProvider;
}

export const provider = createLocalProvider({
  profile: () => randomBrowserProfile(DEFAULT_CHROME_MAJOR),
});

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
