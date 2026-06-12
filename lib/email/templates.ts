import type { AdCluster, ClaudeAnalysis, EmailContent } from "../types";

export function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildEmail1Subject(brandName: string): string {
  return `${brandName} isn't running this. Your competitors will.`;
}

export function buildEmail2Subject(brandName: string): string {
  return `Re: ${buildEmail1Subject(brandName)}`;
}

function buildPlainTable(clusters: AdCluster[]): string {
  const cols = [
    { label: "Cluster", w: 30 },
    { label: "What it is", w: 32 },
    { label: "Ads", w: 5 },
    { label: "Avg Age", w: 9 },
    { label: "Oldest", w: 9 },
  ];
  const pad = (v: string, w: number) => String(v).substring(0, w).padEnd(w);
  const header = cols.map((c) => pad(c.label, c.w)).join("  ");
  const rule = cols.map((c) => "-".repeat(c.w)).join("  ");
  const rows = clusters.map((c) => {
    const zero = c.adCount === 0;
    const values = [
      c.name,
      c.description,
      zero ? "0" : String(c.adCount),
      zero ? "—" : `${c.avgAgeDays}d`,
      zero ? "—" : `${c.oldestDays}d`,
    ];
    return values.map((v, i) => pad(v, cols[i].w)).join("  ");
  });
  return [header, rule, ...rows].join("\n");
}

export function buildGmailHtml(params: {
  brandName: string;
  firstName: string;
  industry: string;
  closing: string;
  clusters: AdCluster[];
  insight: string;
}): string {
  const { brandName, firstName, industry, closing, clusters, insight } = params;
  const p = (content: string) =>
    `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">${content}</p>`;

  const closingLines = closing
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => escHtml(l))
    .join("<br>");

  const thStyle =
    "padding:8px 12px;background:#f2f2f2;font-weight:600;text-align:left;border:1px solid #d0d0d0;font-family:Arial,sans-serif;font-size:12px;color:#555;white-space:nowrap;";
  const tdStyle = (bold: boolean) =>
    `padding:8px 12px;border:1px solid #e0e0e0;font-family:Arial,sans-serif;font-size:13px;color:${bold ? "#111" : "#333"};vertical-align:top;line-height:1.4;${bold ? "font-weight:600;" : ""}`;

  let rows = "";
  for (const c of clusters) {
    const zero = c.adCount === 0;
    rows += `<tr>
      <td style="${tdStyle(true)}">${escHtml(c.name)}</td>
      <td style="${tdStyle(false)}">${escHtml(c.description)}</td>
      <td style="${tdStyle(false)}text-align:center;color:${zero ? "#aaa" : "#2B4EFF"};font-weight:600;">${zero ? "0" : c.adCount}</td>
      <td style="${tdStyle(false)}text-align:center;color:${zero ? "#aaa" : "#333"};">${zero ? "—" : `${c.avgAgeDays} days`}</td>
      <td style="${tdStyle(false)}text-align:center;color:${zero ? "#aaa" : "#333"};">${zero ? "—" : `${c.oldestDays} days`}</td>
    </tr>`;
  }

  const table = `<table style="border-collapse:collapse;width:100%;margin:4px 0 20px;font-family:Arial,sans-serif;">
    <thead><tr>
      <th style="${thStyle}">Cluster</th>
      <th style="${thStyle}">What it is</th>
      <th style="${thStyle}text-align:center;">Ads</th>
      <th style="${thStyle}text-align:center;">Avg Age</th>
      <th style="${thStyle}text-align:center;">Oldest</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:680px;">
    ${p(`Hey ${escHtml(firstName)},`)}
    ${p(`We map the ${escHtml(industry)} ad landscape weekly — every active format, every cluster, across the major players. ${escHtml(brandName)}'s pattern stood out.`)}
    ${p(`<em>${escHtml(insight)}</em>`)}
    ${table}
    ${p(closingLines)}
    ${p("Worth it?")}
  </div>`;
}

export function buildPlainBody(params: {
  brandName: string;
  firstName: string;
  industry: string;
  closing: string;
  clusters: AdCluster[];
  insight: string;
}): string {
  const { brandName, firstName, industry, closing, clusters, insight } = params;
  const tableText = buildPlainTable(clusters);
  return `Hey ${firstName},

We map the ${industry} ad landscape weekly — every active format, every cluster, across the major players. ${brandName}'s pattern stood out.

${insight}

${tableText}

${closing}

Worth it?`;
}

export function buildEmail2Html(followUpBody: string): string {
  const paras = followUpBody.split("\n\n").map((p) => p.trim()).filter(Boolean);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:680px;">
    ${paras
      .map((p, i) => {
        const margin = i === 0 ? "0 0 6px" : "0 0 16px";
        return `<p style="margin:${margin};font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">${escHtml(p)}</p>`;
      })
      .join("")}
  </div>`;
}

export function buildEmail1Content(
  brandName: string,
  firstName: string,
  industry: string,
  closing: string,
  analysis: ClaudeAnalysis
): EmailContent {
  return {
    subject: buildEmail1Subject(brandName),
    htmlBody: buildGmailHtml({
      brandName,
      firstName,
      industry,
      closing,
      clusters: analysis.clusters,
      insight: analysis.insight,
    }),
    plainBody: buildPlainBody({
      brandName,
      firstName,
      industry,
      closing,
      clusters: analysis.clusters,
      insight: analysis.insight,
    }),
  };
}

export function buildEmail2Content(brandName: string, analysis: ClaudeAnalysis): EmailContent {
  return {
    subject: buildEmail2Subject(brandName),
    htmlBody: buildEmail2Html(analysis.followUpBody || ""),
    plainBody: analysis.followUpBody || "",
  };
}

export function buildPlaceholderEmail(stage: number, companyName: string, firstName: string): EmailContent {
  return {
    subject: `Following up — ${companyName}`,
    htmlBody: `<p>Hi ${escHtml(firstName)},</p><p><em>Email ${stage} template coming soon.</em></p>`,
    plainBody: `Hi ${firstName},\n\nEmail ${stage} template coming soon.`,
  };
}
