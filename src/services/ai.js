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

module.exports = { correctTranscript, assessWinProbability, MODEL };
