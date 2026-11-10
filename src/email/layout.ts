import { escapeHtml } from '../lib/util';

export interface LayoutInput {
  siteName: string;
  tagline: string;
  logoUrl: string;      // absolute https URL to a PNG/JPG
  baseUrl: string;
  heading: string;
  bodyHtml: string;     // already-safe HTML
  button?: { label: string; url: string };
  preheader: string;
  footerLines: string[];
  locale: string;
}

const C = { obsidian: '#101010', gold: '#B89554', charcoal: '#38332C', ivory: '#E9E0CD', paper: '#F8F5EE', ink: '#1E1B17', muted: '#6B645A' };

/**
 * Responsive, table-based email layout with inline styles (works in Gmail, Outlook,
 * Apple Mail and mobile clients). Dark branded header, light reading card.
 */
export function renderLayout(i: LayoutInput): string {
  const button = i.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px"><tr><td style="border-radius:2px;background:${C.gold}">
<a href="${escapeHtml(i.button.url)}" style="display:inline-block;padding:14px 28px;font-family:Georgia,'Times New Roman',serif;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:${C.obsidian};text-decoration:none;font-weight:bold">${escapeHtml(i.button.label)}</a>
</td></tr></table>
<p style="margin:8px 0 0;font-size:12px;color:${C.muted};word-break:break-all">${escapeHtml(i.button.url)}</p>`
    : '';
  return `<!doctype html>
<html lang="${escapeHtml(i.locale)}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(i.heading)}</title>
<style>
  @media (max-width:620px){ .container{width:100%!important} .pad{padding:28px 22px!important} h1{font-size:24px!important} }
  a{color:${C.charcoal}}
  blockquote{margin:16px 0;padding:12px 16px;border-left:3px solid ${C.gold};background:#F1ECE1}
  .body p{margin:0 0 16px} .body ul,.body ol{margin:0 0 16px;padding-left:22px} .body li{margin:0 0 6px}
</style>
</head>
<body style="margin:0;padding:0;background:${C.obsidian};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(i.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.obsidian}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px">
    <tr><td align="center" style="padding:20px 0 24px;border-bottom:1px solid ${C.gold}">
      <a href="${escapeHtml(i.baseUrl)}" style="text-decoration:none">
        <img src="${escapeHtml(i.logoUrl)}" width="72" height="72" alt="${escapeHtml(i.siteName)}" style="display:block;margin:0 auto 12px;border:0;width:72px;height:72px">
        <span style="display:block;font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:.22em;text-transform:uppercase;color:${C.ivory}">${escapeHtml(i.siteName)}</span>
        <span style="display:block;margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${C.gold}">${escapeHtml(i.tagline)}</span>
      </a>
    </td></tr>
    <tr><td style="padding:24px 0 0">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.paper};border-top:3px solid ${C.gold}">
        <tr><td class="pad body" style="padding:40px 44px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${C.ink}">
          <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.25;color:${C.obsidian}">${escapeHtml(i.heading)}</h1>
          ${i.bodyHtml}
          ${button}
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 16px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#A79F90">
      ${i.footerLines.filter(Boolean).map((l) => `<p style="margin:0 0 6px">${l}</p>`).join('')}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
