import { getApiKey } from './aiSettings';
import { CategoryDef } from '../types';

export class NoApiKeyError extends Error {
  constructor() {
    super('No Anthropic API key set. Add one in Settings to use AI features.');
    this.name = 'NoApiKeyError';
  }
}

async function askClaude(prompt: string, maxTokens = 512, useWebSearch = false): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new NoApiKeyError();

  // Web search is a server-side tool only Sonnet/Opus-class models support —
  // Haiku doesn't, which is why merchant lookups (the one place we actually
  // need it) use Sonnet rather than a cheaper model.
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  // With web search enabled, content mixes tool-use/tool-result blocks in
  // with text blocks — concatenate just the text so callers get a clean
  // answer regardless of how many searches the model ran along the way.
  const content = data.content ?? [];
  return content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('\n')
    .trim();
}

export interface MerchantIdentification {
  cleanName: string;
  category: string;
}

// Turns a raw statement line like "IMAGINUS CANADA LIMITE TORONTO ON" into a
// clean, human-readable merchant name plus a category guess, using web search
// to identify unfamiliar businesses. Callers are expected to check the local
// merchant_aliases cache (getMerchantAlias) before calling this, and cache the
// result afterward (setMerchantAlias) — this function itself doesn't cache,
// it just does the one-time lookup.
export async function identifyMerchantAI(
  rawDescription: string,
  amount: number,
  categories: CategoryDef[],
): Promise<MerchantIdentification | null> {
  const categoryKeys = categories.map(c => c.key).join(', ');
  const prompt = `This is a raw line from a bank/credit card statement: "${rawDescription}"
Transaction amount: $${amount.toFixed(2)}

Identify the actual business this refers to (use web search if the name is unfamiliar or abbreviated). Then reply with ONLY a JSON object, no other text, in exactly this shape:
{"clean_name": "Human-Readable Business Name", "category": "one_of_${categoryKeys.replace(/, /g, '_or_')}"}

The category must be one of: ${categoryKeys}. If you can't identify the business confidently, set clean_name to a reasonably cleaned-up version of the original text (proper capitalization, no trailing location/reference codes) instead of guessing wildly.`;

  const reply = await askClaude(prompt, 300, true);
  const jsonMatch = reply.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const category = categories.find(c => c.key.toLowerCase() === String(parsed.category).toLowerCase());
    if (!parsed.clean_name || !category) return null;
    return { cleanName: parsed.clean_name, category: category.key };
  } catch {
    return null;
  }
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
