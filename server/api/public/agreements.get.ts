// Sign-up: the Terms of Service and Data Privacy Agreement to read before creating a Finvry account (Nigerian
// versions for Nigeria, California and US federal law everywhere else).
export default defineEventHandler(async (event) => {
  rateLimit('agreements_ip', clientIp(event), 120, 60 * 60 * 1000)
  const q = getQuery(event)
  const ng = /^\s*nigeria\s*$/i.test(String(q.country ?? ''))
  const docs = await signupAgreements({ ng, company: String(q.company ?? '').trim().slice(0, 200) || 'your company', signer: { name: String(q.name ?? '').trim().slice(0, 120) || 'you', email: String(q.email ?? '').trim().slice(0, 254) || 'your email' } })
  return { ng, docs: docs.map((d) => ({ code: d.code, title: d.title, md: d.md })) }
})
