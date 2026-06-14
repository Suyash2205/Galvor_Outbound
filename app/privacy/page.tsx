import { GalvorBrand } from "@/components/GalvorBrand";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Galvor Outbound",
  description: "Privacy policy for Galvor Outbound and related integrations.",
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <GalvorBrand centered href={null} />
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">Last updated: June 14, 2026</p>

        <div className="legal-body">
          <p>
            Galvor Outbound (&quot;Galvor&quot;, &quot;we&quot;, &quot;us&quot;) is an internal business tool
            used by Galvor team members to manage outbound email, lead tracking, and sales reporting.
          </p>

          <h2>Information we access</h2>
          <p>When you sign in and use this application, we may access:</p>
          <ul>
            <li>Your Google account email and name (for authentication)</li>
            <li>Gmail data needed to send outbound emails and detect replies (with your consent)</li>
            <li>Google Sheets data in spreadsheets shared with our service account</li>
            <li>LinkedIn company page analytics, if you connect a LinkedIn account with page admin access</li>
          </ul>

          <h2>How we use information</h2>
          <p>We use this information only to:</p>
          <ul>
            <li>Operate the outbound email pipeline and outreach tracker</li>
            <li>Sync lead and CRM data between approved Google Sheets</li>
            <li>Generate internal sales and marketing update reports</li>
            <li>Improve workflow for Galvor team members</li>
          </ul>

          <h2>Data sharing</h2>
          <p>
            We do not sell your personal information. Data is processed through Google, LinkedIn, and
            other service providers only as required to run this tool. Access is limited to authorized
            Galvor team members.
          </p>

          <h2>Data retention</h2>
          <p>
            Lead and activity data is stored in Google Sheets controlled by Galvor. Email content and
            analytics are retained as long as needed for business operations or until removed from those
            systems.
          </p>

          <h2>Your choices</h2>
          <p>
            You can revoke Google or LinkedIn access at any time through your account settings with those
            providers. Contact Galvor if you need data removed from our sheets or systems.
          </p>

          <h2>Contact</h2>
          <p>
            For privacy questions, contact{" "}
            <a href="mailto:hello@galvor.ai">hello@galvor.ai</a>.
          </p>
        </div>

        <Link href="/login" className="legal-back">
          ← Back to Galvor Outbound
        </Link>
      </div>
    </div>
  );
}
