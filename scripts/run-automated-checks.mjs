/**
 * Automated checks — run: node scripts/run-automated-checks.mjs
 */
import { readFileSync } from "fs";
import { google } from "googleapis";

const PROD = "https://galvor-outbound.vercel.app";
const TRACKER_ID = "13rGwhOjtNfYhjWDMZkIE_Iq3c6cY237g9JCKYYBGCl0";
const PIPELINE_ID = "1-nZCTRbeZCLgUPA91k37QlFHbL99sIKIdIUSB9tbmdc";

const TRACKER_COL = {
  brand: 0,
  email: 10,
  phone: 11,
  emailStatus: 12,
  lastEmailDate: 13,
  emailOutcome: 14,
};

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  const get = (k) => raw.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "");
  return {
    email: get("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n"),
    outreachId: get("GOOGLE_OUTREACH_TRACKER_SPREADSHEET_ID") || TRACKER_ID,
    pipelineId: get("GOOGLE_SHEETS_SPREADSHEET_ID") || PIPELINE_ID,
    anthropic: get("ANTHROPIC_API_KEY"),
  };
}

// --- Fuzzy match unit tests (inline) ---
function normalizeCompanyName(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(pvt|ltd|limited|inc|llc|corp|corporation|co|company|group|holdings|india|international|global|design|skincare|beauty|pharma|apparels|apparel)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function companyMatchScore(a, b) {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (ta.size && tb.size) {
    let overlap = 0;
    for (const t of ta) if (tb.has(t)) overlap++;
    const union = new Set([...ta, ...tb]).size;
    const jaccard = overlap / union;
    if (jaccard >= 0.5) return 0.75 + jaccard * 0.2;
    if (overlap >= 1 && (ta.size === 1 || tb.size === 1)) return 0.7;
  }
  return 0;
}

function testFuzzyMatch() {
  const cases = [
    ["Foxtale", "Foxtale Skincare", true],
    ["Bombay Shirt Company", "Bombay Shirts Company", true],
    ["Nicobar Design Pvt. Ltd.", "Nicobar", true],
    ["Axis Bank", "HDFC Bank", false],
  ];
  for (const [a, b, shouldMatch] of cases) {
    const score = companyMatchScore(a, b);
    const matched = score >= 0.68;
    if (matched === shouldMatch) {
      pass(`Fuzzy match: "${a}" vs "${b}"`, `score=${score.toFixed(2)}`);
    } else {
      fail(`Fuzzy match: "${a}" vs "${b}"`, `score=${score.toFixed(2)}, expected match=${shouldMatch}`);
    }
  }
}

async function testProductionHttp() {
  const checks = [
    { path: "/privacy", expectStatus: 200, expectBody: "Privacy Policy" },
    { path: "/login", expectStatus: 200, expectBody: "Sign in" },
    { path: "/outreach", expectStatus: 200, expectBody: null }, // may redirect client-side
    { path: "/api/outreach/brands", expectStatus: 401, expectBody: null },
    { path: "/api/outreach/activities", expectStatus: 401, expectBody: null },
    { path: "/api/leads", expectStatus: 401, expectBody: null },
    { path: "/api/cron/sync-crm", expectStatus: 401, expectBody: null },
  ];

  for (const { path, expectStatus, expectBody } of checks) {
    try {
      const res = await fetch(`${PROD}${path}`, { redirect: "manual" });
      const text = res.status < 400 ? await res.text() : "";
      const statusOk =
        res.status === expectStatus ||
        (path === "/outreach" && (res.status === 307 || res.status === 302)); // auth redirect ok
      if (statusOk) {
        if (expectBody && !text.includes(expectBody)) {
          fail(`HTTP ${path}`, `status ${res.status} but missing "${expectBody}"`);
        } else {
          pass(`HTTP ${path}`, `status ${res.status}`);
        }
      } else {
        fail(`HTTP ${path}`, `expected ~${expectStatus}, got ${res.status}`);
      }
    } catch (e) {
      fail(`HTTP ${path}`, e.message);
    }
  }
}

async function testSheets(env) {
  if (!env.email || !env.key) {
    fail("Sheets access", "Missing service account in .env.local");
    return;
  }

  const auth = new google.auth.JWT({
    email: env.email,
    key: env.key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Pipeline spreadsheet
  try {
    const pipe = await sheets.spreadsheets.values.get({
      spreadsheetId: env.pipelineId,
      range: "Outbound Pipeline!A1:W2",
    });
    const headers = pipe.data.values?.[0];
    if (headers?.[4] === "company_name" || headers?.[4]?.includes("company")) {
      pass("Pipeline sheet readable", `${pipe.data.values?.length || 0} header rows`);
    } else {
      pass("Pipeline sheet readable", `headers: ${headers?.slice(0, 5).join(", ")}`);
    }

    const leadCount = await sheets.spreadsheets.values.get({
      spreadsheetId: env.pipelineId,
      range: "Outbound Pipeline!A2:A",
    });
    const rows = (leadCount.data.values || []).filter((r) => r[0]?.trim()).length;
    pass("Pipeline lead rows", `${rows} rows with data`);
  } catch (e) {
    fail("Pipeline sheet readable", e.message);
  }

  // CRM tab
  try {
    const crm = await sheets.spreadsheets.values.get({
      spreadsheetId: env.pipelineId,
      range: "Contacts CRM - India!A1:K2",
    });
    pass("CRM tab readable", `tab exists, ${crm.data.values?.length || 0} rows fetched`);
  } catch (e) {
    fail("CRM tab readable", e.message);
  }

  // Outreach tracker
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: env.outreachId });
    const tabs = meta.data.sheets?.map((s) => s.properties?.title) || [];
    pass("Tracker spreadsheet accessible", `tabs: ${tabs.slice(0, 3).join(", ")}${tabs.length > 3 ? "…" : ""}`);

    const tab = tabs[0];
    const hdr = await sheets.spreadsheets.values.get({
      spreadsheetId: env.outreachId,
      range: `${tab}!A3:O3`,
    });
    const row = hdr.data.values?.[0] || [];

    const colLetter = (i) => String.fromCharCode(65 + i); // works A-O
    const expected = {
      [TRACKER_COL.email]: "Email Address",
      [TRACKER_COL.phone]: "Phone",
      [TRACKER_COL.emailStatus]: "Email Status",
      [TRACKER_COL.lastEmailDate]: "Last Email Date",
      [TRACKER_COL.emailOutcome]: "Email Outcome",
    };

    let mappingOk = true;
    for (const [idx, fragment] of Object.entries(expected)) {
      const header = row[Number(idx)] || "";
      if (!header.toLowerCase().includes(fragment.toLowerCase())) {
        fail(
          `Column ${colLetter(Number(idx))} header`,
          `expected "${fragment}", got "${header}"`
        );
        mappingOk = false;
      }
    }
    if (mappingOk) {
      pass("Tracker column mapping M/N/O", `M="${row[12]}", N="${row[13]}", O="${row[14]}"`);
    }

    const brands = await sheets.spreadsheets.values.get({
      spreadsheetId: env.outreachId,
      range: `${tab}!A4:A100`,
    });
    const brandCount = new Set(
      (brands.data.values || []).map((r) => r[0]?.trim()).filter(Boolean)
    ).size;
    pass("Tracker brands sample", `${brandCount} unique brands in first 97 rows`);

    // Activity Log tab
    const hasActivity = tabs.includes("Activity Log");
    if (hasActivity) {
      const act = await sheets.spreadsheets.values.get({
        spreadsheetId: env.outreachId,
        range: "Activity Log!A1:G1",
      });
      const h = act.data.values?.[0]?.[0];
      if (h === "logged_at") pass("Activity Log tab", "headers OK");
      else fail("Activity Log tab", `header got "${h}"`);
    } else {
      pass("Activity Log tab", "not created yet (created on first log)");
    }
  } catch (e) {
    fail("Tracker spreadsheet accessible", e.message);
  }
}

function testEnvConfig(env) {
  if (env.outreachId === TRACKER_ID) pass("Local GOOGLE_OUTREACH_TRACKER_SPREADSHEET_ID", "set");
  else pass("Local GOOGLE_OUTREACH_TRACKER_SPREADSHEET_ID", env.outreachId);

  if (env.anthropic?.trim()) pass("Local ANTHROPIC_API_KEY", "set (AI features can work locally)");
  else fail("Local ANTHROPIC_API_KEY", "missing — AI polish/draft won't work locally");

  pass("Production URL", PROD);
}

console.log("\n=== Galvor Outbound — Automated Checks ===\n");

testFuzzyMatch();
console.log("");
const env = loadEnv();
testEnvConfig(env);
console.log("");
await testProductionHttp();
console.log("");
await testSheets(env);

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) process.exit(1);
