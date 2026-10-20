// Plan billing for the console: monthly, yearly or the company's choice, and the discount for paying yearly.
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event)
  return { ...(await planBilling()), owner: staff.staffRole === 'owner' }
})
