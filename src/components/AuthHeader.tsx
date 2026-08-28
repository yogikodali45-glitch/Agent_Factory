"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";

export function AuthHeader({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <Link href="/" className="text-sm font-semibold text-black dark:text-zinc-50">
        Agent Factory
      </Link>
      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{user.email}</span>
        <button onClick={onSignOut} className="underline hover:text-black dark:hover:text-zinc-50">
          Sign out
        </button>
      </div>
    </div>
  );
}
