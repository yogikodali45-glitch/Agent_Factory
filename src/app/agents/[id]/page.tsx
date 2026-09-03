"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";

interface CheckResult {
  check_type: "success_criteria" | "baseline_adversarial";
  description: string;
  test_input: string;
  agent_response: string;
  passed: boolean;
  reasoning: string;
}

interface AgentDetail {
  id: string;
  status: string;
  spec: { objectives: string[] };
  build: { system_prompt: string; selected_tools: string[] } | null;
  deploy: { channels: string[]; is_live: boolean } | null;
  latestTestRun: { attempt_number: number; passed: boolean } | null;
  testChecks: CheckResult[];
}

interface Booking {
  id: string;
  customer_name: string | null;
  customer_contact: string | null;
  requested_time: string;
  details: string;
  created_at: string;
}
interface Feedback {
  id: string;
  comment: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  created_at: string;
}
interface Escalation {
  id: string;
  reason: string;
  customer_contact: string | null;
  created_at: string;
}
interface Activity {
  bookings: Booking[];
  feedback: Feedback[];
  escalations: Escalation[];
}

// The stage each status still needs run, and the human-facing label
// while it's running. Nothing after Test requires a click -- Deploy's
// provisioning step (getting to ready_to_try) is plumbing, same as
// Build/Assemble/Test; only "go live" is a real decision (PRD: the
// business owner never sees the pipeline underneath).
const AUTO_CHAIN: Record<string, { url: string; label: string }> = {
  spec_ready: { url: "/api/build", label: "Building your agent..." },
  built: { url: "/api/assemble", label: "Adding your knowledge..." },
  assembled: { url: "/api/test", label: "Testing your agent..." },
  tested: { url: "/api/deploy", label: "Getting ready to try..." },
};

// Sign-in is temporarily bypassed for early testing -- see page.tsx for
// why. accessToken is attached when a real session happens to exist,
// otherwise every call goes through as the shared anonymous account.
export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken, loading: authLoading } = useAuth();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/agents/${id}/activity`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      if (!data.error) setActivity(data);
    } finally {
      setActivityLoading(false);
    }
  }, [id, accessToken]);

  const fetchAgent = useCallback(async (): Promise<AgentDetail | null> => {
    const res = await fetch(`/api/agents/${id}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    const data = await res.json();
    if (data.error) {
      setErrorMsg(data.error);
      return null;
    }
    setAgent(data);
    return data;
  }, [id, accessToken]);

  useEffect(() => {
    if (authLoading || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      let current = await fetchAgent();
      while (!cancelled && current && AUTO_CHAIN[current.status]) {
        const stage = AUTO_CHAIN[current.status];
        setProgressLabel(stage.label);
        const res = await fetch(stage.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ agent_id: id }),
        });
        const data = await res.json();
        if (!cancelled && data.error) {
          setErrorMsg(data.error);
          setProgressLabel(null);
          return;
        }
        if (cancelled) return;
        current = await fetchAgent();
      }
      if (!cancelled) setProgressLabel(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, id, fetchAgent, accessToken]);

  const canTry = agent?.status === "ready_to_try" || agent?.status === "deployed";
  useEffect(() => {
    if (!canTry) return;
    (async () => {
      await fetchActivity();
    })();
    // Only re-run when it *becomes* tryable, not on every unrelated
    // re-render -- fetchActivity itself is stable per accessToken/id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTry]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput("");
    setChatSending(true);
    const nextMessages = [...chatMessages, { role: "user" as const, content: text }];
    setChatMessages(nextMessages);
    try {
      const res = await fetch(`/api/chat/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: chatMessages }),
      });
      const data = await res.json();
      setChatMessages([...nextMessages, { role: "assistant", content: data.reply ?? `Error: ${data.error}` }]);
    } finally {
      setChatSending(false);
    }
  }

  async function goLive() {
    setPromoting(true);
    try {
      await fetch("/api/deploy/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ agent_id: id }),
      });
      await fetchAgent();
    } finally {
      setPromoting(false);
    }
  }

  if (authLoading) return <div className="min-h-screen bg-zinc-50 dark:bg-black" />;

  const embedSnippet = canTry
    ? `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/widget/${id}" async></script>`
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <Link href="/" className="text-sm text-zinc-500 underline">
          ← Your agents
        </Link>

        {errorMsg && (
          <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {errorMsg}
          </p>
        )}

        {progressLabel && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-black dark:bg-white" />
            {progressLabel}
          </div>
        )}

        {agent && (
          <>
            <div>
              <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
                {agent.spec.objectives?.[0] || "Your agent"}
              </h1>
              <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{agent.status}</p>
            </div>

            {agent.status === "needs_review" && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                This agent needs a human look before it can go further — it didn&apos;t pass every check after
                a few attempts. See the transcript below for what didn&apos;t pass.
              </p>
            )}

            {agent.latestTestRun && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-black dark:text-zinc-50">
                  Test results ({agent.testChecks.filter((c) => c.passed).length}/{agent.testChecks.length}{" "}
                  passed, attempt {agent.latestTestRun.attempt_number})
                </h2>
                <ul className="flex flex-col gap-2">
                  {agent.testChecks.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-black dark:text-zinc-50">{c.description}</span>
                        <span
                          className={
                            c.passed
                              ? "shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300"
                              : "shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300"
                          }
                        >
                          {c.passed ? "PASS" : "FAIL"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">Q: {c.test_input}</p>
                      <p className="mt-1 text-xs text-zinc-500">A: {c.agent_response}</p>
                      <p className="mt-1 text-xs italic text-zinc-400">{c.reasoning}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canTry && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-black dark:text-zinc-50">Try it yourself</h2>
                <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                    {chatMessages.map((m, i) => (
                      <div
                        key={i}
                        className={
                          m.role === "user"
                            ? "ml-auto max-w-[80%] rounded-lg bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
                            : "mr-auto max-w-[80%] rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50"
                        }
                      >
                        {m.content}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={sendChat} className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 rounded-md border border-zinc-300 p-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                    <button
                      type="submit"
                      disabled={chatSending || !chatInput.trim()}
                      className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            )}

            {agent.status === "ready_to_try" && (
              <button
                onClick={goLive}
                disabled={promoting}
                className="self-start rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {promoting ? "Going live..." : "Go live"}
              </button>
            )}

            {agent.status === "deployed" && embedSnippet && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-black dark:text-zinc-50">
                  Live — embed on your site
                </h2>
                <pre className="overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
                  {embedSnippet}
                </pre>
              </div>
            )}

            {canTry && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Customer activity</h2>
                  <button
                    onClick={fetchActivity}
                    disabled={activityLoading}
                    className="text-xs text-zinc-500 underline disabled:opacity-50"
                  >
                    {activityLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {activity &&
                activity.bookings.length === 0 &&
                activity.feedback.length === 0 &&
                activity.escalations.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No customer activity yet — it&apos;ll show up here once people start chatting with your agent.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {activity && activity.escalations.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                          Needs a human ({activity.escalations.length})
                        </h3>
                        <ul className="flex flex-col gap-2">
                          {activity.escalations.map((e) => (
                            <li
                              key={e.id}
                              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950"
                            >
                              <p className="text-black dark:text-zinc-50">{e.reason}</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {e.customer_contact ? `Contact: ${e.customer_contact} · ` : ""}
                                {new Date(e.created_at).toLocaleString()}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity && activity.bookings.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Booking requests ({activity.bookings.length})
                        </h3>
                        <ul className="flex flex-col gap-2">
                          {activity.bookings.map((b) => (
                            <li
                              key={b.id}
                              className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                            >
                              <p className="text-black dark:text-zinc-50">{b.details}</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                Requested: {b.requested_time}
                                {b.customer_name ? ` · ${b.customer_name}` : ""}
                                {b.customer_contact ? ` · ${b.customer_contact}` : ""}
                              </p>
                              <p className="mt-1 text-xs text-zinc-400">{new Date(b.created_at).toLocaleString()}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity && activity.feedback.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Feedback ({activity.feedback.length})
                        </h3>
                        <ul className="flex flex-col gap-2">
                          {activity.feedback.map((f) => (
                            <li
                              key={f.id}
                              className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-black dark:text-zinc-50">{f.comment}</span>
                                {f.sentiment && (
                                  <span
                                    className={
                                      f.sentiment === "positive"
                                        ? "shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300"
                                        : f.sentiment === "negative"
                                          ? "shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300"
                                          : "shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                    }
                                  >
                                    {f.sentiment.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-zinc-400">{new Date(f.created_at).toLocaleString()}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
