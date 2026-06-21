const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const LANGUAGE_NAMES = {
  cs: 'Czech',
  en: 'English',
  de: 'German',
  tr: 'Turkish',
};

async function correctTranscript(text, language) {
  const client = getClient();
  if (!client) throw new Error('AI not configured');

  const langName = LANGUAGE_NAMES[language] || 'English';
  const prompt = `You are a transcription correction assistant.
The following text is a voice-to-text transcript in ${langName}.
Correct grammar, punctuation and natural phrasing.
Preserve the original meaning and style exactly.
Fix only language errors, not content.
Return ONLY the corrected text, nothing else.

Transcript: ${text}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

async function assessWinProbability(project, comments, lang) {
  const client = getClient();
  if (!client) throw new Error('AI not configured');

  const langName = LANGUAGE_NAMES[lang] || 'English';
  const commentsText = comments
    .map((c) => `- [${c.created_at}] ${c.author_name}: ${c.content}`)
    .join('\n') || '(no comments yet)';

  const prompt = `You are a B2B sales analyst for MINIB a.s., a Czech manufacturer of heating and cooling convectors (fan coils, induction units, trench convectors).

Analyze this project and estimate the probability MINIB will win the order.

Project data:
${JSON.stringify(project, null, 2)}

Recent comments:
${commentsText}

Consider: project phase and timeline, client engagement signals in comments, competitors mentioned, deal size, owner's activity, vagueness vs specificity of information.

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "probability": <number 0-100>,
  "probability_min": <number 0-100>,
  "probability_max": <number 0-100>,
  "reasoning": "<2-4 sentences in ${langName}>"
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

const PRICELIST_CONTEXT = `
MINIB product line – typical list prices per piece (EUR, average across common sizes):
- P (trench standard): 180–350 EUR, avg ~230
- PB (trench + blower): 175–420 EUR, avg ~270
- PBE (trench + electric blower): 160–415 EUR, avg ~270
- PO / PMA (trench motor): avg ~350
- T (trench design): 294–610 EUR, avg ~420
- TE (trench design electric): 365–641 EUR, avg ~497
- HT (trench high-output): 433–705 EUR, avg ~545
- KT (trench compact): 352–692 EUR, avg ~505
- TO (trench motor design): 419–721 EUR, avg ~580
- HC (trench high-capacity): 481–1285 EUR, avg ~750
- HC 4P (trench high-capacity 4-pipe): 529–1317 EUR, avg ~800
- HC air (trench fan-coil): avg ~794
- SPB (free-standing blower): 212–588 EUR, avg ~380
- SKB (free-standing design blower): 420–871 EUR, avg ~625
- NPB (wall-mounted blower): 229–612 EUR, avg ~390
- NKB (wall-mounted design blower): 420–871 EUR, avg ~625
- NC (wall-mounted high-capacity): avg ~873
- NC 4P (wall-mounted 4-pipe): avg ~916
- Thermostat UT15: 70 EUR/pc
- Electrothermic head: 50 EUR/pc
- Connection set: ~25–28 EUR/pc
`;

async function estimateProjectValue(productsText) {
  const client = getClient();
  if (!client) throw new Error('AI not configured');

  const prompt = `You are a pricing assistant for MINIB a.s., a Czech manufacturer of heating convectors.

Below is the MINIB pricelist with typical prices per piece:
${PRICELIST_CONTEXT}

A salesperson wrote this about a project's products and quantities:
"${productsText}"

Your task:
1. Identify the product type(s) and quantity from the text (product codes like HC, KT, PB, T, etc. + number of pieces).
2. Use the pricelist above to estimate total project value in EUR (quantity × avg price per type).
3. If multiple product types, sum them.
4. If quantity is missing or unclear, make a reasonable assumption and note it.
5. If the text contains no useful product/quantity info, return null.

Respond ONLY with valid JSON, no markdown:
{
  "estimated_value_eur": <number or null>,
  "breakdown": "<short explanation: what products, how many, what price used>",
  "confidence": "high" | "medium" | "low"
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

async function translateComment(content, sourceLang) {
  const client = getClient();
  if (!client) throw new Error('AI not configured');

  const srcName = LANGUAGE_NAMES[sourceLang] || 'English';
  const prompt = `Translate the following text from ${srcName} into Czech, English, German and Turkish.
Return ONLY valid JSON, no markdown, no explanation:
{
  "cs": "<Czech translation>",
  "en": "<English translation>",
  "de": "<German translation>",
  "tr": "<Turkish translation>"
}

If the source language is one of the targets, copy the original text for that language instead of translating.

Text to translate:
"""
${content}
"""`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

module.exports = { correctTranscript, assessWinProbability, estimateProjectValue, translateComment, MODEL };
