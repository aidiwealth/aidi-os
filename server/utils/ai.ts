// Claude calls with structured output only: the model must answer through one tool whose input is validated
// with Zod. One retry on invalid output, then the failure is recorded and raised. Every attempt is logged to core.ai_runs.
import type { z } from 'zod'

// USD per million tokens. Add a row when a new model is configured.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 }
}

export interface AiToolCall<T> {
  task: string
  model: string
  promptVersion: string
  inputRef: string
  system: string
  user: string
  userContent?: unknown[] // optional rich content (for example a PDF document block); replaces `user` when given
  toolName: string
  toolDescription: string
  jsonSchema: Record<string, unknown>
  schema: z.ZodType<T>
  maxTokens: number
}

interface AnthropicResponse {
  content?: { type: string; name?: string; input?: unknown }[]
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
}

async function logRun(input: { task: string; model: string; promptVersion: string; inputRef: string; output: unknown; valid: boolean; error: string | null; usage: AnthropicResponse['usage']; billed?: 'plan' | 'credits' }): Promise<string> {
  const u = input.usage ?? {}
  const inTok = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  const outTok = u.output_tokens ?? 0
  const price = PRICES[input.model]
  const cost = price ? (inTok * price.input + outTok * price.output) / 1_000_000 : null
  const row = await one<{ id: string }>(
    'INSERT INTO core.ai_runs (task, model, prompt_version, input_ref, output, valid, error, input_tokens, output_tokens, cost_usd, billed_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    [input.task, input.model, input.promptVersion, input.inputRef, input.output === undefined ? null : JSON.stringify(input.output),
     input.valid, input.error, inTok, outTok, cost, input.billed ?? 'plan'])
  if (input.billed === 'credits') { const org = currentOrgId(); if (org) await aiChargeCredits(org, inTok + outTok) }
  return row.id
}

export async function runAiTool<T>(call: AiToolCall<T>): Promise<{ runId: string; output: T }> {
  const { anthropicApiKey, anthropicBaseUrl } = useRuntimeConfig()
  if (!anthropicApiKey) throw new Error('NUXT_ANTHROPIC_API_KEY is not set')
  const gate = await aiGate()
  const bill = (x: Parameters<typeof logRun>[0]) => logRun({ ...x, billed: gate.billed })
  let lastError = 'no attempt made'
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response
    try {
      res = await fetch(anthropicBaseUrl.replace(/\/$/, '') + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: call.model,
        max_tokens: call.maxTokens,
        system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
        tools: [{ name: call.toolName, description: call.toolDescription, input_schema: call.jsonSchema }],
        tool_choice: { type: 'tool', name: call.toolName },
        messages: [{ role: 'user', content: call.userContent ?? call.user }]
      })
      })
    } catch (err) {
      lastError = 'network: ' + (err instanceof Error ? err.message : String(err))
      await bill({ ...call, output: undefined, valid: false, error: lastError, usage: undefined })
      continue
    }
    if (!res.ok) {
      lastError = 'Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 500)
      await bill({ ...call, output: undefined, valid: false, error: lastError, usage: undefined })
      if (res.status >= 500 || res.status === 429) continue
      throw new Error(lastError)
    }
    const body = await res.json() as AnthropicResponse
    const block = body.content?.find((c) => c.type === 'tool_use' && c.name === call.toolName)
    const parsed = call.schema.safeParse(block?.input)
    if (parsed.success) {
      const runId = await bill({ ...call, output: parsed.data, valid: true, error: null, usage: body.usage })
      return { runId, output: parsed.data }
    }
    lastError = 'invalid output: ' + parsed.error.message.slice(0, 500)
    await bill({ ...call, output: block?.input ?? body, valid: false, error: lastError, usage: body.usage })
  }
  throw new Error('[ai] ' + call.task + ' failed after retry: ' + lastError)
}
