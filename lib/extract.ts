import { load, type CheerioAPI } from 'cheerio';

export interface Section {
  heading: string;
  /** The heading's id, so a citation can jump straight to this section. */
  anchor: string | null;
  text: string;
}

export interface Page {
  title: string;
  sections: Section[];
  links: string[];
}

const NOISE = 'script, style, noscript, svg, nav, header, footer, aside, form, iframe';

// Text a reader can't see has no place in an answer, and it's a common way to hide injected
// instructions from a page's owner.
const HIDDEN = '[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]';
const BLOCKS = 'h1, h2, h3, h4, p, pre, li, tr, blockquote';

/** A selector for the main content, tried in order. */
const CONTENT_SELECTORS = ['.prose', 'article', '[role="main"]', 'main', 'body'];

const clean = (text: string) => text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

function findLinks($: CheerioAPI, base: string) {
  const links = new Set<string>();
  $('a[href]').each((_, element) => {
    try {
      links.add(new URL($(element).attr('href') ?? '', base).href);
    } catch {
      // A malformed href isn't worth stopping for.
    }
  });
  return [...links];
}

/** Splits a page into sections at its headings, keeping each heading's anchor. */
export function extractPage(html: string, url: string, selector?: string): Page {
  const $ = load(html);
  const links = findLinks($, url); // before noise removal, so nav links are still followed

  const title = clean($('h1').first().text()) || clean($('title').first().text()) || url;

  const content = selector
    ? $(selector).first()
    : $(CONTENT_SELECTORS.find((s) => $(s).length > 0) ?? 'body').first();

  if (content.length === 0) return { title, sections: [], links };

  content.find(NOISE).remove();
  content.find(HIDDEN).remove();

  const sections: Section[] = [];
  let current: Section = { heading: title, anchor: null, text: '' };

  content.find(BLOCKS).each((_, element) => {
    const node = $(element);

    // Nested blocks would be read twice: a <p> inside an <li>, for example.
    if (node.parents(BLOCKS).length > 0) return;

    const tag = element.tagName.toLowerCase();

    if (/^h[1-4]$/.test(tag)) {
      if (current.text) sections.push(current);
      current = { heading: clean(node.text()), anchor: node.attr('id') ?? null, text: '' };
      return;
    }

    const text =
      tag === 'tr'
        ? node.find('th, td').map((_i, cell) => clean($(cell).text())).get().join(' | ')
        : tag === 'pre'
          ? node.text().trim()
          : clean(node.text());

    if (text) current.text += `${current.text ? '\n' : ''}${text}`;
  });

  if (current.text) sections.push(current);
  return { title, sections, links };
}
