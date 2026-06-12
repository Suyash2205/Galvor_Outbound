import type { ClaudeAnalysis } from "./types";
import type { ProcessedAd as Ad } from "./apify";

export function buildPrompt(
  brandName: string,
  industry: string,
  firstName: string,
  ads: Ad[]
): string {
  const sample = ads.slice(0, 120);
  return `You are a sharp ad intelligence analyst at Galvor, a performance marketing agency.

Analyze this Meta (Facebook/Instagram) Ad Library data for "${brandName}" — a ${industry} brand.

TASK 1 — Cluster the ads into 4–7 groups. Cluster by what actually differentiates the ads:
- Content type: Offer/Discount, Problem–Solution, Explainer/Educational, Testimonial, Brand Story, etc.
- Format: DCO/Catalog, Static Image, Video, Carousel, Reels/UGC
- Product focus: if titles reveal specific SKUs, categories, or campaigns, split accordingly

TASK 2 — Name each cluster in MAX 3 WORDS. Short, punchy, immediately readable. Examples of good names: "Catalog Retargeting", "Offer Drops", "Problem–Solution", "Explainer Videos", "Creator UGC", "Brand Story", "Product Launch". Never use full sentences or sub-clauses as names.

TASK 3 — For each cluster: a 1-line description written in plain marketing language (what the ad IS trying to do — e.g. "Retargeting ads showing products from their catalog", "Discount-led ads pushing seasonal offers"). No technical jargon. A non-technical brand manager should immediately understand it. Include adCount, avgAgeDays (integer), oldestDays.

TASK 4 — Write exactly 2 sentences of insight (under 40 words total). Use the actual brand name "${brandName}" — never write "the brand", "your brand", or any placeholder. Sentence 1: what dominates or is unusual about ${brandName}'s mix. Sentence 2: the one format/cluster ${brandName} isn't running that they should be.

TASK 5 — Write a follow-up email body. Sent 3 days after email 1 with no reply. Follow this EXACT structure — blocks separated by blank lines:

Block 1 — "Hi ${firstName},"

Block 2 — The data hook (2 sentences MAX):
  Sentence 1: "Pulled ${brandName}'s ad library." then state ONE specific ratio or count from the clusters (e.g. "X of Y active ads are [dominant cluster type]").
  Sentence 2: Combine the competitive gap AND the missing piece into one punchy sentence — e.g. "Your top ${industry} competitors are running [GAP FORMAT] that [benefit], and you're already producing [close equivalent] — just not getting [the missing piece]."

Block 3 — Cost + offer (2 sentences): "That gap has a measurable RoAS cost. We can quantify it for ${brandName} specifically — 20 minutes, no deck."

Block 4 — CTA (standalone line): "Worth a call this week?"

Rules:
- Use REAL numbers from the cluster data — never vague words like "many", "most", "several"
- Use "${brandName}" — no placeholders ever
- Do NOT reference the first email or say "I sent you something"
- Tone: sharp, data-first, no fluff

CRITICAL: Output must be ready to paste into an email with zero editing. Do NOT use placeholders, brackets, template variables like {{product.name}}, or anything the sender would need to fill in. Every word must be final and specific.

Ad data (ageDays = days since ad went live):
${JSON.stringify(sample)}

Respond ONLY with valid JSON — no markdown, no explanation:
{"clusters":[{"name":"...","description":"...","adCount":0,"avgAgeDays":0,"oldestDays":0}],"insight":"...","followUpBody":"..."}`;
}

export async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: { message?: string } })?.error?.message || "";
    if (res.status === 401) throw new Error("Invalid Anthropic API key.");
    if (res.status === 429) throw new Error("Rate limit hit. Wait a moment and try again.");
    throw new Error(`Claude API error ${res.status}${msg ? `: ${msg}` : ""}`);
  }

  const json = await res.json();
  return json.content?.[0]?.text || "";
}

export function parseClaudeResponse(raw: string): ClaudeAnalysis {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Unexpected response format from Claude. Please try again.");

  const result = JSON.parse(match[0]) as ClaudeAnalysis;
  if (!result.clusters?.length || !result.insight) {
    throw new Error("Claude response was incomplete. Please try again.");
  }
  return result;
}

export async function generateAnalysis(
  brandName: string,
  industry: string,
  firstName: string,
  ads: Ad[]
): Promise<ClaudeAnalysis> {
  const prompt = buildPrompt(brandName, industry, firstName, ads);
  const raw = await callClaude(prompt);
  return parseClaudeResponse(raw);
}
