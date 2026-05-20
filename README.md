# Concilium

**Concilium** is a localhost-first **Mercury 2** model council powered by [Inception Labs](https://docs.inceptionlabs.ai/). Ask a question and three dynamically assigned council members deliberate in parallel before a chair synthesizes one unified answer — Perplexity-style structure with a Mercury 2 orchestrator.

Repository: [github.com/kadinsolaiman8-spec/Concilium](https://github.com/kadinsolaiman8-spec/Concilium)

## Features

- **Adaptive routing** — `single`, `lite`, or `full` council based on task shape (MCQ, debug, long compare, agent-graded fixtures, etc.)
- **5-stage full pipeline** — orchestrator assigns roles → parallel members → synthesizer merges responses
- **SSE streaming** for synthesis text as it is generated
- **`.txt` upload** with client-side truncation (~16k chars) and visible warning
- **Conversation sidebar** with Neon Postgres (falls back to `localStorage` without `DATABASE_URL`)
- **Context usage ring** with 128k token hard stop
- **Cursor-style activity feed** during deliberation
- **Server-side API proxy** — your Inception key never reaches the browser
- **Benchmark harness** — open rubric suite + [AA Intelligence Index](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index) proxy suite with regression gates

## Product quality & benchmark report

Measurements below were captured on **2026-05-20** against this codebase. Benchmark runs require `INCEPTION_API_KEY` (council) and `INCEPTION_API_KEY_FALLBACK` (baseline + judge) in `.env.local`. Reproduce with `npm test` and the commands in [benchmarks/README.md](benchmarks/README.md).

### Unit tests

| Metric | Result |
|--------|--------|
| Test files | 17 passed |
| Tests | 95 passed |
| Command | `npm test` |

Coverage includes routing (`council-mode`), synthesis lint, AA composite grading, product SLO helpers, constraint rules, and structural benchmark checks.

### Open rubric benchmark (`regression-open`)

Six fixtures (`debug-01`, `debug-04`, `debug-05`, `howto-01`, `howto-02`, `compare-01`) comparing routed council vs single-shot Mercury 2 baseline.

| Metric | Result |
|--------|--------|
| Council win rate | **100%** (6 wins / 0 losses; ties excluded) |
| Avg council usefulness / accuracy | 8.83 / 9.00 |
| Avg baseline usefulness / accuracy | 7.17 / 8.33 |
| Routing | 5× lite, 1× single |
| Council p50 / p95 latency | 4.5s / 13.2s |
| API token ratio (council/baseline) | 4.46× |
| API failure rate | 0% |

Regression gate target: **≥90%** win rate (`npm run benchmark -- --gate --run-id regression-open`).

### AA Intelligence Index proxy (`regression-aa-routed-v8`, 3 trials)

**93 fixtures** across GDPval-AA, τ²-Bench, Terminal-Bench, SciCode, AA-LCR, Omniscience, IFBench, HLE, GPQA Diamond, and CritPt shapes. Scores are a **proxy** aligned to [AA methodology weights](https://artificialanalysis.ai/methodology/intelligence-benchmarking), not official AA suite runs.

| Metric | Trial 1 | Trial 2 | Trial 3 | **Median** |
|--------|---------|---------|---------|------------|
| Routed product proxy (0–100) | 94.97 | 93.04 | 94.30 | **94.30** |
| Baseline proxy | 85.18 | 83.04 | 83.40 | 83.40 |
| Uplift ratio | 1.115 | 1.120 | 1.131 | 1.120 |
| Routed product token mult. (excl. full-council-eval) | 1.79× | 1.93× | 1.95× | **1.93×** |
| Hard slice (`hard-v8` tag) | 95.74 | 94.97 | 94.12 | 94.97 |
| API failure rate | 0% | 0% | 0% | 0% |
| Agent fixture pass rate | 67% | 67% | 67% | 67% |
| Routed latency p50 / p95 | 0.9s / 6.0s | 0.8s / 5.8s | 0.8s / 5.7s | ~0.8s / ~5.8s |

**Routing mix (typical trial):** ~67 single, ~15 lite, ~11 full council fixtures.

**Estimated AA Intelligence Index** (anchored to Mercury 2 published score of **33**): `33 × (proxy_council / proxy_baseline)` → **~36.8** on trial 1 (heuristic ±4). Treat as indicative only.

**Per-eval routed proxy (trial 1, council vs baseline):**

| Eval | Weight | Council | Baseline |
|------|--------|---------|----------|
| gdpval-aa | 16.7% | 88.8 | 80.6 |
| terminal-bench | 16.7% | 87.5 | 75.0 |
| aa-omniscience | 12.5% | 100.0 | 100.0 |
| hle | 12.5% | 100.0 | 90.0 |
| tau2-bench | 8.3% | 97.1 | 60.0 |
| scicode | 8.3% | 100.0 | 100.0 |
| aa-lcr | 6.3% | 86.7 | 71.2 |
| ifbench | 6.3% | 100.0 | 100.0 |
| gpqa-diamond | 6.3% | 100.0 | 83.3 |
| critpt | 6.3% | 100.0 | 100.0 |

**Wave 8 regression gate targets** (see [benchmarks/README.md](benchmarks/README.md)): routed proxy median ≥97, open win rate ≥90%, routed product token mult. ≤1.40×, GDPval ≥92, agent fixtures 6/6, etc. Latest 3-trial median proxy (**94.30**) and token mult. (**1.93×**) are below gate — documented for transparency; run `npm run benchmark:regression` after changes.

### Cost & verbosity (trial 1 extrapolation)

| Metric | Council | Mercury 2 baseline |
|--------|---------|-------------------|
| API token multiplier | 3.13× | 1× |
| Est. full Index output tokens | ~219M | 70M (published) |
| Est. Index eval cost | ~$252 | ~$81 (published) |
| Effective synthesis throughput | ~73 t/s | 746 t/s (published single-call) |

### Known product limitations

- All agents use **Mercury 2** with different prompts — not true multi-vendor diversity.
- Council improves **structure and perspective-taking**, not guaranteed factual verification.
- Each user message can trigger **1–5+ API calls** depending on route; monitor Inception usage.
- AA proxy scores use the same model family for rubric items; MCQ/checklist/IFBench reduce bias.
- Agent-graded fixtures passed **4/6** in latest runs (67%).

---

## Security report (Snyk)

Scans run via [Snyk](https://snyk.io/) MCP on **2026-05-20** against `c:\Users\kadin\Downloads\Mercury2-Council`.

### Open-source dependencies (SCA)

| Severity | Package | Issue | Status |
|----------|---------|-------|--------|
| ~~Medium~~ | ~~`postcss@8.4.31` (via `next`)~~ | CVE-2026-41305 XSS (CWE-79) | **Resolved** — `package.json` `overrides` pin `postcss@^8.5.10`; re-scan shows **0 SCA issues** |

Re-verify after `npm install`:

```bash
npx snyk test
```

### Static analysis (Snyk Code)

| Severity | Location | Finding | Notes |
|----------|----------|---------|-------|
| High | `src/lib/benchmark/*.ts` | Hardcoded non-crypto secret | **False positive** — sentinel `apiKey: "fallback-only"` routes to `INCEPTION_API_KEY_FALLBACK`, not a real credential |
| Medium | `src/lib/agent-task.ts` → `council.ts` | Path traversal to `readFile` | **Review** — user-supplied paths in agent tool flows; localhost dev scope; validate before production hardening |

### Secret scanning

Snyk secret scan was **not available** for this org (`SNYK-CLI-0016` — feature disabled). Manual checks:

- `.gitignore` excludes `.env*` except `.env.example`
- No API keys in committed source; Inception auth is server-side only
- Never commit `.env.local`

### Application security practices

- Browser calls only `/api/council`; `Authorization` headers stay on the server
- Context uploads truncated client-side; 128k token ceiling server-enforced
- Optional Neon Postgres for persistence — use TLS connection strings

---

## When to use council vs direct answer

| Task shape | Routed mode |
|------------|-------------|
| MCQ, exact fact, terminal one-liner | **single** |
| Medium debug/howto, short compare (&lt;400 chars) | **lite** |
| τ² checklist scenarios | **single** + checklist footer |
| GDPval short (&lt;400 chars) | **lite** |
| Long compare (≥400 chars), GDPval long, deliverable templates | **full** |
| Brainstorm, review, multiturn | **full** |
| Agent-graded (`grading: agent`) | **lite** + up to 2 tool rounds |

See [benchmarks/README.md](benchmarks/README.md) and [docs/agent-tools-future.md](docs/agent-tools-future.md).

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

```env
INCEPTION_API_KEY=your_inception_api_key_here
INCEPTION_API_KEY_FALLBACK=optional_fallback_for_benchmarks
DATABASE_URL=postgresql://...   # optional — Neon Postgres
CONTEXT_LIMIT_TOKENS=128000     # optional — default 128k
```

Get a key from [Inception Labs](https://docs.inceptionlabs.ai/).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Production build

```bash
npm run build
npm start
```

### Neon Postgres (optional sidebar persistence)

1. Create a Neon project and run [`scripts/schema.sql`](scripts/schema.sql)
2. Set `DATABASE_URL` in `.env.local`
3. Restart dev server — `localStorage` history imports once on first load

---

## Benchmark commands

```bash
npm run benchmark              # open rubric suite
npm run benchmark:aa-index     # AA proxy suite
npm run benchmark:compare      # compare historical runs
npm run benchmark:regression   # tests + gated open + AA v8 (3 trials)
```

Details: [benchmarks/README.md](benchmarks/README.md).

---

## API usage (Mercury 2)

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INCEPTION_API_KEY" \
  -d '{
    "model": "mercury-2",
    "messages": [{ "role": "user", "content": "What is the meaning of life?" }]
  }'
```

See [`APIOptions`](APIOptions) for additional client examples (placeholders only).

---

## Project structure

| Path | Purpose |
|------|---------|
| `src/lib/mercury.ts` | Mercury 2 chat + stream client |
| `src/lib/council.ts` | Council orchestrator |
| `src/lib/council-mode.ts` | Adaptive routing (single/lite/full) |
| `src/lib/prompts.ts` | Orchestrator/chair prompts |
| `src/lib/benchmark/` | Rubric + AA proxy benchmark engine |
| `src/app/api/council/route.ts` | POST handler with optional SSE |
| `benchmarks/` | Fixture suites (`fixtures.jsonl`, `aa-index-fixtures.jsonl`) |
| `scripts/` | Benchmark runners + DB schema |

---

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE).
