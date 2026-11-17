export type FetchedPage = {
  url: string;
  source: string;
  content: string;
};

function sourceHeader(page: FetchedPage): string {
  return `Fetched ${page.url} (${page.source}).\n\n`;
}

function note(a: string, b: string, n: string): string {
  return `(showing characters ${a}-${b} of ${n}; continue with --offset ${b})`;
}

function sliceEnd(content: string, offset: number, room: number): number {
  let end = offset + room;
  if (end <= offset) end = offset + 1;
  const code = content.codePointAt(end - 1) ?? 0;
  if (code > 0xFF_FF) end = end - 1 === offset ? end + 1 : end - 1;
  return end;
}

function renderSlice(page: FetchedPage, offset: number, maxChars: number, header: string): string {
  const { content } = page;
  const total = content.length;
  if (header.length + (total - offset) <= maxChars) return header + content.slice(offset);
  const reserved = note(String(offset), '9'.repeat(String(total).length), String(total));
  const room = maxChars - header.length - 1 - reserved.length;
  const end = sliceEnd(content, offset, room);
  const body = content.slice(offset, end);
  if (end >= total) return header + body;
  return `${header}${body}\n${note(String(offset), String(end), String(total))}`;
}

export function renderFetched(page: FetchedPage, offset: number, maxChars: number): string {
  const header = sourceHeader(page);
  const { content } = page;
  if (content === '') return header + '(empty page)';
  const total = content.length;
  if (offset >= total) {
    return header + `(offset ${String(offset)} is past the end; the page has ${String(total)} characters)`;
  }
  return renderSlice(page, offset, maxChars, header);
}

export function renderRedirect(url: string): string {
  return `Web fetch: redirected to ${url}.`;
}
