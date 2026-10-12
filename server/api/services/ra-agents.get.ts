// Registered agent for Finvry companies: the default and any per-state agent.
import { US_STATES } from '~/shared/countries'
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  return { ...(await raAgents()), us_states: US_STATES }
})
