export default defineEventHandler(async (event) => {
  const s = await requireUser(event)
  return { email: s.email, roles: s.roles }
})
