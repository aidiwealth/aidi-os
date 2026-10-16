// What "Fill with AI" returns when adding an investor.
export interface InvestorGuess { name: string; firm: string; role: string; email: string; ticket_min_usd: number | null; ticket_max_usd: number | null; stages: string[]; sectors: string[]; location: string; profile: string; known: boolean }
