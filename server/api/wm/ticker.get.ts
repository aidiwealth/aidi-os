// The live market strip for the Wealth pages: admins, GPs and team members who can use Wealth management (this path
// is only reachable with that module, see server/utils/modules.ts). Public prices only.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  setResponseHeader(event, 'cache-control', 'private, max-age=10')
  return marketTicker()
})
