import type { ClaudeAnalysis } from "./types";
import type { ProcessedAd as Ad } from "./apify";
import {
  emptyWeeklyDraftContent,
  renderWeeklyDraftHtml,
  renderWeeklyDraftPlain,
  type WeeklyDraftContent,
  type WeeklyDraftItem,
} from "./weekly-draft-html";

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

export async function callClaude(
  prompt: string,
  options?: { max_tokens?: number }
): Promise<string> {
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
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: options?.max_tokens ?? 1500,
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
  const text = json.content?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Claude returned an empty response. Please try again.");
  }
  return text;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function parseClaudeJson<T>(raw: string, label: string): T {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    throw new Error(`Unexpected response from Claude while ${label}. Please try again.`);
  }
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error(`Could not parse Claude response while ${label}. Please try again.`);
  }
}

export function parseClaudeResponse(raw: string): ClaudeAnalysis {
  const result = parseClaudeJson<ClaudeAnalysis>(raw, "parsing analysis");
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

export function buildImportEmail1Prompt(
  brandName: string,
  industry: string,
  firstName: string,
  email1Body: string
): string {
  return `You are a sharp ad intelligence analyst at Galvor, a performance marketing agency.

A salesperson already sent Email 1 to ${firstName} at ${brandName} (${industry}) using our outbound playbook — but we no longer have the structured analysis cache. Your job is to reconstruct it from the sent email text so follow-up emails can be generated WITHOUT re-scraping the Meta Ad Library.

EMAIL 1 THAT WAS ALREADY SENT:
---
${email1Body.trim()}
---

TASK 1 — Extract the ad clusters from the email table/content. Reconstruct 4–7 clusters with: name (max 3 words), description (1 line), adCount, avgAgeDays, oldestDays. Use the numbers and labels from the email when present; infer reasonably when the table is partial.

TASK 2 — Extract or reconstruct the 2-sentence insight about ${brandName}'s ad mix (under 40 words total). Use "${brandName}" — never placeholders.

TASK 3 — Write the follow-up email body (Email 2) that pairs with this Email 1. Sent 3 days later with no reply. Follow this EXACT structure — blocks separated by blank lines:

Block 1 — "Hi ${firstName},"

Block 2 — The data hook (2 sentences MAX):
  Sentence 1: "Pulled ${brandName}'s ad library." then state ONE specific ratio or count from the clusters.
  Sentence 2: Combine the competitive gap AND the missing piece into one punchy sentence.

Block 3 — Cost + offer (2 sentences): "That gap has a measurable RoAS cost. We can quantify it for ${brandName} specifically — 20 minutes, no deck."

Block 4 — CTA (standalone line): "Worth a call this week?"

Rules for followUpBody:
- Use REAL numbers from the cluster data
- Use "${brandName}" — no placeholders
- Do NOT reference the first email or say "I sent you something"
- Tone: sharp, data-first, no fluff

Respond ONLY with valid JSON — no markdown, no explanation:
{"clusters":[{"name":"...","description":"...","adCount":0,"avgAgeDays":0,"oldestDays":0}],"insight":"...","followUpBody":"..."}`;
}

export async function generateAnalysisFromEmail1(
  brandName: string,
  industry: string,
  firstName: string,
  email1Body: string
): Promise<ClaudeAnalysis> {
  const trimmed = email1Body.trim();
  if (!trimmed) throw new Error("Email 1 body is empty.");

  const prompt = buildImportEmail1Prompt(brandName, industry, firstName, trimmed);
  const raw = await callClaude(prompt);
  const result = parseClaudeResponse(raw);
  if (!result.followUpBody?.trim()) {
    throw new Error("Could not generate follow-up body from Email 1. Try again with the full sent email.");
  }
  return result;
}

export async function polishActivityComment(
  brand: string,
  category: string,
  comments: string
): Promise<string> {
  const trimmed = comments.trim();
  if (!trimmed) throw new Error("Comments are empty.");

  const prompt = `You polish short sales activity notes for Galvor's weekly update email.

Brand: ${brand}
Category: ${category}
Raw notes:
---
${trimmed}
---

Rewrite as ONE concise bullet suitable for a weekly sales update email (like "Foxtale — intro made on 10/6; phone call on 11/6. Awaiting meeting confirmation for next week.").

Rules:
- Keep all factual dates, names, and outcomes from the raw notes
- Do not invent details
- Start with the brand name followed by an em dash
- Max 2 sentences
- Plain text only — no markdown

Return ONLY the polished bullet text.`;

  const raw = await callClaude(prompt);
  const polished = raw.trim().replace(/^[-•*]\s*/, "");
  if (!polished) throw new Error("Could not polish comment.");
  return polished;
}

export async function generateWeeklyDraft(
  activities: {
    category: string;
    brand: string;
    comments: string;
    polishedComment: string;
    activityDate: string;
  }[],
  weekLabel: string
): Promise<{ subject: string; htmlBody: string; plainBody: string }> {
  const subject = `Sales Update — Week of ${weekLabel}`;

  const buildDraft = (content: WeeklyDraftContent) => ({
    subject: content.subject || subject,
    htmlBody: renderWeeklyDraftHtml(content, weekLabel),
    plainBody: renderWeeklyDraftPlain(content, weekLabel),
  });

  if (!activities.length) {
    return buildDraft({ ...emptyWeeklyDraftContent(subject), subject });
  }

  const grouped = {
    Contracting: [] as string[],
    Demo: [] as string[],
    Call: [] as string[],
    "New account": [] as string[],
    "Follow-up": [] as string[],
  };

  for (const a of activities) {
    const text = (a.polishedComment || a.comments).trim();
    if (!text) continue;
    const key = a.category as keyof typeof grouped;
    if (grouped[key]) grouped[key].push(`${a.brand} — ${text}`);
  }

  const activitySummary = Object.entries(grouped)
    .map(([cat, items]) => `${cat} (${items.length}):\n${items.map((i) => `- ${i}`).join("\n") || "- (none)"}`)
    .join("\n\n");

  const prompt = `You write Galvor's weekly Sales & Marketing Update email for internal stakeholders (Sunil / Kuljit style).

Week: ${weekLabel}

Logged activities this week:
${activitySummary}

Return structured content for an HTML email. Each item has:
- "label": brand or contact (e.g. "Angel One", "Foxtale (Deepti)", "21 contacts / 7 accounts", or "" for plain bullets)
- "text": the update sentence(s) WITHOUT repeating the label

Group activities into these arrays (use empty arrays if none):
- contracting
- demos (from Demo category)
- calls (from Call category)
- newAccounts (from New account category)
- followUps (from Follow-up category)
- outreach: 1–3 bullets summarising email outreach this week; mention brands contacted. If none, use one item with label "" and text "No major bulk email sends logged this week."

Rules:
- Use only facts from the logged activities; do not invent meetings or outcomes
- Dates as D/M or DD/MM (e.g. 11/6, 18/6)
- Merge multiple logs for the same brand into one item where sensible
- Professional B2B agency tone
- Escape double quotes in JSON strings

Respond with ONLY valid JSON:
{"subject":"Sales Update — Week of ...","contracting":[{"label":"...","text":"..."}],"demos":[],"calls":[],"newAccounts":[],"followUps":[],"outreach":[]}`;

  const raw = await callClaude(prompt, { max_tokens: 4096 });

  let parsed: WeeklyDraftContent;
  try {
    const result = parseClaudeJson<WeeklyDraftContent>(raw, "generating weekly draft");
    parsed = normalizeWeeklyDraftContent(result, subject);
  } catch {
    throw new Error("Could not parse weekly draft. Please try again.");
  }

  return buildDraft(parsed);
}

function asItems(value: unknown): WeeklyDraftItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { label?: string; text?: string };
      const text = row.text?.trim();
      if (!text) return null;
      return { label: row.label?.trim() || "", text };
    })
    .filter((item): item is WeeklyDraftItem => item !== null);
}

function normalizeWeeklyDraftContent(raw: WeeklyDraftContent, fallbackSubject: string): WeeklyDraftContent {
  return {
    subject: raw.subject?.trim() || fallbackSubject,
    contracting: asItems(raw.contracting),
    demos: asItems(raw.demos),
    calls: asItems(raw.calls),
    newAccounts: asItems(raw.newAccounts),
    followUps: asItems(raw.followUps),
    outreach: asItems(raw.outreach),
  };
}
