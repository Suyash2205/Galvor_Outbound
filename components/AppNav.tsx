import Link from "next/link";

export function AppNav({ active }: { active: "pipeline" | "outreach" | "tracker" }) {
  return (
    <nav className="app-nav" aria-label="Main">
      <Link
        href="/dashboard"
        className={`app-nav__link${active === "pipeline" ? " app-nav__link--active" : ""}`}
      >
        Pipeline
      </Link>
      <Link
        href="/outreach"
        className={`app-nav__link${active === "outreach" ? " app-nav__link--active" : ""}`}
      >
        Outreach
      </Link>
      <Link
        href="/tracker"
        className={`app-nav__link${active === "tracker" ? " app-nav__link--active" : ""}`}
      >
        Tracker
      </Link>
    </nav>
  );
}
