// The generator's article as clean HTML, for the CMS editor and the websites.
//
// Research.content is whatever n8n returned: sometimes HTML, sometimes plain
// text with blank lines between paragraphs, literal "\n" escapes, "H2:"
// markers and bare URLs. The Article Generator tidies that up for its preview
// modal only (Dashboard.tsx, renderContentLink). This does the same job for
// the CMS, with two differences: no inline styles, because the editor and
// each site's template do the styling, and no link ever wrapped inside
// another link.

// Content with paragraphs is already structured; anything else is text to be
// turned into paragraphs. The same test the generator's preview uses.
const HAS_PARAGRAPHS = /<p[\s>]/i;
const STARTS_WITH_BLOCK = /^<(h[1-6]|ul|ol|blockquote|div|table|pre|figure)[\s>]/i;

// Bare URLs become links, but only in text: never inside a tag, and never
// inside an existing <a>, so nothing gets linked twice.
function linkifyText(html: string): string {
  const parts = html.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/gi);
  return parts
    .map((part) => {
      if (!part || part.startsWith('<')) return part;
      return part.replace(/https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g, (url) => `<a href="${url}">${url}</a>`);
    })
    .join('');
}

function looksLikeHeading(line: string): boolean {
  if (line.length >= 90 || /[.!?:,;]$/.test(line)) return false;
  const words = line.split(/\s+/);
  const capitalised = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
  return words.length > 0 && capitalised / words.length >= 0.5;
}

function blocksToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      if (STARTS_WITH_BLOCK.test(block)) return block;
      const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((l) => /^[•\-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li><p>${l.replace(/^[•\-*]\s+/, '')}</p></li>`).join('')}</ul>`;
      }
      if (lines.length > 1 && lines.every((l) => /^\d+[.)]\s+/.test(l))) {
        return `<ol>${lines.map((l) => `<li><p>${l.replace(/^\d+[.)]\s+/, '')}</p></li>`).join('')}</ol>`;
      }
      if (lines.length === 1 && looksLikeHeading(lines[0])) return `<h2>${lines[0]}</h2>`;
      return `<p>${lines.join(' ')}</p>`;
    })
    .join('');
}

export function toArticleHtml(raw: string | null | undefined): string {
  let html = String(raw ?? '').trim();
  if (!html) return '';

  // The webhook sends literal "\n" sequences between paragraphs.
  html = html.replace(/\\n/g, '\n');

  // The title is its own field in the CMS, so the article's own <h1> goes.
  const withoutTitle = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim();
  if (withoutTitle) html = withoutTitle;

  // Decided before any heading is added below, or the headings added here
  // would make plain text look structured and it would never get paragraphs.
  const structured = HAS_PARAGRAPHS.test(html);

  // "H2: Upgrade the Graphics Card. For individuals..." — the heading runs to
  // the first full stop.
  html = html.replace(/H2:\s*(?:\d+\.\s*)?([^.\n<]+)\.\s*/g, (_m, heading: string) => `\n\n<h2>${heading.trim()}</h2>\n\n`);

  // "Click here https://example.com" reads naturally as a link on the words.
  html = html.replace(
    /(Click here)(?:\s*[:-]\s*|\s+)(https?:\/\/[^\s<>"]+)/gi,
    (_m, label: string, url: string) => `<a href="${url}">${label}</a>`,
  );

  // A broken anchor the writer sometimes emits: https://example.com">Label text
  html = html.replace(/(https?:\/\/[^"\s<>]+)">\s*([^\n<]+)/g, (match, url: string, label: string, offset: number, full: string) => {
    const before = full.slice(Math.max(0, offset - 6), offset);
    return before === 'href="' ? match : `<a href="${url}">${label.trim()}</a>`;
  });

  html = linkifyText(html);

  if (!structured) html = blocksToHtml(html);
  return html.trim();
}

// An address safe for every site: ASCII, lowercase, hyphens. Webstudio
// rejects anything else in a path, an en dash included.
export function slugify(input: string, max = 80): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  const lastBreak = cut.lastIndexOf('-');
  return (lastBreak > max / 2 ? cut.slice(0, lastBreak) : cut).replace(/-+$/, '');
}

// What a reader would see, for word counts and the excerpt fallback.
export function textOf(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function wordCount(html: string): number {
  const text = textOf(html);
  return text ? text.split(' ').length : 0;
}

// For noticing the generator rewrote an article after a post was made from it.
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The full address of an article, or null until its site has a domain.
export function articleUrl(domain: string | null | undefined, blogPath: string | null | undefined, slug: string | null | undefined): string | null {
  const host = String(domain ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host || !slug) return null;
  const path = String(blogPath ?? '/blog').replace(/\/+$/, '');
  return `https://${host}${path}/${slug}`;
}
