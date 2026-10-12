// The public list of approved partners and their discount (for the app's /partners page and finvry.com).
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return { partners: await publicPartners() }
})
