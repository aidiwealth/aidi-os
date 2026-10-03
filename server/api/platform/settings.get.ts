export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return await billingSettings()
})
