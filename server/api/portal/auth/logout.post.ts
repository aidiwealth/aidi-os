export default defineEventHandler(async (event) => { await endPortalSession(event); return { ok: true } })
