// The legal line at the bottom of Finvry invoices. Editable in Services settings; {year} becomes the current year.
export const DEFAULT_LEGAL_FOOTER = '© {year} Finvry is a product of Aidi Ventures LLC (The Aidi Group). All rights reserved.'
export function legalFooter(text: string | null | undefined): string {
  const t = text == null ? DEFAULT_LEGAL_FOOTER : text
  return t.replace(/\{year\}/g, String(new Date().getUTCFullYear())).trim()
}
