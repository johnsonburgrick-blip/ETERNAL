import { escapeHtml, safeHref } from './util';

/**
 * Small, safe Markdown subset renderer. All input is HTML-escaped first, so editors
 * cannot inject markup or scripts. Supported: headings (##, ###), paragraphs,
 * **bold**, *italic*, [links](url), ![images](url "caption"), - / 1. lists,
 * > blockquotes, --- rules, line breaks.
 */
function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, alt, url, cap) => {
    const href = safeHref(url.replace(/&amp;/g, '&'));
    if (!href) return '';
    const img = `<img src="${escapeHtml(href)}" alt="${alt}" loading="lazy" decoding="async">`;
    return cap ? `<figure>${img}<figcaption>${cap}</figcaption></figure>` : img;
  });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const href = safeHref(url.replace(/&amp;/g, '&'));
    if (!href) return text;
    const ext = /^https?:/i.test(href);
    return `<a href="${escapeHtml(href)}"${ext ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return t;
}

export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return '';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      flushAll();
    } else if ((m = line.match(/^(#{2,4})\s+(.*)$/))) {
      flushAll();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if (/^---+$/.test(line.trim())) {
      flushAll();
      out.push('<hr>');
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else {
      flushList();
      flushQuote();
      para.push(line.trim());
    }
  }
  flushAll();
  return out.join('\n');
}

export function stripMarkdown(src: string | null | undefined): string {
  return String(src ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
