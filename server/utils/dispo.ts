// A Content-Disposition value that is safe for any file name. Header values must be plain Latin-1, so a name with an
// em dash, accents or emoji (e.g. "SAFE — Kepple West Africa LLP") made the server fail with an error; the plain form
// carries an ASCII copy and filename* the real name for browsers that read it.
export function dispo(kind: 'inline' | 'attachment', name: string): string {
  const clean = String(name || 'file').replace(/[\r\n"\\]/g, '_')
  const ascii = clean.normalize('NFKD').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim() || 'file'
  return kind + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(clean)
}
