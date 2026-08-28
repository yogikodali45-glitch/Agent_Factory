"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthHeader } from "@/components/AuthHeader";

interface AgentSummary {
  id: string;
  status: string;
  objectives: string[];
  created_at: string;
}

export default function Home() {
  const { user, accessToken, loading, signInWithEmail, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/agents", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => res.json())
      .then((data) => setAgents(data.agents ?? []));
  }, [accessToken]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSignInError(null);
    const { error } = await signInWithEmail(email);
    if (error) setSignInError(error.message);
    else setLinkSent(true);
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-black" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
        <main className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Agent Factory</h1>
          {linkSent ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Check your email for a sign-in link.
            </p>
          ) : (
            <form onSubmit={handleSignIn} className="flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className="rounded-md border border-zinc-300 bg-white p-2.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                Send sign-in link
              </button>
              {signInError && <p className="text-sm text-red-600">{signInError}</p>}
            </form>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <AuthHeader user={user} onSignOut={signOut} />
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
