// AI screening of a founder pitch against the Aidi Ventures Fund I thesis. The model advises; partners decide.
import { z } from 'zod'

export const PITCH_PROMPT_VERSION = 'pitch-screen-v1'

const THESIS = `You screen founder pitches for Aidi Ventures, the venture arm of The Aidi Group.

Fund I thesis:
- Backs exceptional African and diaspora technical talent building AI, infrastructure and financial services for the world.
- Open to founders of any background. It is not a gender-only or Africa-only fund.
- Prefers companies building for global customers; signals such as Y Combinator, Stanford or similar programmes are a plus, never a requirement.
- Stages: pre-seed to Series A.
- Investing in companies that operate only in Africa is done through debt, not equity: flag these as "Africa debt sleeve" rather than marking them down.

Fairness rules (mandatory):
- Never treat race, ethnicity, nationality or gender as a negative factor.
- A disclosed female founder is a positive signal only.
- Judge only what the pitch says. Do not invent facts. If information is missing, say so in concerns and questions.

Scoring:
- thesis_fit, team, market, traction: 1 (weak) to 5 (strong).
- score: 0-100 overall.
- recommendation: "prioritise" (strong fit, a partner should look soon), "review" (worth a look), or "likely_pass" (weak fit). This is advice for partners; you never decline anyone.`

export const ScreeningSchema = z.object({
  score: z.number().int().min(0).max(100),
  recommendation: z.enum(['prioritise', 'review', 'likely_pass']),
  thesis_fit: z.number().int().min(1).max(5),
  team: z.number().int().min(1).max(5),
  market: z.number().int().min(1).max(5),
  traction: z.number().int().min(1).max(5),
  summary: z.array(z.string().min(1).max(300)).length(3),
  strengths: z.array(z.string().min(1).max(300)).max(5),
  concerns: z.array(z.string().min(1).max(300)).max(5),
  questions_for_founder: z.array(z.string().min(1).max(300)).max(5),
  flags: z.array(z.string().min(1).max(100)).max(5)
})
export type Screening = z.infer<typeof ScreeningSchema>

const SCREENING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'recommendation', 'thesis_fit', 'team', 'market', 'traction', 'summary', 'strengths', 'concerns', 'questions_for_founder', 'flags'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    recommendation: { type: 'string', enum: ['prioritise', 'review', 'likely_pass'] },
    thesis_fit: { type: 'integer', minimum: 1, maximum: 5 },
    team: { type: 'integer', minimum: 1, maximum: 5 },
    market: { type: 'integer', minimum: 1, maximum: 5 },
    traction: { type: 'integer', minimum: 1, maximum: 5 },
    summary: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3, description: 'Exactly three short lines a partner can read in ten seconds' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    concerns: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    questions_for_founder: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    flags: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Short tags, e.g. "Africa debt sleeve", "outside stage", "no deck"' }
  }
}

interface PitchRow {
  id: string; company: string; website: string | null; deck_url: string | null; country: string | null; stage: string
  sector: string | null; raising_usd: string | null; one_liner: string; description: string; traction: string | null
  team: string | null; female_founder: boolean | null; status: string
}

export async function screenPitch(pitchId: string): Promise<{ screeningId: string; output: Screening }> {
  const p = await one<PitchRow>(
    'SELECT id, company, website, deck_url, country, stage, sector, raising_usd::text, one_liner, description, traction, team, female_founder, status FROM deals.pitches WHERE id = $1',
    [pitchId])
  // Minimum data: no founder name, email or IP goes to the model.
  const user = [
    'Company: ' + p.company,
    'One-liner: ' + p.one_liner,
    'Stage: ' + p.stage.replace('_', '-'),
    'Sector: ' + (p.sector ?? 'not given'),
    'Country of operation: ' + (p.country ?? 'not given'),
    'Raising (USD): ' + (p.raising_usd ?? 'not given'),
    'Website: ' + (p.website ?? 'not given'),
    'Deck link provided: ' + (p.deck_url ? 'yes' : 'no'),
    'Female founder on the team (self-disclosed): ' + (p.female_founder === true ? 'yes' : 'not disclosed'),
    '', 'What they are building:', p.description,
    '', 'Traction:', p.traction ?? 'not given',
    '', 'Team:', p.team ?? 'not given'
  ].join('\n')
  const model = useRuntimeConfig().aiModelPitchScreen
  const { runId, output } = await runAiTool<Screening>({
    task: 'pitch_screen', model, promptVersion: PITCH_PROMPT_VERSION, inputRef: 'deals.pitches:' + p.id,
    system: THESIS, user, toolName: 'record_screening',
    toolDescription: 'Record the screening of this pitch against the Aidi Ventures Fund I thesis.',
    jsonSchema: SCREENING_JSON_SCHEMA, schema: ScreeningSchema, maxTokens: 1500
  })
  const s = await one<{ id: string }>(
    `INSERT INTO deals.screenings (pitch_id, ai_run_id, score, recommendation, thesis_fit, team_score, market_score, traction_score, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [p.id, runId, output.score, output.recommendation, output.thesis_fit, output.team, output.market, output.traction,
     JSON.stringify({ summary: output.summary, strengths: output.strengths, concerns: output.concerns, questions_for_founder: output.questions_for_founder, flags: output.flags })])
  await db().query("UPDATE deals.pitches SET status = 'screened' WHERE id = $1 AND status = 'new'", [p.id])
  await audit({ actorUserId: null, action: 'deal.screened', objectType: 'pitch', objectId: p.id, detail: { score: output.score, recommendation: output.recommendation, ai_run_id: runId } })
  return { screeningId: s.id, output }
}
