"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthHeader } from "@/components/AuthHeader";

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

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, accessToken, loading: authLoading, signOut } = useAuth();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const fetchAgent = useCallback(
    async (token: string): Promise<AgentDetail | null> => {
      const res = await fetch(`/api/agents/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) {
        setErrorMsg(data.error);
        return null;
      }
      setAgent(data);
      return data;
    },
    [id]
  );

  useEffect(() => {
    if (!accessToken || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      let current = await fetchAgent(accessToken);
      while (!cancelled && current && AUTO_CHAIN[current.status]) {
        const stage = AUTO_CHAIN[current.status];
        setProgressLabel(stage.label);
        const res = await fetch(stage.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ agent_id: id }),
        });
        const data = await res.json();
        if (!cancelled && data.error) {
          setErrorMsg(data.error);
          setProgressLabel(null);
          return;
        }
        if (cancelled) return;
        current = await fetchAgent(accessToken);
      }
      if (!cancelled) setProgressLabel(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, id, fetchAgent]);

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
    if (!accessToken) return;
    setPromoting(true);
    try {
      await fetch("/api/deploy/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ agent_id: id }),
      });
      await fetchAgent(accessToken);
    } finally {
      setPromoting(false);
    }
  }

  if (authLoading) return <div className="min-h-screen bg-zinc-50 dark:bg-black" />;
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/" className="underline">
            Sign in
          </Link>{" "}
          to view this agent.
        </p>
      </div>
    );
  }

  const canTry = agent && (agent.status === "ready_to_try" || agent.status === "deployed");
  const embedSnippet = canTry
    ? `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/widget/${id}" async></script>`
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <AuthHeader user={user} onSignOut={signOut} />
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
          </>
        )}
      </main>
    </div>
  );
}
