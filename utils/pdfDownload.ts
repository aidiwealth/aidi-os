// Download a server-built PDF (documents and invoices) instead of printing the screen.
export async function downloadPdf(body: Record<string, unknown>, publicPage = false): Promise<void> {
  const res = await fetch(publicPage ? '/api/public/pdf' : '/api/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
  if (!res.ok) { alert('Could not create the PDF. Please try again.'); return }
  const blob = await res.blob(); const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'document.pdf'
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}
// Map the invoice shapes used across the app to the PDF format.
export function invoiceForPdf(inv: Record<string, any>, issuer?: Record<string, any> | null): Record<string, unknown> {
  const iss = issuer ?? inv.issuer ?? {}
  const bank = iss.bank && typeof iss.bank === 'object' ? Object.entries(iss.bank as Record<string, string>).filter(([, v]) => v).map(([k, v]) => k.replace(/_/g, ' ') + ': ' + v).join('\n') : ''
  return { number: String(inv.number ?? ''), issue_date: String(inv.issue_date ?? ''), due_date: inv.due_date ?? null, status: inv.status ?? null, paid_at: inv.paid_at ?? null, currency: String(inv.currency ?? 'USD'),
    issuer: { name: String(iss.issuer_name ?? iss.issuer ?? iss.name ?? ''), address: iss.issuer_address ?? iss.address ?? undefined, email: iss.issuer_email ?? iss.email ?? undefined, phone: iss.phone ?? undefined },
    bill_to: { name: String(inv.bill_to?.name ?? inv.customer ?? inv.client ?? ''), email: inv.bill_to?.email ?? undefined, address: inv.bill_to?.address ?? undefined },
    lines: (inv.lines ?? []).map((l: Record<string, unknown>) => ({ description: String(l.description ?? ''), quantity: Number(l.quantity ?? 1), unit_amount: Number(l.unit_amount ?? l.amount ?? 0), amount: Number(l.amount ?? 0), ...(l.kind ? { kind: String(l.kind) } : {}) })),
    amount: Number(inv.amount ?? 0), note: inv.note ?? null, payment: (iss.payment_instructions ?? '') || bank || null, period: inv.period_start && inv.period_end ? inv.period_start + ' to ' + inv.period_end : null }
}
