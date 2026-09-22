/**
 * Receipt image templates. These emit HTML with INLINE styles using only the CSS
 * subset satori supports (flexbox, no grid, no pseudo-elements, no classes). The
 * visual design mirrors the approved mockup; rendered at 1080px wide, auto height.
 */

export type ReceiptParty = 'customer' | 'vendor' | 'rep' | 'platform';

export interface ReceiptContact {
  website: string;
  email: string;
  phone: string;
}

export interface ReceiptLine {
  label: string;
  sub?: string;
  value: string;
  kind?: 'normal' | 'muted' | 'plus' | 'minus';
}

export interface ReceiptMeta {
  k: string;
  v: string;
}

export interface ReceiptModel {
  party: ReceiptParty;
  accent: string; // header pill + hairline
  tag: string; // header pill text
  title: string;
  sub: string; // "WM-ORD-4821 · 22 Sep 2026"
  amountLabel: string;
  amountNaira: string; // "₦9,443"
  amountSub: string; // "1,377 WP · from Wallet"
  stamp?: { text: string; color: string };
  lines: ReceiptLine[];
  total?: ReceiptLine;
  meta: ReceiptMeta[];
  trust: string; // plain text (no inline markup — satori limitation)
}

const C = {
  green: '#00281c',
  mint: '#3bf4be',
  paper: '#fbfbf6',
  paperInk: '#13241d',
  paperMuted: '#71786e',
  paperLine: '#ece9dc',
  white: '#ffffff',
  whiteDim: 'rgba(255,255,255,0.72)',
  whiteFaint: 'rgba(255,255,255,0.5)',
};

function esc(s: string): string {
  // satori-html does not decode HTML entities, so only strip the structural chars
  // that would break parsing; leave `&` (and characters like ₦, ×, ★) as literals.
  return String(s ?? '')
    .replace(/</g, '‹')
    .replace(/>/g, '›');
}

function valueColor(kind?: ReceiptLine['kind']): string {
  if (kind === 'muted' || kind === 'minus') return C.paperMuted;
  return C.paperInk;
}

function valuePrefix(kind?: ReceiptLine['kind']): string {
  if (kind === 'plus') return '+ ';
  if (kind === 'minus') return '– ';
  return '';
}

function lineRow(l: ReceiptLine, isTotal = false): string {
  const border = isTotal
    ? 'border-top:3px solid #13241d; margin-top:10px; padding:26px 0 6px;'
    : 'border-bottom:2px solid #ece9dc; padding:22px 0;';
  const labelWeight = isTotal ? 700 : 500;
  const valWeight = isTotal ? 800 : 600;
  const valSize = isTotal ? 42 : 34;
  const labelColor = l.kind === 'muted' ? C.paperMuted : C.paperInk;
  const subHtml = l.sub
    ? `<div style="display:flex; color:${C.paperMuted}; font-family:'DM Mono'; font-size:26px; margin-top:6px;">${esc(l.sub)}</div>`
    : '';
  return `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; ${border}">
    <div style="display:flex; flex-direction:column; max-width:640px;">
      <div style="display:flex; font-size:34px; font-weight:${labelWeight}; color:${labelColor};">${esc(l.label)}</div>
      ${subHtml}
    </div>
    <div style="display:flex; font-size:${valSize}px; font-weight:${valWeight}; color:${valueColor(l.kind)}; font-family:'DM Sans';">${valuePrefix(l.kind)}${esc(l.value)}</div>
  </div>`;
}

function metaCell(m: ReceiptMeta): string {
  return `
  <div style="display:flex; flex-direction:column; width:48%; margin-bottom:26px;">
    <div style="display:flex; font-family:'DM Mono'; font-size:23px; letter-spacing:2px; color:${C.paperMuted}; margin-bottom:8px;">${esc(m.k.toUpperCase())}</div>
    <div style="display:flex; font-size:32px; font-weight:600; color:${C.paperInk};">${esc(m.v)}</div>
  </div>`;
}

function contactRow(contact: ReceiptContact): string {
  const item = (t: string) =>
    `<div style="display:flex; color:${C.whiteDim}; font-family:'DM Mono'; font-size:25px;">${esc(t)}</div>`;
  const sep = `<div style="display:flex; color:${C.whiteFaint}; font-family:'DM Mono'; font-size:25px; margin:0 20px;">·</div>`;
  return `
  <div style="display:flex; flex-wrap:wrap; align-items:center; margin-top:26px; padding-top:26px; border-top:2px solid rgba(255,255,255,0.14);">
    ${item(contact.website)}${sep}${item(contact.email)}${sep}${item(contact.phone)}
  </div>`;
}

export function renderReceiptHtml(
  model: ReceiptModel,
  wordmarkDataUri: string,
  contact: ReceiptContact,
): string {
  const stampHtml = model.stamp
    ? `<div style="display:flex; align-self:flex-start; font-family:'DM Mono'; font-size:28px; font-weight:500; letter-spacing:3px; color:${model.stamp.color}; border:3px solid ${model.stamp.color}; border-radius:16px; padding:12px 20px; transform:rotate(3deg);">${esc(model.stamp.text)}</div>`
    : '';

  const linesHtml = model.lines.map((l) => lineRow(l)).join('');
  const totalHtml = model.total ? lineRow(model.total, true) : '';
  const metaHtml = model.meta.length
    ? `<div style="display:flex; flex-wrap:wrap; justify-content:space-between; margin-top:36px;">${model.meta.map(metaCell).join('')}</div>`
    : '';

  return `
<div style="display:flex; flex-direction:column; width:1080px; background:${C.paper}; font-family:'DM Sans';">

  <!-- Header -->
  <div style="display:flex; flex-direction:column; background:${C.green}; padding:56px 64px 46px; border-bottom:6px solid ${model.accent};">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <img src="${wordmarkDataUri}" width="330" height="61" style="object-fit:contain;" />
      <div style="display:flex; font-family:'DM Mono'; font-size:26px; letter-spacing:3px; color:${C.green}; background:${model.accent}; padding:12px 22px; border-radius:999px;">${esc(model.tag.toUpperCase())}</div>
    </div>
    <div style="display:flex; font-size:52px; font-weight:700; color:${C.white}; margin-top:40px;">${esc(model.title)}</div>
    <div style="display:flex; font-family:'DM Mono'; font-size:29px; color:rgba(255,255,255,0.6); margin-top:12px;">${esc(model.sub)}</div>
  </div>

  <!-- Body -->
  <div style="display:flex; flex-direction:column; padding:48px 64px 40px;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <div style="display:flex; flex-direction:column;">
        <div style="display:flex; font-family:'DM Mono'; font-size:26px; letter-spacing:3px; color:${C.paperMuted}; margin-bottom:16px;">${esc(model.amountLabel.toUpperCase())}</div>
        <div style="display:flex; font-size:92px; font-weight:800; color:${C.paperInk}; line-height:1;">${esc(model.amountNaira)}</div>
        <div style="display:flex; font-family:'DM Mono'; font-size:29px; color:${C.paperMuted}; margin-top:16px;">${esc(model.amountSub)}</div>
      </div>
      ${stampHtml}
    </div>

    <div style="display:flex; height:2px; background:${C.paperLine}; margin:40px 0 8px;"></div>

    <div style="display:flex; flex-direction:column;">
      ${linesHtml}
      ${totalHtml}
    </div>

    ${metaHtml}
  </div>

  <!-- Footer -->
  <div style="display:flex; flex-direction:column; background:${C.green}; padding:40px 64px 44px;">
    <div style="display:flex; font-size:28px; line-height:1.5; color:${C.whiteDim};">${esc(model.trust)}</div>
    ${contactRow(contact)}
  </div>

</div>`;
}
