# Security

Manual and Snyk-assisted review for Concilium. Re-run after dependency or API surface changes.

## Quick checks (no Snyk account)

```bash
npm audit
npm test
git ls-files | findstr /i "\.env secret credential pem key"
```

On Unix:

```bash
npm audit
npm test
git ls-files | grep -E '\.(env|pem|key)$|secret|credential'
```

---

## 2026-05-20 audit summary

| Check | Tool | Result |
|-------|------|--------|
| Dependency vulnerabilities | `npm audit` + Snyk SCA | **0 issues** (postcss override to ^8.5.10) |
| Secret / credential leak | **Manual** (Snyk secret scan unavailable) | **No secrets in git** |
| Static app security | Snyk Code + **manual review** | 0 critical; 1 medium mitigated (path guard) |
| API input validation | **Manual** | Zod limits on `/api/council` |
| XSS (markdown UI) | **Manual** | `react-markdown` only; no `dangerouslySetInnerHTML` |

---

## Manual secret scan (replaces Snyk secret scan)

Snyk org returned `SNYK-CLI-0016` (secret scanning disabled). Performed equivalent checks:

### Committed tree

| Pattern | Scope | Findings |
|---------|-------|----------|
| OpenAI / GitHub / AWS key prefixes | All tracked files | **None** |
| JWT-shaped strings (`eyJ…`) | `src/` | **None** |
| PEM / private keys | Repo | **None** |
| High-entropy quoted strings (40+ chars) | `src/` | **None** |
| Live `postgresql://user:pass@` URLs | Repo | **Placeholder only** in `.env.example` |
| `INCEPTION_API_KEY=…` with real values | `git log --all` | **None** — only placeholders and docs |

### Files on disk (not committed)

- `.env.local` present locally — **correctly gitignored** (`.gitignore` blocks `.env*` except `.env.example`)
- Only `.env.example` is tracked

### Sentinel values (not secrets)

| Value | Location | Purpose |
|-------|----------|---------|
| `apiKey: "fallback-only"` | `src/lib/benchmark/*.ts`, `mercury-answer.ts` | Selects `INCEPTION_API_KEY_FALLBACK` env var |
| `primary-key` / `fallback-key` | `src/lib/mercury.test.ts` | Unit test fixtures |

### Recommendations

- Never commit `.env.local`
- Rotate Inception keys if `.env.local` was ever shared or committed by mistake
- Use Neon connection strings with `sslmode=require`

---

## Manual dependency audit (SCA)

```json
npm audit: vulnerabilities.total = 0
```

Production + dev dependencies: 652 total (123 prod, 494 dev per audit metadata).

**Transitive fix applied:** `package.json` → `"overrides": { "postcss": "^8.5.10" }` so `next` no longer pulls vulnerable `postcss@8.4.31` (CVE-2026-41305).

---

## Manual static review (SAST)

### API routes (`src/app/api/`)

| Route | Auth | Input validation | Notes |
|-------|------|------------------|-------|
| `POST /api/council` | Server env keys only | Zod: query ≤8k, context ≤20k, ≤5 prior turns | No user API keys; SSE optional |
| `/api/conversations/*` | None (localhost product) | Zod on import/turn payloads | Returns 503 without `DATABASE_URL` |

**Gaps for public deployment:** add rate limiting, auth, and CSRF/session hardening if exposed beyond localhost.

### Agent shell (`src/lib/agent-task.ts`)

| Control | Status |
|---------|--------|
| Command whitelist (`ALLOWED_COMMAND`) | Enforced before mock or real shell |
| Real shell gated | `AGENT_REAL_SHELL=1` only (off by default) |
| `execFile` (not `exec` with shell) | Yes |
| Path traversal on `cat` / `echo > file` | **Mitigated** — `resolveWithinWorkspace()` blocks `..`, slashes, escape outside temp dir |
| Filename charset | `[\w.-]+` in regex |

Snyk Code “path traversal” finding: **addressed** for real-shell mode; mock VFS uses in-memory map only.

### Client

- Markdown via `react-markdown` + `remark-gfm` — no raw HTML injection path in components
- Inception `Authorization` never sent from browser

---

## Snyk scan log

| Scan | Date | Result |
|------|------|--------|
| SCA | 2026-05-20 | 0 issues after postcss override |
| Snyk Code | 2026-05-20 | 3× false-positive “secret”; 1× path traversal → mitigated |
| Snyk secrets | 2026-05-20 | **Skipped** — use manual secret scan above |

---

## Reporting vulnerabilities

Open a [GitHub issue](https://github.com/kadinsolaiman8-spec/Concilium/issues) on the Concilium repository. Do not post live API keys or `.env.local` contents.
