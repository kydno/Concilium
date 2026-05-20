# Concilium benchmark

Compares the **routed council path** (primary `INCEPTION_API_KEY`: full, lite, or single-pass when precision tasks are detected) against a **single-shot Mercury 2 baseline** and **rubric judge** (both use `INCEPTION_API_KEY_FALLBACK` only).

## When to use council vs direct answer

| Task shape | Routed mode |
|------------|-------------|
| MCQ, exact fact, terminal one-liner | **single** (one Mercury call) |
| Medium debug/howto, short compare (&lt;400 chars) | **lite** (1 member + chair, no orchestrator on first turn) |
| τ² checklist scenarios | **single** + checklist footer |
| GDPval short (&lt;400 chars) | **lite** |
| Long compare (≥400 chars), GDPval long, deliverable templates, `full-council-eval` tag | **full** (orchestrator + 2–3 members + chair) |
| Brainstorm, review, multiturn | **full** |
| Agent-graded (`grading: agent`) | **lite** + up to 2 tool rounds |

Council is a quality mode for open-ended work, not the default for index-style bulk evals. See [`docs/agent-tools-future.md`](../docs/agent-tools-future.md) for the Wave 5 agent-grading spike.

## Requirements

Set in `.env.local`:

```env
INCEPTION_API_KEY=...           # council runs only
INCEPTION_API_KEY_FALLBACK=...  # baseline + judge only
```

## Run

```bash
npm run benchmark
```

Options:

- `--dry-run` — list fixtures and budget, no API calls
- `--only <fixture-id>` — run one fixture (e.g. `--only debug-01`)
- `--max-fixtures N` — cap fixture count
- `--run-id <id>` — custom output folder name
- `--gate` — exit non-zero if council rubric win rate is below 85% (also enabled for `regression-open`)

AA benchmark (`npm run benchmark:aa-index`):

- `--trials N` — repeat the suite (default 1; **3** for `benchmark:regression`); gates routed proxy on **median** across trials and agent fixtures on **all trials pass**
- `--gate` — exit non-zero if routed proxy &lt; 97 (median when `--trials` &gt; 1), SciCode &lt; 35, tau2 &lt; 90, GDPval &lt; 90 (v7) or &lt; 92 (v8), full/lite renorm &lt; 93, full-council eval lane &lt; 85 (v7) or &lt; 92 (v8), **routed product** token mult (excl. `full-council-eval`) &gt; 1.40×, agent fixtures fail, or (v8) product SLOs / per-fixture GDPval floors fail (also enabled for `regression-aa-routed-v8` and prior regression ids)

Output is written to `benchmarks/runs/<run-id>/`:

- `results.jsonl` — per-fixture payloads
- `summary.json` / `summary.md` — aggregates

## Token budget

Runs stop adding fixtures when cumulative tokens exceed **9,500,000** (all council, baseline, and judge calls).

## Interpreting results

- **Rubric dimensions** (1–10): usefulness, structure, accuracy, voice
- **Win rate**: weighted rubric total (35% usefulness, 30% accuracy, 20% structure, 15% voice)
- **Structural checks**: free heuristics (paragraph breaks, leak phrases, council jargon)
- Judge uses the same model as baseline; scores may be correlated

## Fixtures

`fixtures.jsonl` has 40 items across task types (`debug`, `explain`, `howto`, `compare`, `brainstorm`, `review`, `general`) plus 5 multiturn cases.

---

## AA Intelligence Index proxy

Compares council vs single-shot Mercury 2 on a **84+ fixture proxy suite** aligned to [AA Intelligence Index v4.0](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index) eval shapes (GDPval-AA, τ²-Bench, Terminal-Bench, SciCode, AA-LCR, AA-Omniscience, IFBench, HLE, GPQA Diamond, CritPt).

```bash
npm run benchmark:aa-index
npm run benchmark:aa-index -- --dry-run
npm run benchmark:aa-index -- --only gpqa-01 --run-id smoke
npm run benchmark:aa-index -- --run-id v8-hard --only-tag hard-v8 --gate
npm run benchmark:aa-index -- --trials 3 --run-id regression-aa-routed-v8
```

AA benchmark options:

- `--only <fixture-id>` — run one or more fixtures by id
- `--only-tag <tag>` — run fixtures with a tag (e.g. `hard-v8` for Wave 8 harder slice burn campaigns)
- `--trials N` — repeat the run N times; regression uses median routed proxy
- `--gate` — enforce proxy/SLO thresholds (see regression table)
- `--dry-run` — list fixtures and token budget without API calls

`summary.json` includes `hardSliceProxyIndex` (renormalized proxy for `hard-v8`-tagged fixtures, report-only, not gated) and `tokenBudget` for burn tracking.

Output (`benchmarks/runs/<run-id>/`):

- `results.jsonl` — per-fixture grades and markdown
- `summary.json` — proxy index + extrapolation payload
- `summary-aa.md` — human-readable report
- `extrapolation.json` — estimated AA Index, verbosity, throughput

### Proxy index and extrapolation

- **Proxy index (0–100):** weighted average of per-eval scores using [AA methodology weights](https://artificialanalysis.ai/methodology/intelligence-benchmarking).
- **Estimated council AA Index:** `33 × (proxy_council / proxy_baseline)` anchored to Mercury 2’s published score of **33**.
- **Verbosity:** `70M × (council_api_tokens / baseline_api_tokens)` for estimated full-Index output tokens; `$80.68` scales the same way for cost.
- **Effective synthesis t/s:** final synthesis token estimate ÷ council wall time (not AA’s 746 t/s single-call generation metric).

### Grading types

| Type | Used for |
|------|----------|
| `mcq` | GPQA-style multiple choice |
| `exact` / `numeric` | Omniscience, HLE, CritPt |
| `ifbench` | Programmatic constraint checks |
| `checklist` | τ²-Bench scenario actions |
| `regex` | Terminal-Bench command patterns |
| `rubric` | GDPval-AA, SciCode, AA-LCR open tasks |

### Limitations

- Proxy tasks are **not** the official AA suites (no Stirrup agents, no CritPt grading server, etc.).
- Extrapolation is **indicative**; baseline on fallback key is assumed ≈ published Mercury 2.
- Rubric items use the same model as baseline; objective graders reduce bias on ~half the suite.
- AA runs record **routing mode** per fixture (`full` / `lite` / `single`) and token totals by mode in `summary.json`.
- Reports show **routed product proxy** (all modes) and **full/lite council only** proxy for apples-to-apples multi-agent comparison.

## Regression gate

```bash
npm run benchmark:regression
```

Runs unit tests, six open fixtures (`debug-01`, `debug-04`, `debug-05`, `howto-01`, `howto-02`, `compare-01`), then the full AA proxy suite (`regression-aa-routed-v8`, **3 trials**, median gate). The open step uses `--gate` and **fails** if council rubric win rate is below **90%** (wins / (wins + losses); ties are excluded from the denominator).

### Wave 8 quality thresholds (`regression-aa-routed-v8`)

| Metric | Target |
|--------|--------|
| Routed AA proxy (median of 3 trials) | ≥97 |
| Open rubric win rate (`regression-open`) | ≥90% |
| AA routed product token multiplier (excl. `full-council-eval` lane) | ≤1.40× |
| GDPval-AA eval proxy | ≥92 |
| GDPval per-fixture council score | ≥0.85 each |
| tau2-bench eval | ≥90 |
| Full/lite council-only (renormalized) | ≥93 |
| Full-council eval lane (`full-council-eval` tag) | ≥92 |
| Omniscience eval | ≥95 |
| SciCode eval | ≥35 |
| Agent fixtures | 6/6 pass all trials |
| API failure rate (AA suite) | 0 |
| Routed product latency p95 | ≤120s |
| `productSlos` in `summary.json` | populated |

Wave 7 (`regression-aa-routed-v7`) used GDPval ≥90 and full-council eval ≥85; v8 raises those lanes and adds product SLO gates.

Compare historical runs (pre-route → v7) and Mistral pricing anchors:

```bash
npm run benchmark:compare
```

Re-run AA verification after changes: `npm run benchmark:aa-index -- --run-id regression-aa-routed-v8`

Harder slice (report-only): `npm run benchmark:aa-index -- --run-id v8-hard --only-tag hard-v8`

AA reports show **renormalized** full/lite council proxy, **GDPval loss digest**, and estimated AA Index (report-only, not gated).
