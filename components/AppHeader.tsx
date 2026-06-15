"use client";

import { GalvorBrand } from "@/components/GalvorBrand";
import { AppNav } from "@/components/AppNav";
import { signOut, useSession } from "next-auth/react";

interface AppHeaderProps {
  active: "pipeline" | "outreach" | "tracker";
  actions?: React.ReactNode;
}

export function AppHeader({ active, actions }: AppHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="app-header">
      <div className="app-header__start">
        <GalvorBrand href="/dashboard" />
        <AppNav active={active} />
      </div>
      <div className="app-header__end">
        {actions && <div className="app-header__actions">{actions}</div>}
        <div className="app-header__user">
          {session?.user?.email && (
            <span className="app-header__email">{session.user.email}</span>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
