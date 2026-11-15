"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getUser, getToken, saveLogin } from "@/lib/api";
import { Loading } from "@/components/ui";
import Business from "@/components/watch/Business";
import Personal from "@/components/watch/Personal";

export default function MyMedicines() {
  const [user, setUser] = useState<any>(undefined);
  useEffect(() => { setUser(getUser()); }, []);

  // keep the saved login in step with the account type from the server (menu label uses it)
  function sync(s: any) {
    const u = getUser(), t = getToken();
    if (u && t && s?.account_type && u.account_type !== s.account_type) {
      const nu = { ...u, account_type: s.account_type };
      saveLogin(t, nu); setUser(nu);
    }
  }

  if (user === undefined) return <Loading />;
  if (!user) return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <h1 className="h-display text-4xl md:text-5xl">Save your medicines</h1>
      <p className="mt-3 text-muted">Create a free account to save the batches you hold. We check them against every new government list and email you if one fails.</p>
      <Link href="/welcome?next=/watchlist" className="btn mt-6 hover:no-underline">Log in or create a free account</Link>
    </div>
  );
  return user.account_type === "personal" ? <Personal user={user} onSettings={sync} /> : <Business user={user} onSettings={sync} />;
}
