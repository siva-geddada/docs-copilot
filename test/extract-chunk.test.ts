import { describe, expect, it } from 'vitest';
import { chunkPage, splitText, toEmbeddingText } from '../lib/chunk';
import { extractPage } from '../lib/extract';

const HTML = `<html><head><title>Fallback</title></head><body>
  <nav><a href="/nav-link">Menu text</a></nav>
  <main>
    <h1>Guide</h1>
    <div class="prose">
      <p>Intro text.</p>
      <h2 id="install">Install</h2>
      <p>Run the installer.</p>
      <ul><li><p>First step</p></li><li>Second step</li></ul>
      <pre><code>npm  install
  --global</code></pre>
      <h2 id="limits">Limits</h2>
      <table><tr><th>Plan</th><th>Max</th></tr><tr><td>Free</td><td>5</td></tr></table>
      <h2>Empty</h2>
    </div>
  </main>
  <footer>Footer text</footer>
</body></html>`;

describe('extractPage', () => {
  const page = extractPage(HTML, 'https://docs.test/guide/');

  it('uses the first heading as the title', () => {
    expect(page.title).toBe('Guide');
  });

  it('splits at headings and keeps anchors for citations', () => {
    expect(page.sections.map((s) => [s.heading, s.anchor])).toEqual([
      ['Guide', null],
      ['Install', 'install'],
      ['Limits', 'limits'],
    ]);
  });

  it('skips sections with no text', () => {
    expect(page.sections.some((s) => s.heading === 'Empty')).toBe(false);
  });

  it('reads nested blocks only once', () => {
    const text = page.sections[1]?.text ?? '';
    expect(text.match(/First step/g)).toHaveLength(1);
  });

  it('keeps code formatting and joins table cells', () => {
    expect(page.sections[1]?.text).toContain('npm  install\n  --global');
    expect(page.sections[2]?.text).toBe('Plan | Max\nFree | 5');
  });

  it('leaves out navigation and footers', () => {
    const all = page.sections.map((s) => s.text).join(' ');
    expect(all).not.toContain('Menu text');
    expect(all).not.toContain('Footer text');
  });

  it('still finds links in navigation, resolved to full URLs', () => {
    expect(page.links).toContain('https://docs.test/nav-link');
  });

  it('leaves out text a reader cannot see', () => {
    const hidden = extractPage(
      `<main><p>Visible.</p><div style="display:none"><p>Secret order.</p></div><p hidden>Also hidden.</p><p style="visibility: hidden">Gone.</p></main>`,
      'https://docs.test/',
    );
    expect(hidden.sections[0]?.text).toBe('Visible.');
  });

  it('returns no sections when a required selector is missing', () => {
    const missing = extractPage(HTML, 'https://docs.test/', '.does-not-exist');
    expect(missing.sections).toEqual([]);
    expect(missing.links.length).toBeGreaterThan(0);
  });
});

describe('splitText', () => {
  it('leaves short text alone', () => {
    expect(splitText('short')).toEqual(['short']);
  });

  it('keeps every piece within the limit and loses no text', () => {
    const text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const pieces = splitText(text, 200, 30);

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.length <= 200)).toBe(true);
    for (let i = 0; i < 300; i++) expect(pieces.join(' ')).toContain(`word${i}`);
  });

  it('overlaps pieces, so a fact on a boundary survives', () => {
    const pieces = splitText('a '.repeat(500), 100, 40);
    expect(pieces[1]?.length).toBeGreaterThan(40);
  });

  it('always finishes on text with no break points', () => {
    expect(splitText('x'.repeat(1000), 100, 90).length).toBeGreaterThan(5);
  });
});

describe('chunkPage', () => {
  it('carries the source details onto every chunk', () => {
    const chunks = chunkPage(extractPage(HTML, 'https://docs.test/guide/'), 'https://docs.test/guide/');
    expect(chunks[1]).toMatchObject({ url: 'https://docs.test/guide/', title: 'Guide', heading: 'Install', anchor: 'install' });
  });

  it('adds the title and heading to the embedded text', () => {
    expect(toEmbeddingText({ title: 'Guide', heading: 'Install', content: 'Run it' })).toBe('Guide > Install\nRun it');
  });
});
