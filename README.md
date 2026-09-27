# 🛡️ Astro-Guardian

**Astro-Guardian** is an AI-powered automated security scanning and patching platform for GitHub repositories. It detects vulnerable dependencies and exposed secrets, applies safe patches, validates them in isolated Docker containers, and opens a verified Pull Request — all without manual intervention.

The platform is built as an **npm monorepo** and is currently running on a **VPS (51.79.165.228)**, serving a live React frontend proxied behind Nginx.

---

## Purpose

Security vulnerabilities in open-source dependencies are discovered daily. Most teams find out too late — after a CVE is published against a version they shipped months ago. Astro-Guardian solves this by:

1. **Scanning** connected GitHub repositories against the live [Google OSV database](https://osv.dev) and running `npm audit` for Node.js projects
2. **Analysing** findings using IBM Bob Shell CLI (Gitleaks for secrets, Semgrep for code issues)
3. **Patching** vulnerable dependencies automatically by pinning them to the safe version from the OSV API
4. **Validating** the patch inside a real isolated Docker container per language (Node, Python, Java, PHP, Go)
5. **Opening a Pull Request** on the target repository with a full `SECURITY_REPORT.md` detailing every CVE patched

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     VPS (Linux)                      │
│                                                      │
│  ┌─────────────┐    ┌──────────────┐                 │
│  │  Nginx :80  │───▶│  React SPA   │  apps/web       │
│  │  (reverse   │    │  (Vite build)│                 │
│  │   proxy)    │    └──────────────┘                 │
│  │             │                                     │
│  │             │    ┌──────────────┐                 │
│  │             │───▶│  API Server  │  apps/api       │
│  └─────────────┘    │  Express :3001                 │
│                     └──────┬───────┘                 │
│                            │                         │
│              ┌─────────────┼──────────────┐          │
│              │             │              │          │
│    ┌─────────▼──┐  ┌───────▼──────┐  ┌───▼────────┐ │
│    │ PostgreSQL │  │  GitHub API  │  │   Docker   │ │
│    │ (Prisma)   │  │  (App JWT)   │  │ Containers │ │
│    └────────────┘  └──────────────┘  └────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │         packages/adapters (shared library)      │ │
│  │  RunnerAdapter  │  BobAdapter  │  GitHubAdapter  │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Request / Scan Flow

```
User clicks "Run Scan"
        │
        ▼
POST /api/v1/projects/:id/scans
        │  returns { jobId }
        ▼
GET  /api/v1/jobs/:jobId/events  (SSE stream)
        │
        ├─ [checkout]   git clone --depth=1 → /tmp/guardian/<jobId>
        ├─ [scanning]   IBM Bob CLI (Gitleaks + Semgrep) + OSV dep count
        ├─ [analysing]  npm audit / OSV API → patch manifest files
        │               SECURITY_REPORT.md written to workspace
        ├─ [testing]    Docker container validation (language-specific)
        ├─ [packaging]  git commit + push → GitHub PR created
        └─ [cleanup]    /tmp/guardian/<jobId> deleted
```

---

## Project Structure

```
astro-guardian/
├── apps/
│   ├── api/                        # Express API server
│   │   ├── src/
│   │   │   ├── index.ts            # Server entry — Express app, CORS, routes
│   │   │   ├── db.ts               # Prisma client singleton
│   │   │   └── routes/
│   │   │       ├── auth.ts         # GitHub OAuth → JWT cookie session
│   │   │       ├── github.ts       # Installations + repo listing, DB sync
│   │   │       ├── scans.ts        # Scan trigger + SSE job event stream
│   │   │       └── dashboard.ts    # Stats + audit log (real DB queries)
│   │   └── prisma/
│   │       └── schema.prisma       # PostgreSQL schema (see Database section)
│   │
│   ├── web/                        # React frontend (Vite + Tailwind)
│   │   └── src/
│   │       └── App.tsx             # Single-file React app — all views + SSE handling
│   │
│   └── worker/                     # Background worker (stub — planned for job queue)
│       └── src/index.ts
│
├── packages/
│   ├── adapters/                   # Shared adapters used by apps/api
│   │   └── src/
│   │       ├── runner.ts           # Clone, scan, patch, Docker test, commit/push
│   │       ├── bob.ts              # IBM Bob Shell CLI wrapper (Gitleaks + Semgrep)
│   │       ├── github.ts           # GitHub App JWT auth + API calls
│   │       └── watsonx.ts          # watsonx.ai client (in progress)
│   │
│   ├── contracts/                  # Shared TypeScript types (planned)
│   └── runner/                     # Runner package stub
│
├── runner/
│   ├── profiles/                   # IBM Bob runner profiles
│   └── rules/                      # IBM Bob custom rules
│
└── package.json                    # npm workspaces root
```

---

## Database Schema

Managed with **Prisma ORM** against a PostgreSQL database on the VPS.

| Model | Purpose |
|---|---|
| `User` | GitHub OAuth users. Keyed on `githubId`. |
| `Installation` | GitHub App installations (one per org/user). Linked to `User`. |
| `Repository` | Repos accessible via the installation. Stores `healthScore`. |
| `ScanJob` | One record per scan run. Tracks `status` (PENDING / RUNNING / COMPLETED / FAILED) and `stage`. |
| `Finding` | Individual CVE/secret/code issue found per scan. Tracks `type`, `severity`, `canAutoFix`, `isFixed`. |

---

## Key Adapters

### [`RunnerAdapter`](packages/adapters/src/runner.ts)
Handles the full scan + patch lifecycle:
- **`cloneRepository`** — shallow clone via GitHub App token
- **`runSecurityScanners`** — invokes `BobAdapter` for secrets/semgrep, counts declared deps
- **`applyBobPatch`** — runs `npm audit` (Node.js) or queries OSV API (Maven, Python) per dependency; rewrites manifest files in-place; generates `SECURITY_REPORT.md`
- **`runRealDockerTests`** — spawns a language-appropriate Docker container to validate the patched repo; streams logs back via callback
- **`commitAndPush`** — commits and force-pushes the patch branch

### [`BobAdapter`](packages/adapters/src/bob.ts)
Wraps the **IBM Bob Shell CLI** non-interactively using a pseudo-TTY (`script -q -c '...'`) so Bob produces output without an interactive terminal. Bob runs Gitleaks (secrets) and Semgrep (`p/secrets` ruleset) on the cloned workspace. Returns structured `{ secretsFound, semgrepIssues, bobSummary, rawOutput }`.

### [`GitHubAdapter`](packages/adapters/src/github.ts)
GitHub App authentication using RS256 JWT. Provides installation token exchange, repository listing, branch listing, and Pull Request creation.

---

## Environment Variables

Create a `.env` file in `apps/api/` with the following:

```env
# GitHub App credentials
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret

# Session
SESSION_SECRET=a_long_random_string

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/astro_guardian

# URLs (adjust for VPS deployment)
API_URL=http://51.79.165.228
FRONTEND_URL=http://51.79.165.228

# IBM Bob Shell CLI
BOBSHELL_API_KEY=your_ibm_bob_api_key

# watsonx.ai (coming soon)
WATSONX_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
```

---

## Running Locally

### Prerequisites
- Node.js 20+
- Docker (for validation containers)
- PostgreSQL
- IBM Bob Shell CLI installed on the host (`bob` in PATH) — optional, degrades gracefully

### Install dependencies

```bash
npm install
```

### Set up the database

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
```

### Start all services

```bash
# API (port 3001)
npm run dev:api

# React frontend (port 5173)
npm run dev:web

# Worker (stub)
npm run dev:worker
```

The web app will be available at `http://localhost:5173`. The API at `http://localhost:3001`.

---

## How It Runs on the VPS

The project is deployed on a Linux VPS at `51.79.165.228`. The deployment layout is:

- **Nginx** listens on port 80 and reverse-proxies:
  - `/api/*` → Express API at `:3001`
  - Everything else → the Vite-built static React files
- **API** runs as a persistent process (via `pm2` or `nohup`) on port 3001
- **PostgreSQL** runs locally on the VPS
- **Docker** is installed on the VPS and used at runtime for patch validation containers
- **IBM Bob CLI** is installed on the VPS host so `BobAdapter` can invoke it via `script -q -c 'bob run ...'`
- Scan workspaces are written to `/tmp/guardian/<jobId>` and cleaned up after each scan

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/auth/github` | Redirect to GitHub OAuth |
| `GET` | `/api/v1/auth/github/callback` | OAuth callback — sets session cookie |
| `GET` | `/api/v1/auth/me` | Returns current authenticated user |
| `POST` | `/api/v1/auth/logout` | Clears session cookie |
| `GET` | `/api/v1/github/installations` | Lists GitHub App installations for user |
| `GET` | `/api/v1/github/repositories?installationId=` | Lists repos for an installation |
| `GET` | `/api/v1/github/:owner/:repo/branches?installationId=` | Lists branches |
| `POST` | `/api/v1/projects/:id/scans` | Triggers a scan — returns `{ jobId }` |
| `GET` | `/api/v1/jobs/:id/events` | SSE stream of scan progress events |
| `GET` | `/api/v1/dashboard/stats` | Scan + autofix counts for the user |
| `GET` | `/api/v1/dashboard/audit-log` | Paginated scan history (last 50) |
| `GET` | `/api/v1/health` | Health check — returns `{ status: "ok" }` |

### SSE Event Types

| Event | Payload | Description |
|---|---|---|
| `stage.started` | `{ stage, message }` | New pipeline stage beginning |
| `log.chunk` | `{ text }` | Single log line from the running scan |
| `job.finished` | `{ status, message }` | Job complete — SSE stream closes |

---

## Security Notes

- GitHub tokens are exchanged per-scan via the App installation token API — never stored
- All scan workspaces are isolated under `/tmp/guardian/<jobId>` and deleted on completion
- Docker containers run with `--memory=512m --cpus=1` limits and `--rm` (auto-removed)
- Session cookies are `httpOnly`, `sameSite: lax`; `secure` flag enabled in production
- Never pass raw repository file contents to external AI APIs — only CVE metadata is forwarded
