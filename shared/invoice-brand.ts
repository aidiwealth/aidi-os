// How Finvry invoices present the seller: the Finvry logo, "A product of TAGroup" beneath it, and finvry.com contact
// details only (never an Aidi name or domain). The legal line at the bottom is editable in Services settings; {year}
// becomes the current year, and older wording that names Aidi is replaced by the Finvry line.
export const FINVRY_TAGLINE = 'A product of TAGroup'
export const DEFAULT_LEGAL_FOOTER = '© {year} Finvry, a product of TAGroup. All rights reserved. finvry.com'
export function legalFooter(text: string | null | undefined): string {
  const t = text == null || /aidi/i.test(text) ? DEFAULT_LEGAL_FOOTER : text
  return t.replace(/\{year\}/g, String(new Date().getUTCFullYear())).trim()
}
// A contact email for a Finvry invoice: kept when it is a finvry.com address, otherwise billing@finvry.com.
export function finvryEmail(email: string | null | undefined): string {
  const e = String(email ?? '').trim()
  return /@([a-z0-9-]+\.)*finvry\.com$/i.test(e) ? e : 'billing@finvry.com'
}
// Address lines without any Aidi name in them (the seller's legal name is not shown on Finvry invoices).
export function finvryAddress(address: string | null | undefined): string {
  return String(address ?? '').split(/\n/).filter((l) => !/aidi/i.test(l)).join('\n').trim()
}
