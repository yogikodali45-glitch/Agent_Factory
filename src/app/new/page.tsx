"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthHeader } from "@/components/AuthHeader";

type ViewState =
  | { step: "form" }
  | { step: "clarifying"; questions: string[]; answers: string[] }
  | { step: "error"; message: string };

export default function NewAgent() {
  const { user, accessToken, loading, signOut } = useAuth();
  const router = useRouter();
  const [requestText, setRequestText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<ViewState>({ step: "form" });

  async function submitIntake(body: Record<string, unknown>) {
    if (!accessToken) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.error) {
        setView({ step: "error", message: data.error });
        return;
      }
      if (data.status === "needs_clarification") {
        setView({
          step: "clarifying",
          questions: data.questions,
          answers: data.questions.map(() => ""),
        });
        return;
      }
      router.push(`/agents/${data.agent_id}`);
    } catch (e) {
      setView({ step: "error", message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestText.trim()) return;
    submitIntake({ agent_type: "chat", request: requestText });
  }

  function handleClarificationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (view.step !== "clarifying") return;
    submitIntake({
      agent_type: "chat",
      request: requestText,
      previous_questions: view.questions,
      answers: view.answers,
    });
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-black" />;
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/" className="underline">
            Sign in
          </Link>{" "}
          to create an agent.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <AuthHeader user={user} onSignOut={signOut} />
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Describe your agent</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Plain language is fine — we&apos;ll ask if anything&apos;s missing.
          </p>
        </div>

        {view.step === "form" && (
          <form onSubmit={handleInitialSubmit} className="flex flex-col gap-4">
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={6}
              placeholder="e.g. I run a hair salon and want a chat agent that answers questions from our FAQ page (mysalon.com/faq) and lets customers book appointments. Escalate anything about refunds to a human."
              className="rounded-md border border-zinc-300 bg-white p-3 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={submitting || !requestText.trim()}
              className="self-start rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {submitting ? "Thinking..." : "Submit request"}
            </button>
          </form>
        )}

        {view.step === "clarifying" && (
          <form onSubmit={handleClarificationSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A few things I couldn&apos;t figure out on my own:
            </p>
            {view.questions.map((q, i) => (
              <label key={i} className="flex flex-col gap-1 text-sm">
                <span className="text-black dark:text-zinc-50">{q}</span>
                <input
                  value={view.answers[i]}
                  onChange={(e) => {
                    const next = [...view.answers];
                    next[i] = e.target.value;
                    setView({ ...view, answers: next });
                  }}
                  className="rounded-md border border-zinc-300 bg-white p-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
            ))}
            <button
              type="submit"
              disabled={submitting || view.answers.some((a) => !a.trim())}
              className="self-start rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {submitting ? "Thinking..." : "Continue"}
            </button>
          </form>
        )}

        {view.step === "error" && (
          <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {view.message}
          </p>
        )}
      </main>
    </div>
  );
}
