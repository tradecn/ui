# agent kit eval

`just eval-agent-kit` asks a coding agent to build trading screens twice, in a consumer with the `agent-kit` item installed and in the same consumer without it, and grades every screen against the item contract. The question is whether the kit's skill, rules and review prompt make an agent's screens keep the contract more often. The kit's own tests say its files are consistent with the registry; this says whether they help.

## What a trial is

- The consumer is the committed `fixtures/consumers/base-mira` (`--style` picks another), with every item but the themes installed through the real CLI from `public/r`. The kit arm adds `agent-kit`, which puts the skill, the instructions and the review prompt under `.github/` and `lib/agent-kit.ts` under `src/lib`. The bare arm has everything else, byte for byte.
- `src/App.tsx` is a stub that renders nothing, so a trial that leaves it alone fails to render.
- The agent is GitHub Copilot CLI in prompt mode, the agent the kit installs for, with the model the run names. It gets one request from `tasks/`, then the same frame in both arms: where the app is, that the tradecn items are installed, where the screen goes, and that `bunx vite build` has to pass. No request names a rule of the contract, and a test holds them to that.
- Each trial runs in its own copy of the consumer, outside the repository. Copilot runs with its own `HOME` and `COPILOT_HOME`, so none of the runner's skills, instructions or memories load; with the working directory trusted, so the project's skills and instructions do; with the GitHub token passed in and hidden from the agent's shell; and without the GitHub MCP server. On macOS the agent, and the build that runs its `vite.config.ts`, run in a sandbox that refuses writes under the runner's home.
- A trial stops at 20 minutes (`--timeout-min`).

## What it grades

| Grade | Passes when |
|---|---|
| `builds` | `vite build` succeeds. |
| `types` | `tsc` reports no error in a file the agent wrote or changed. |
| `renders` | The built page shows text under `#root` and logs no error. |
| `contract` | `checkContract` finds nothing on the rendered page after its mock feeds run for 2.5 s, and it checked some text. |
| `source` | The agent's files break none of the validator's rule 14 checks: no size under the floor, no Tailwind font family, no `tabular-nums` without `lining-nums`. |
| `items` | The screen imports one of the items its task names. |

Each result also counts findings per rule, direction findings under `visibleCue`, numbers formatted by hand (`toFixed`, `toLocaleString`, `Intl.NumberFormat`), minutes, and premium requests.

## The verdict

`expectations.json` says what "the kit helps" means, and it was written before the first run: for a model, the kit arm's `contract` rate is higher than the bare arm's, and its `builds` and `renders` rates are no lower. It is never edited to fit a run. A definition that turns out to measure the wrong thing is replaced by a new file with its own date, and the old one stays beside it, unedited.

## Running it

```sh
just eval-agent-kit                                        # three models, five tasks, both arms, two trials each
just eval-agent-kit --models gemini-3.8-flash --tasks watchlist --trials 1
just eval-agent-kit --machine m5-max                       # writes results/<machine>/<stamp>.json
```

It needs `copilot` on the path and `gh` signed in. Nothing is written to the repository without `--machine`; every run keeps its records, screenshots and session logs in the temp directory it prints, and `--keep` keeps the trials' consumers too. A trial is a whole coding session, and a session costs one premium request times the model's multiplier: on 2026-09-30 a one-word prompt cost 14 on Gemini 3.8 Flash and 1 on either GPT model. Three models, five tasks, both arms and two trials come to about 320, most of it Gemini's; the two GPT models alone come to about 40. Copilot's code reviews draw from the same allowance.

A handful of screens per arm is a first read, not a benchmark: one model's run can move a rate by a screen either way. The numbers say what these agents did with these requests on the date they ran.

## Apple M5 Max, 2026-09-29: the pilot

One model, one task, one screen per arm, to prove the harness rather than the kit: Gemini 3.8 Flash on the watchlist, Copilot CLI 1.0.83, graded in headless Chromium 153 on the base-mira consumer.

| Arm | builds | types | renders | contract | source | items | Floor findings on the page | Sizes under the floor in source | Tailwind font families | Hand-formatted | Minutes | Premium requests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kit | yes | yes | yes | yes | no | yes | 0 of 122 checked | 0 | 1 | 2 | 11.0 | 14 |
| bare | yes | yes | yes | no | no | yes | 16 of 135 checked | 10 | 9 | 3 | 7.4 | 14 |

Both agents built a working watchlist from `Watchlist` and `DataGrid`. The kit arm's agent loaded the tradecn skill before it wrote anything, and its page checked clean; its one source finding is a `font-mono`, which the page check has no rule for. The bare arm's agent set its own sizes under the floor, `text-[10px]` on its badges and on the tier it passed into `FeedHealthTier`, and nine Tailwind font families. One screen per arm says nothing about a rate; the run that does is three models, five tasks, both arms and two trials.

## Apple M2 Max, 2026-09-30: a run the quota cut short

The default run, on Copilot CLI 1.0.89, graded in headless Chromium 153 on the base-mira consumer. Nine minutes in, Copilot answered every model with "You have exceeded your monthly quota", and every later session ended in seconds without writing a file. The run's own result counts those sessions as screens, so it isn't in `results/`. Eight sessions finished before the quota ran out, all on the GPT models, on the positions and RFQ tasks. The watchlist rows are from a check that ran GPT-5.6 Sol minutes before.

| Model | Task | Arm | builds | types | renders | contract | source | items | Floor findings on the page | Numbers outside lining tabular figures | Sizes under the floor in source | Tailwind font families | Hand-formatted | Minutes | Premium requests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GPT-5.6 Sol | positions | kit | yes | yes | yes | yes | yes | yes | 0 of 53 checked | 0 | 0 | 0 | 0 | 2.2 | 1 |
| GPT-5.6 Sol | positions | bare | yes | yes | yes | no | no | no | 16 of 78 checked | 25 | 4 | 0 | 2 | 1.2 | 1 |
| GPT-5.6 Sol | rfq | kit | yes | yes | yes | yes | yes | yes | 0 of 75 checked | 0 | 0 | 0 | 0 | 4.9 | 1 |
| GPT-5.6 Sol | rfq | bare | yes | yes | yes | no | no | yes | 19 of 76 checked | 0 | 9 | 0 | 0 | 1.6 | 1 |
| GPT-5.6 Sol | watchlist | kit | yes | yes | yes | yes | yes | yes | 0 of 78 checked | 0 | 0 | 0 | 0 | 4.2 | 1 |
| GPT-5.6 Sol | watchlist | bare | yes | yes | yes | no | no | yes | 27 of 91 checked | 0 | 8 | 0 | 5 | 1.6 | 1 |
| GPT-5.6 Terra | positions | kit | yes | no | yes | yes | yes | yes | 0 of 55 checked | 0 | 0 | 0 | 1 | 1.6 | 1 |
| GPT-5.6 Terra | positions | bare | yes | yes | yes | yes | no | no | 0 of 92 checked | 0 | 0 | 0 | 4 | 0.9 | 1 |
| GPT-5.6 Terra | rfq | kit | yes | no | yes | yes | yes | yes | 0 of 90 checked | 0 | 0 | 0 | 0 | 1.9 | 1 |
| GPT-5.6 Terra | rfq | bare | yes | no | yes | no | no | no | 52 of 82 checked | 0 | 22 | 3 | 0 | 1.3 | 1 |

Every page built with the kit kept the contract. Without it, four of the five pages had text under the floor, and Sol's positions page also set 25 numbers outside lining tabular figures. The one grade the kit arm lost was Terra's types: both of its kit screens had a type error in a file the agent wrote. Two or three screens a side is a first read, not the rate the verdict needs; that run waits for the quota.
