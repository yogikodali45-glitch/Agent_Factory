"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

type ViewState =
  | { step: "form" }
  | { step: "clarifying"; questions: string[]; answers: string[] }
  | { step: "error"; message: string };

const AGENT_TYPES = [
  {
    id: "chat" as const,
    label: "Chat",
    description: "A text widget for your website",
    placeholder:
      "e.g. I run a hair salon and want a chat agent that answers questions from our FAQ page (mysalon.com/faq) and lets customers book appointments. Escalate anything about refunds to a human.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5H9l-4 3.5v-3.5H5.5C4.67 16.5 4 15.83 4 15V5.5Z" />
      </svg>
    ),
  },
  {
    id: "voice" as const,
    label: "Voice",
    description: "Talks with customers over the phone",
    placeholder:
      "e.g. I run a hair salon and want a voice agent that answers calls, tells customers our hours, and lets them book appointments. Escalate anything about refunds to a human.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 3h3l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v3c0 1.1-.9 2-2 2A16 16 0 0 1 4.5 5c0-1.1.9-2 2-2Z" />
      </svg>
    ),
  },
];

// Sign-in is temporarily bypassed for early testing -- see page.tsx for
// why. accessToken is attached when a real session happens to exist,
// otherwise the request goes through as the shared anonymous account.
export default function NewAgent() {
  const { accessToken, loading } = useAuth();
  const router = useRouter();
  const [requestText, setRequestText] = useState("");
  const [agentType, setAgentType] = useState<(typeof AGENT_TYPES)[number]["id"]>("chat");
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<ViewState>({ step: "form" });

  async function submitIntake(body: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
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
    submitIntake({ agent_type: agentType, request: requestText });
  }

  function handleClarificationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (view.step !== "clarifying") return;
    submitIntake({
      agent_type: agentType,
      request: requestText,
      previous_questions: view.questions,
      answers: view.answers,
    });
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-black" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <Link href="/" className="text-sm text-zinc-500 underline">
          ← Your agents
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Describe your agent</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Plain language is fine — we&apos;ll ask if anything&apos;s missing.
          </p>
        </div>

        {view.step === "form" && (
          <form onSubmit={handleInitialSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                What kind of agent?
              </span>
              <div className="grid grid-cols-2 gap-3">
                {AGENT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAgentType(t.id)}
                    aria-pressed={agentType === t.id}
                    className={
                      agentType === t.id
                        ? "rounded-md border border-black bg-white p-3 text-left dark:border-white dark:bg-zinc-900"
                        : "rounded-md border border-zinc-200 bg-white p-3 text-left dark:border-zinc-800 dark:bg-zinc-900"
                    }
                  >
                    <span className="text-black dark:text-zinc-50">{t.icon}</span>
                    <div className="mt-2 text-sm font-semibold text-black dark:text-zinc-50">{t.label}</div>
                    <div className="mt-0.5 text-sm text-zinc-500">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={6}
              placeholder={AGENT_TYPES.find((t) => t.id === agentType)?.placeholder}
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
