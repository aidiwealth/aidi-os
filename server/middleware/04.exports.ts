// Downloads that build a file from a lot of data (exports, reports, PDFs): a few at a time per server, and up to 30 an
// hour per person (or address, when signed out), so many at once cannot slow the site for everyone. The slot is given
// back when the response ends (server/plugins/exports.ts).
const HEAVY = /^\/api\/(exports\/download|treasury\/cut-list|portfolio\/export|rentals\/export|wallet\/export|financials\/mgmt-report|financials\/statements-file|fundraising\/safes\/[^/]+\/pdf|meetings\/[^/]+\/pdf|docgen\/save|public\/pdf)(\/|$|\?)/
export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!HEAVY.test(path)) return
  const who = (event.context.user as { userId?: string } | undefined)?.userId ?? clientIp(event)
  await rateLimit('export', who, 30, 60 * 60 * 1000)
  if (!exportSlotTake()) throw apiError('busy', 'Other files are being prepared right now. Try again in a moment.', 429)
  event.context.__exportSlot = true
})
