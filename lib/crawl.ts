import { extractPage, type Page } from './extract';

const USER_AGENT = 'DocsCopilot/0.1';
const DELAY_MS = 250; // a pause between requests, to be polite to the site
const SKIP_FILES = /\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|css|js|mjs|json|xml|txt|woff2?|mp4|mp3)$/i;

export interface CrawlOptions {
  maxPages?: number;
  /** Only pages containing this selector are indexed. Others are still followed for links. */
  selector?: string;
  /** Paths that are never fetched. */
  exclude?: string[];
  onPage?: (url: string, status: string) => void;
}

export interface CrawledPage extends Page {
  url: string;
}

/** `/docs` and `/docs/` are nearly always one page, so they share a key. */
export const pageKey = (url: string) => url.replace(/\/$/, '');

/** Drops fragments and queries, so one page is never fetched twice. */
export function normalizeUrl(href: string) {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return url.href;
}

/** Reads the Disallow rules that apply to every crawler. */
export function parseRobots(text: string) {
  const rules: string[] = [];
  let applies = false;

  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0]?.trim() ?? '';
    const separator = line.indexOf(':');
    if (separator < 0) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') applies = value === '*';
    else if (field === 'disallow' && applies && value) rules.push(value);
  }
  return rules;
}

export const isAllowed = (path: string, disallowed: string[]) =>
  !disallowed.some((rule) => path.startsWith(rule));

async function fetchPage(url: string, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      // A server error may be temporary, so it's worth another try.
      if (response.status < 500 || attempt === attempts) return response;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    await new Promise((done) => setTimeout(done, attempt * 1000));
  }
}

async function loadRobots(origin: string) {
  try {
    const response = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
    return response.ok ? parseRobots(await response.text()) : [];
  } catch {
    return [];
  }
}

/** Follows links from the start URL, staying on the same site. */
export async function crawl(start: string, options: CrawlOptions = {}) {
  const { maxPages = 200, selector, exclude = [], onPage } = options;

  const startUrl = normalizeUrl(start);
  const { origin } = new URL(startUrl);
  const disallowed = [...(await loadRobots(origin)), ...exclude];

  const queue = [startUrl];
  const seen = new Set(queue.map(pageKey));
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && seen.size <= maxPages + queue.length) {
    const url = queue.shift() as string;
    if (pages.length >= maxPages) break;

    if (seen.size > 1) await new Promise((done) => setTimeout(done, DELAY_MS));

    let response: Response;
    try {
      response = await fetchPage(url);
    } catch (error) {
      onPage?.(url, `failed: ${(error as Error).message}`);
      continue;
    }

    if (!response.ok) {
      onPage?.(url, `skipped: ${response.status}`);
      continue;
    }
    if (!response.headers.get('content-type')?.includes('text/html')) continue;

    const page = extractPage(await response.text(), url, selector);

    for (const link of page.links) {
      let next: URL;
      try {
        next = new URL(normalizeUrl(link));
      } catch {
        continue;
      }
      if (next.origin !== origin || !/^https?:$/.test(next.protocol)) continue;
      if (SKIP_FILES.test(next.pathname) || !isAllowed(next.pathname, disallowed)) continue;
      if (!seen.has(pageKey(next.href))) {
        seen.add(pageKey(next.href));
        queue.push(next.href);
      }
    }

    if (page.sections.length > 0) {
      pages.push({ ...page, url });
      onPage?.(url, `${page.sections.length} sections`);
    } else {
      onPage?.(url, 'no content, links followed');
    }
  }
  return pages;
}
