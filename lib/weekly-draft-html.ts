import { escHtml } from "./email/templates";

export interface WeeklyDraftItem {
  label: string;
  text: string;
}

export interface WeeklyDraftContent {
  subject: string;
  contracting: WeeklyDraftItem[];
  demos: WeeklyDraftItem[];
  calls: WeeklyDraftItem[];
  newAccounts: WeeklyDraftItem[];
  followUps: WeeklyDraftItem[];
  outreach: WeeklyDraftItem[];
}

const BLUE = "#1155cc";

function sectionTitle(name: string, count: number, suffix = ""): string {
  const countLabel = suffix ? `${count} ${suffix}` : String(count);
  return `${name} (${countLabel})`;
}

function renderSectionHtml(title: string, items: WeeklyDraftItem[]): string {
  if (!items.length) return "";
  const bullets = items
    .map((item) => {
      const label = item.label.trim();
      const text = escHtml(item.text.trim());
      if (label) {
        return `<li><b>${escHtml(label)}</b> — ${text}</li>`;
      }
      return `<li>${text}</li>`;
    })
    .join("");
  return `<p><b>${escHtml(title)}</b></p><ul>${bullets}</ul>`;
}

function renderSectionPlain(title: string, items: WeeklyDraftItem[]): string {
  if (!items.length) return "";
  const bullets = items
    .map((item) => {
      const label = item.label.trim();
      if (label) return `• ${label} — ${item.text.trim()}`;
      return `• ${item.text.trim()}`;
    })
    .join("\n");
  return `${title}\n${bullets}`;
}

export function renderWeeklyDraftHtml(content: WeeklyDraftContent, weekLabel: string): string {
  const sections = [
    renderSectionHtml(
      sectionTitle("Contracting", content.contracting.length),
      content.contracting
    ),
    renderSectionHtml(
      sectionTitle("Demos / In Analysis", content.demos.length),
      content.demos
    ),
    renderSectionHtml(sectionTitle("Calls / Meetings", content.calls.length), content.calls),
    renderSectionHtml(
      sectionTitle("New Accounts Opened This Week", content.newAccounts.length),
      content.newAccounts
    ),
    renderSectionHtml(
      sectionTitle("Follow-ups Pending", content.followUps.length),
      content.followUps
    ),
    content.outreach.length
      ? renderSectionHtml("Outreach — Email", content.outreach)
      : `<p><b>Outreach — Email</b></p><ul><li>No major bulk email sends logged this week.</li></ul>`,
  ]
    .filter(Boolean)
    .join("");

  const linkedinPlaceholder = `<p><i>Add LinkedIn post performance table and audience stats below (API coming soon).</i></p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;width:100%;max-width:900px">
<thead>
<tr style="background-color:#cfe2f3">
<th align="left">LinkedIn Post title</th>
<th>Post type</th>
<th>Time</th>
<th>Impressions</th>
<th>Clicks</th>
<th>CTR</th>
<th>Reactions</th>
<th>Comments</th>
<th>Reposts</th>
<th>Engagement rate</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="10" style="color:#666;font-style:italic">Paste your LinkedIn analytics rows here</td>
</tr>
</tbody>
</table>
<p><b>LinkedIn Audience</b></p>
<ul><li><i>Add follower count and weekly change manually</i></li></ul>`;

  return `<div dir="ltr" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">
<p>Hi All,</p>
<p>Please find the weekly update below. Sales is current as of today; the LinkedIn analysis follows.</p>
<p><b><span style="color:${BLUE};font-size:large">Sales Update</span></b><br><span style="color:#666;font-size:13px">Week of ${escHtml(weekLabel)}</span></p>
<div dir="ltr"><hr style="border:none;border-top:1px solid ${BLUE};margin:12px 0"></div>
${sections}
<p><b><span style="color:${BLUE}">Marketing Update — LinkedIn</span></b></p>
<div dir="ltr"><hr style="border:none;border-top:1px solid ${BLUE};margin:12px 0"></div>
${linkedinPlaceholder}
<p>Please let me know if you have any questions or suggestions.<br>Thanks</p>
</div>`;
}

export function renderWeeklyDraftPlain(content: WeeklyDraftContent, weekLabel: string): string {
  const sections = [
    renderSectionPlain(
      sectionTitle("Contracting", content.contracting.length),
      content.contracting
    ),
    renderSectionPlain(
      sectionTitle("Demos / In Analysis", content.demos.length),
      content.demos
    ),
    renderSectionPlain(sectionTitle("Calls / Meetings", content.calls.length), content.calls),
    renderSectionPlain(
      sectionTitle("New Accounts Opened This Week", content.newAccounts.length),
      content.newAccounts
    ),
    renderSectionPlain(
      sectionTitle("Follow-ups Pending", content.followUps.length),
      content.followUps
    ),
    content.outreach.length
      ? renderSectionPlain("Outreach — Email", content.outreach)
      : "Outreach — Email\n• No major bulk email sends logged this week.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Hi All,

Please find the weekly update below. Sales is current as of today; the LinkedIn analysis follows.

Sales Update
Week of ${weekLabel}

${sections}

Marketing Update — LinkedIn
[Add LinkedIn stats manually — API coming soon]

Please let me know if you have any questions or suggestions.
Thanks`;
}

export function emptyWeeklyDraftContent(subject: string): WeeklyDraftContent {
  return {
    subject,
    contracting: [],
    demos: [],
    calls: [],
    newAccounts: [],
    followUps: [],
    outreach: [],
  };
}
