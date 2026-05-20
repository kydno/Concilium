# Agent tools (future scope)

Terminal-Bench and GDPval-AA on the [AA Intelligence Index](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index) require tool-using agents (shell, file edits, Stirrup-style loops). Concilium today is chat-only in production UI: orchestrator, members, and chair synthesize text without executing commands unless the dev API flag is set.

## Wave 8 (shipped)

1. **Six agent fixtures** — `agent-01` … `agent-06` in [`benchmarks/aa-index-fixtures.jsonl`](../benchmarks/aa-index-fixtures.jsonl) (echo, pwd, two-step echo, clean `git status`, mock FS write/read, pre-seeded `cat`).
2. **Transcript grading** — [`gradeAgentOutput`](../src/lib/agent-task.ts) / [`gradeAgentTranscript`](../src/lib/agent-task.ts) require every `Tool output (…)` block in order with exit 0 for multi-step fixtures; any extra tool rounds in the synthesis must also exit 0.
3. **Mock FS v2** — in-memory VFS for `echo content > file.txt` and `cat file.txt`; optional `agentMockFsSeed` on fixtures (e.g. `agent-06`).
4. **Opt-in real shell** — `AGENT_REAL_SHELL=1` runs allowlisted commands in `os.tmpdir()/mercury-agent-*` (benchmark/local only; **off** in CI default). Without it, only mocks + VFS run.
5. **API dev flag** — `POST /api/council` accepts optional `agentTask` and `agentSteps` (no production UI toggle in v8).

## Wave 7 (kept)

1. **Multi-round tool loop (max 2)** — lite council: member → `runAgentTask` → optional second member pass → chair ([`src/lib/council.ts`](../src/lib/council.ts)).
2. **Deterministic `agentSteps`** — benchmark runs fixed commands before chair when steps are declared (reliability for `agent-03`+).
3. **Lite orchestrator bypass** — first-turn lite skips the 3-member orchestrator plan.

## Wave 5–6 (kept)

1. **`runAgentTask()`** — whitelisted command sandbox with deterministic mocks for CI.
2. **`grading: "agent"`** — routes to lite + `agentTask: true`; baseline uses `precisionHint: "command"`.
3. **Chair structural retries** — one production retry; benchmark harness may run a second retry when lint still fails.

Non-goals remain: full GDPval Stirrup reproduction, unconstrained shell in production UI.

## Proposed next steps

1. Wire optional agent mode into production UI behind a feature flag (reuse `agentTask` API).
2. Expand mock FS for richer Terminal-Bench shapes; keep real shell behind `AGENT_REAL_SHELL`.
3. Council flow **plan → tool loop → synthesize** with >2 rounds only when product requires it.

## When to build further

After `regression-aa-routed-v8` gates stay green (routed proxy ≥97 median, agent 6/6 all trials, AA token mult ≤1.40×) and open regression ≥90%.

## Non-goals (initial)

- Full GDPval-AA or Terminal-Bench reproduction inside this repo.
- Replacing the proxy suite; agent mode extends it, not replace chat-only regression.
- Unconstrained production shell (allowlist + env flag only).
