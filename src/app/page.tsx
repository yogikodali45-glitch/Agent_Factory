"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";

interface AgentSummary {
  id: string;
  status: string;
  objectives: string[];
  created_at: string;
}

// Sign-in is temporarily bypassed for early testing (Supabase's
// free-tier email rate limit made magic-link sign-in a real point of
// friction). Backend routes fall back to one shared anonymous account
// (src/lib/auth/getUserOrAnonymous) instead of rejecting unauthenticated
// requests. useAuth/signInWithEmail still work if a real session exists
// -- accessToken just gets attached when present -- but nothing in this
// page requires one anymore.
export default function Home() {
  const { accessToken, loading } = useAuth();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);

  useEffect(() => {
    if (loading) return;
    fetch("/api/agents", {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((res) => res.json())
      .then((data) => setAgents(data.agents ?? []));
  }, [accessToken, loading]);

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-black" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="text-sm font-semibold text-black dark:text-zinc-50">Agent Factory</h1>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Your agents</h1>
          <Link
            href="/new"
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            New agent
          </Link>
        </div>
        {agents === null ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-zinc-500">No agents yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/agents/${a.id}`}
                  className="block rounded-md border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-black dark:text-zinc-50">
                      {a.objectives[0] || "Untitled agent"}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-zinc-500">{a.status}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
