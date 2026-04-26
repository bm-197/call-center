# Call Center

> Amharic-based AI call center SaaS for Ethiopian organizations.

Callers dial in → an AI agent picks up directly (no IVR) → handles the
conversation in Amharic → hands off to a human agent when it can't help.

Built for Ethiopian organizations using Ethio Telecom. Not built for, and
deliberately incompatible with, Twilio / Telnyx / other US-EU SIP providers.

---

## Architecture at a glance

```
apps/
  api/         Express 5 backend (Better Auth, BullMQ workers, ARI client)
  web/         Next.js 16 dashboard (App Router, shadcn, TanStack Query)
  rag/         Python FastAPI RAG service (LangChain + pgvector)
packages/
  db/          Prisma 7 schema + client (PostgreSQL + pgvector extension)
  shared/      Shared TypeScript types and constants
  amharic/     Amharic NLP utilities (normalizer, sentence chunker)
docker/
  asterisk/    PBX config (SIP, ARI, dialplan)
```

| Concern         | Choice                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| Auth            | **Better Auth** + `organization` plugin (multi-tenant orgs, roles, invitations via Resend) |
| Database        | **PostgreSQL 17** + **pgvector** for KB embeddings                                         |
| ORM             | **Prisma 7** (ESM, driver adapters, no native vector ops — uses `$queryRaw`)               |
| Real-time       | **SSE** for dashboard, **ARI WebSocket** for Asterisk, **WebRTC** for human handoff voice  |
| Telephony       | **Asterisk** in Docker for dev, **Ethio Telecom SIP trunk** for prod                       |
| AI pipeline     | STT (Google `am-ET` / Whisper) → LLM (GPT-4o / Gemini Flash) → TTS (Google Amharic voices) |
| RAG             | FastAPI + LangChain, multilingual-e5-large embeddings (1024-D) in pgvector                 |
| Storage         | **Cloudflare R2** for dev (Wrangler local) and prod (S3-compatible API)                    |
| Background jobs | **BullMQ + Redis**                                                                         |
| Frontend state  | **Zustand** (UI), **TanStack Query** (server state)                                        |
| Email           | **Resend** (transactional / invitations)                                                   |

See `CLAUDE.md` for the full constraint list and version pins.

---

## Prerequisites

- **Node.js 20.9+** (Next.js 16 requirement)
- **pnpm 10+** (`npm install -g pnpm`)
- **Docker** (for Postgres, Redis, Asterisk)
- **uv** for Python (`brew install uv` or [astral.sh/uv](https://docs.astral.sh/uv/))
- A **Cloudflare R2** account (optional in dev — uses Wrangler local)
- A **Resend** account (optional in dev — emails are logged to terminal if no API key)

---

## First-time setup

```bash
# 1. Clone and install JS deps
git clone https://github.com/bm-197/call-center.git
cd call-center
pnpm install

# 2. Install Python deps for the RAG service
cd apps/rag && uv sync && cd ../..

# 3. Create env files (see "Environment variables" below)

# 4. Start infra (Postgres + Redis + Asterisk)
pnpm infra:up

# 5. Generate Prisma client and push schema
pnpm db:generate
pnpm db:push

# 6. Run the stack
pnpm dev
```

Open <http://localhost:3000>, sign up, create an organization, you're in.

---

## Daily commands

| Command                                                       | What it does                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                                                    | Starts everything: infra (if down) + api (4000) + web (3000) + rag (4003) |
| `pnpm dev:api` / `dev:web` / `dev:rag`                        | Run a single service                                                      |
| `pnpm infra:up` / `infra:down` / `infra:logs` / `infra:reset` | Manage Docker infra                                                       |
| `pnpm db:generate`                                            | Regenerate Prisma client (run after schema changes)                       |
| `pnpm db:push`                                                | Sync schema to DB (dev only — no migration files)                         |
| `pnpm db:migrate`                                             | Create a migration (use for prod)                                         |
| `pnpm db:studio`                                              | Open Prisma Studio at <http://localhost:5555>                             |
| `pnpm db:seed`                                                | Run the seed script                                                       |
| `pnpm test`                                                   | Run all tests across packages                                             |
| `pnpm build`                                                  | Build everything                                                          |
| `pnpm lint`                                                   | Lint everything                                                           |
| `pnpm graph`                                                  | Open the Nx project graph                                                 |
| `pnpm format`                                                 | Run Prettier across the repo                                              |

Anything not listed: use `pnpm nx <target> <project>` directly.

---

## Environment variables

Three env files, all gitignored. Fill before running.

### `apps/api/.env`

```bash
# Server
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/callcenter

# Better Auth — generate a secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# Cloudflare R2 — only required in production; dev uses Wrangler local
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET_RECORDINGS=call-recordings
R2_BUCKET_KB_UPLOADS=kb-uploads

# Asterisk ARI — values match docker/asterisk/config/
ARI_URL=http://localhost:8088
ARI_USERNAME=callcenter
ARI_PASSWORD=callcenter_ari_secret
ARI_APP_NAME=call-center

# AI providers
OPENAI_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS=
GEMINI_API_KEY=

# RAG service
RAG_SERVICE_URL=http://localhost:4003

# Resend — leave empty in dev to log invitation emails to terminal
RESEND_API_KEY=
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME="Call Center"
```

### `packages/db/.env`

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/callcenter
```

### `apps/web/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
API_URL=http://localhost:4000
```

---

## How auth works

We use **Better Auth** with the organization plugin. Server lives at
`apps/api/src/modules/auth/`.

- Sign-up / sign-in are pure email + password (Google OAuth comes later)
- Sessions are cookie-based, 7-day expiry, refreshed daily
- Each user can belong to up to 5 organizations (configurable)
- Roles are `owner` / `admin` / `member` (matches Better Auth defaults)
- Invitations send Resend emails with a link to `/accept-invite?id=...`
- Web uses `apps/web/proxy.ts` to forward `/api/*` to the API on port 4000
  so cookies stay first-party (no CORS dance)
- Server components read the session via `getServerSession()` in
  `apps/web/app/lib/server-auth.ts`
- Protected API routes use `requireAuth` + `requireOrgMember(role?)`
  middleware in `apps/api/src/common/middleware/require-auth.ts`

---

## Tests

42 tests, all run in ~3 seconds. Required to pass before any push (enforced
via husky pre-push).

```bash
pnpm test                       # everything
pnpm nx test api                # just api
pnpm nx test api -- --watch     # watch mode
```

| Suite               | Coverage                                                      |
| ------------------- | ------------------------------------------------------------- |
| `auth.test.ts`      | Sign-up / session / sign-out, org create + set-active         |
| `isolation.test.ts` | **Critical:** cross-org access blocked for every resource     |
| `auth-gate.test.ts` | Every protected route returns 401 unauth + 403 no active org  |
| `crud.test.ts`      | Happy path + validation 400 + duplicate 409 for each resource |

Adding a new protected route? Add it to `ORG_SCOPED_ENDPOINTS` in
`auth-gate.test.ts` so it gets covered automatically.

---

## Git hygiene

The repo uses husky for two hooks:

- **pre-commit** — runs `lint-staged` (Prettier on staged TS/TSX/JSON/MD,
  `prisma format` on schema changes). Fast (~2s).
- **pre-push** — runs typecheck + `nx affected -t test/build` +
  `prisma validate`. Slower (~30s) but blocks broken pushes.

CI on GitHub Actions runs the same pipeline against a real Postgres + pgvector
service container.

---

## Project structure conventions

- **Routers** in `apps/api/src/modules/<feature>/<feature>.router.ts`
- **Hooks** for server state: `apps/web/app/dashboard/<feature>/use-<feature>.ts`
- **Always scope DB queries** with `where: { organizationId: req.activeOrganizationId! }`
  — the isolation test suite catches violations
- **Zod schemas** for request validation; errors auto-convert to 400 via
  `error-handler.ts`
- **Use `stripUndefined`** from `apps/api/src/common/strip-undefined.ts`
  when passing partial Zod output to Prisma updates (required under
  `exactOptionalPropertyTypes`)

---

## Reference

The sibling `Intervo/` directory (not a workspace member) is an open-source
voice/chat agent platform we use as an architectural reference for the AI
pipeline and ARI handler shape. Don't copy code wholesale — their codebase
uses Twilio in places, which we deliberately avoid.

---

## Contributing

1. Branch from `master`
2. Make changes, add tests
3. `git commit` (pre-commit formats your staged files)
4. `git push` (pre-push runs the full safety net)
5. Open a PR — CI runs the same checks against a clean environment
