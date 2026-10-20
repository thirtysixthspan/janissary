import type { SearchMatch as WireSearchMatch, SearchRequest as WireSearchRequest } from '../protocol.js';

export const SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const SEARCH_MAX_RESULTS = 250;
export const SEARCH_BINARY_PREFIX_BYTES = 8192;

export type SearchMatch = WireSearchMatch;
export type SearchRequest = WireSearchRequest;
