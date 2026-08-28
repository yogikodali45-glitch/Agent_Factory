# Agent Factory

A business describes the agent it wants in plain language; the platform builds, tests, and deploys it.

Start with [`CLAUDE.md`](./CLAUDE.md) for the stack and working conventions, and [`MVP-ROADMAP.md`](./MVP-ROADMAP.md) for what's built and what's next. Full product context is in the four planning docs under [`docs/`](./docs) (Business Case, Product Requirements, MVP Scope, Blueprint).

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in real values (Supabase project + Claude API key) — see that file for exactly which variables are needed.

Open [http://localhost:3000](http://localhost:3000).
