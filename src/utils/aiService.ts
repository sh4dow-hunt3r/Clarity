import { getApiKey } from './aiSettings';
import { CategoryDef } from '../types';

export class NoApiKeyError extends Error {
  constructor() {
    super('No Anthropic API key set. Add one in Settings to use AI features.');
    this.name = 'NoApiKeyError';
  }
}

async function askClaude(prompt: string, maxTokens = 512): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new NoApiKeyError();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

export async function categorizeTransactionAI(
  description: string,
  shop: string | null,
  amount: number,
  categories: CategoryDef[],
): Promise<{ category: string; subcategory?: string } | null> {
  const categoryKeys = categories.map(c => c.key).join(', ');
  const prompt = `You are categorizing a bank transaction for a personal finance app.
Description: "${description}"
Shop: "${shop ?? 'unknown'}"
Amount: $${amount.toFixed(2)}

Available categories: ${categoryKeys}

Reply with ONLY the single best-matching category key from the list above, nothing else.`;

  const reply = (await askClaude(prompt, 20)).trim().toLowerCase();
  const match = categories.find(c => c.key.toLowerCase() === reply);
  return match ? { category: match.key } : null;
}

export async function generateSpendingInsights(
  monthLabel: string,
  totalsByCategory: Record<string, number>,
  total: number,
  previousTotalsByCategory?: Record<string, number>,
): Promise<string> {
  const breakdown = Object.entries(totalsByCategory)
    .map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`)
    .join(', ');
  const previous = previousTotalsByCategory
    ? `\nPrevious month for comparison: ${Object.entries(previousTotalsByCategory)
        .map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`)
        .join(', ')}`
    : '';

  const prompt = `You are a personal finance assistant. Here is a user's spending for ${monthLabel}:
Total: $${total.toFixed(2)}
By category: ${breakdown}${previous}

Write 2-3 short, specific, plain-English observations about this spending (e.g. notable changes, high categories, anything worth flagging). No greeting, no sign-off, just the observations as short bullet points. Be concise.`;

  return askClaude(prompt, 300);
}
