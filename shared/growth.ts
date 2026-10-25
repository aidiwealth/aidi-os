// What a bank sheet or file would change, held for review before it is written.
export interface ImportSummary { rows: number; added: number; changed: number; unchanged: number; skipped: number; sample: { name: string; what: 'new' | 'changed'; changes: string[] }[] }
