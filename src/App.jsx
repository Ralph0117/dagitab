import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import PortfolioApp from "./PortfolioApp";

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let alive = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      const u = data?.session?.user ?? null;
      if (!alive) return;
      setUser(u);
      setBooting(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      // ✅ Do NOT force navigation on token refresh
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (booting) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
        </div>
        <div className="white-surface">
          <div className="subtle">Loading…</div>
        </div>
      </div>
    );
  }

  return <PortfolioApp user={user} />;
}
