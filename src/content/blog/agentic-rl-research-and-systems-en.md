---
title: "Deep Research Agent RL: Systems and Algorithm Exploration"
description: "Deep Research pipelines, infrastructure and efficiency, IGPO to CTF-IGPO, and short-run and complete experimental results."
category: technical
lang: en
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T05:28:55+08:00"
draft: false
review: false
presentation: true
---

## 1. Deep Research Agents: Scenario, Goal, and Pipelines

### 1.1 Reduce interaction cost while preserving quality

Deep Research agents combine reasoning, search, and page visits over many turns; the goal is to preserve answer quality while reducing interaction and generation costs.

- **Actions**: choose Search, Visit, or further reasoning, assess the evidence, and decide when to answer.
- **Cost**: track logical rounds, total generated tokens, and length per round together to detect longer-response compensation.
- **Two efficiencies**: systems reduce waiting and repeated computation; algorithms learn better actions. Each needs its own validation.

### 1.2 Inference pipeline: the action–observation loop

Tool observations return to context, and the agent continues acting or produces its final answer.

<figure class="talk-figure dr-figure" data-talk-figure="inference-pipeline" lang="en" aria-labelledby="talk-inference-pipeline-title">
<p class="tf-title" id="talk-inference-pipeline-title">Deep Research · inference pipeline</p>
<div class="dr-panel"><p class="dr-stage">Fixed policy · multi-turn interaction</p><div class="dr-three dr-inference-grid"><div class="dr-node dr-checkpoint dr-soft-blue"><strong>Trained checkpoint</strong></div><span class="dr-down dr-weight-arrow" aria-hidden="true">↓</span><div class="dr-node dr-question"><strong>User question</strong><small>Task and constraints</small></div><span class="dr-arrow dr-question-arrow" aria-hidden="true"></span><div class="dr-node dr-policy dr-blue"><strong>Agent policy</strong><small>AgentLoop · SGLang</small></div><span class="dr-arrow dr-answer-arrow" aria-hidden="true"></span><div class="dr-node dr-answer dr-green"><strong>Final answer</strong><small>On the finish action</small></div></div><div class="dr-interaction"><span>Tool calls</span><b aria-hidden="true">↕</b><span>Observations back to context</span></div><div class="dr-tools"><p class="dr-stage">Tool environment · choose as needed</p><div class="dr-tool-options"><div class="dr-node dr-soft-blue"><strong>Search</strong><small>Query → search results</small></div><div class="dr-node dr-peach"><strong>Visit</strong><small>URL → page content</small><div class="dr-service-chain"><span>Reader</span><b aria-hidden="true">→</b><span>Summary</span></div></div></div></div></div>
<figcaption>Figure 1 · Multi-turn interaction with fixed weights. Search and Visit are alternative actions; Reader / Summary follow the configured backend.</figcaption>
</figure>

- Search and Visit are selected as needed; HTTP success does not establish reliable evidence.
- Retain actual generated actions, behavior probabilities, and policy versions. Tool responses and controller text enter context but are not policy actions.
- A task does not update weights during inference; training supplies new policies for later sampling.

### 1.3 Training pipeline: from trajectories to the next policy

Outcome and optional process/cost signals form advantages, followed by Actor updates and weight publication.

<figure class="talk-figure dr-figure" data-talk-figure="training-pipeline" lang="en" aria-labelledby="talk-training-pipeline-title">
<p class="tf-title" id="talk-training-pipeline-title">Deep Research · RL training pipeline</p>
<div class="dr-training-grid"><div class="dr-panel"><p class="dr-stage">01 · Rollout</p><div class="dr-three dr-entry"><div class="dr-node "><strong>Training tasks</strong><small>Questions only</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-blue"><strong>Multi-trajectory rollout</strong><small>AgentLoop · SGLang</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-soft-blue"><strong>Trajectories &amp; policy version</strong><small>Action tokens · behaviour logprob</small></div></div></div><div class="dr-flow-down" aria-hidden="true">↓</div><div class="dr-panel"><p class="dr-stage">02 · Scoring and credit</p><div class="dr-supervision"><strong>Reference answers</strong> → Judge and IG scoring only</div><div class="dr-scorers"><div class="dr-node dr-green"><strong>Judge</strong><small>Outcome quality</small></div><div class="dr-node dr-yellow"><strong>IG scoring</strong><small>Turn-level information gain</small></div><div class="dr-node dr-peach"><strong>Cost</strong><small>Interaction and generation</small></div></div><div class="dr-merge" aria-hidden="true"></div><div class="dr-node dr-advantage dr-soft-blue"><strong>Credit &amp; advantages</strong></div></div><div class="dr-actor-feed" aria-hidden="true"></div><div class="dr-panel"><p class="dr-stage">03 · VERL: update and synchronization</p><div class="dr-update-row"><div class="dr-adv-input">Combined advantage</div><span class="dr-adv-input-arrow" aria-hidden="true">↓</span><div class="dr-node dr-reference"><strong>Reference policy</strong><small>ref logprob · KL</small></div><span class="dr-arrow dr-kl-arrow" aria-hidden="true"></span><div class="dr-node dr-actor dr-blue"><strong>Actor · PPO</strong><small>Combined advantage + old logprob</small></div><span class="dr-arrow dr-sync-arrow" aria-hidden="true"></span><div class="dr-node dr-sync dr-soft-blue"><strong>Weight sync</strong><small>Publish new policy</small></div></div><div class="dr-out-branches" aria-hidden="true"><span></span><span></span></div><div class="dr-outputs"><div class="dr-node dr-soft-blue"><strong>Future rollouts</strong></div><div class="dr-node dr-green dr-eval"><strong>Development evaluation</strong><small>Q / R / T / U</small></div></div></div></div><div class="dr-save-state"><strong>Save / restore</strong><span>Model · optimizer · data cursor · Partial state</span></div>
<figcaption>Figure 2 · References enter scoring only. The training side recomputes old/ref; development evaluation supplies no gradients. Signals and execution order depend on the recipe.</figcaption>
</figure>

- Rollout, tools, and Judge produce trajectories and scores; the recipe prepares advantages and old/ref probabilities.
- Actor updates synchronize to inference, with model, optimizer, and applicable data/sampling state saved.
- Shared GPUs are scheduled by stage; Partial does not mean Actor and rollout always execute concurrently.

## 2. Infrastructure and Efficiency

### 2.1 Three construction tracks: runtime, training, and tools

The available engineering record spans August to early November 2026, with deliveries along three tracks.

| Track | Foundations (2026-08) | Later delivery (2026-09–10) |
| --- | --- | --- |
| Images and runtime | Dependencies/ABI, B300 operations, 8-GPU communication | Hybrid-model support, real updates, saving, policy synchronization |
| RL training | Stage timing and long-context paths | Actor/IG optimization, Partial, continuous Eval, recovery |
| Tool server | Request and streaming-state observability | Go migration, two-level caching, failure-subset retries, cancellation, Judge semantics |

Early compute-only checks disabled tools and Judge; they do not replace real Deep Research training validation.

### 2.2 Qwen3.5 × B300: a working hybrid-model stack

In the September real-tool runs, GRPO and IGPO each completed 384 trajectories, 3 Actor updates, and a final checkpoint.

| Layer | Work |
| --- | --- |
| Model and kernels | Separate support for standard attention and GatedDeltaNet, with position and long-context checks |
| Training and conversion | VERL, Megatron-Core, MBridge, Transformer Engine |
| Inference and hardware | SGLang, Triton, one machine with 8×B300 |
| End-to-end validation | Real Search/Visit/Judge, 8-rank updates, saving, synchronization, normal exit |

The scope is the actual Qwen3.5-4B configuration; larger-model Eval or installation on three machines does not replace training validation.

### 2.3 Tool server: caching, fallback, and lifecycle

The tool chain retains successful results and propagates failures and cancellation to the work that actually runs.

<figure class="talk-figure tr-figure" data-talk-figure="tool-stack" lang="en" aria-labelledby="talk-tool-stack-title">
<p class="tf-title" id="talk-tool-stack-title">Tool server: search, reading, and summarization</p>
<div class="tr-node tr-shared tr-blue"><strong>Agent tool call</strong><small>Choose Search or Visit for the action</small></div><div class="tr-two-branch tr-tool-branch" aria-hidden="true"><span>↓</span><span>↓</span></div><div class="tr-two tr-tools" role="group" aria-label="Alternative tools"><div class="tr-panel"><p class="tr-panel-heading">Search</p><div class="tr-node tr-search-card tr-soft-blue"><strong>Search service</strong><small>Rate limits · request cache</small></div></div><div class="tr-panel"><p class="tr-panel-heading">Visit</p><div class="tr-node tr-peach"><strong>Reader</strong><small>Content cache</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-peach"><strong>Summary</strong><small>Summary cache</small></div></div></div><div class="tr-join" aria-hidden="true"></div><div class="tr-node tr-shared tr-green"><strong>Structured results + per-item errors</strong><small>Return to the next Agent context</small></div>
<figcaption>Figure 3 · Keep successful items and retry failures only. Cancellation follows the execution handle; capacity is released after running work exits.</figcaption>
</figure>

- **Go services and two-level caching**: Reader-body cache plus goal-dependent summary cache; a new goal can reuse the body.
- **Failure-subset retries**: retain successful URL/query items and retry only failed items within the original deadline.
- **Cancellation**: locate the executor handle for queued work; running threads retain capacity until exit. In-process checks do not prove remote HTTP termination.

### 2.4 Tool observability: from timeouts to specific stages

Link request IDs, Reader/Summary stages, retries, and cache states to trace a failed tool call to the work that ran.

| Scope | Observation |
| --- | --- |
| 2,218 logical Visit calls | 52 business failures: 47 attributed to Reader, 5 to Summary |
| Targeted reproduction of 46 historical failure URLs | 73 Reader attempts; all 42 timeouts waited for response headers |
| Central dashboard | 6 instances each of Search/Visit/Router, 10 Summary instances |

A business failure may still return HTTP 200. The wait was localized to Reader; the split among upstream queueing, fetching, and rendering remains unresolved.

### 2.5 Judge: available service, trustworthy judgments

Build bounded service calls and semantic checks together, so technical failures and uncertain answers do not silently become incorrect rewards.

- **Service**: unify four model routes with fallback, rate limits, deadlines, and recoverable task identity while preserving the legacy interface.
- **Semantics**: review 36,601 historical requests and confirm 172 misjudgments; repair alias, unit, year, and citation handling.
- **Repair check**: expected handling rose from 38 to 40 cases on the same 40-case development panel, including 2 required unknown outcomes.

40/40 describes final handling on that development panel; production acceptance actually exercised one route. Response reuse and denominators are detailed in Appendix B03.

### 2.6 End-to-end timing: scoring waits are inside rollout

A near-zero reward timer does not mean Judge has negligible cost.

| One step on 2026-09-18 | Time | Scope |
| --- | --- | --- |
| Complete iteration | 5411.207 s | Driver whole-step wall time |
| generate / rollout stage | 2859.381 s | Includes tools and scoring postprocessing |
| Actor update | 1609.646 s | Driver stage |
| Judge client | 881.243 s / 154 calls | Sum of concurrent requests, already inside generate |
| reward | 0.000167 s | Reading existing results |

Do not add cumulative Judge time again to whole-step wall time; Appendix B04 retains the complete stage table.

### 2.7 Actor: persistent compilation cache and dynamic-shape specialization

A fixed Actor replay fell from 1925.391 s to 656.149 s with retained cache, but strict numerical equivalence failed.

<figure class="talk-figure" data-talk-figure="actor-cache" lang="en" aria-labelledby="talk-actor-cache-title">
<p class="tf-title" id="talk-actor-cache-title">Fixed-input Actor replay: persistent-cache timing</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/actor-cache-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Fixed-input Actor replay: persistent-cache timing"><img src="/figures/agentic-rl-talk/actor-cache-en.svg" alt="The same 256 trajectories in two fresh processes: 1925.39 seconds with empty cache and 656.15 seconds with retained cache. Strict numerical equivalence failed." loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>Figure 4 · Fixed-input Actor-only timing in two fresh processes, not end-to-end speedup. Strict numerical equivalence failed. <a class="tf-caption-link" href="/figures/agentic-rl-talk/actor-cache-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

- Both were new processes; observable compilation misses fell from 19,718 to 0. **65.92% is a single-stage performance observation.**
- Cold/warm updates were not numerically equivalent, so losslessness is not established. Later controlled NB gradient/master equality is separate evidence.
- Persistent caching and convolution NB de-specialization entered a real three-step run together; autotuning remained enabled, with no additional observable Actor JIT entries in the last two steps.

### 2.8 IG scoring: fewer projections, reusable context

Project only target prediction rows and reuse rollout context, while checking target tokens, three-axis mRoPE, and policy versions.

| Validated scope | Observation |
| --- | --- |
| Fixed Qwen3 component workload | Median latency 158.56 → 87.65 ms |
| Fixed Qwen3.5 workload with 12 target tokens | Incremental peak memory approximately 1.21 → 0.191 GB; scoring error 0 on this workload |
| Attached path in a real three-step IGPO run | 5,224 score calls, 0 failures; mean 63.5 ms, P95 147.6 ms |

Component comparisons and actual-call distributions use different workloads; they are not a single speedup series. Policy-version changes require boundary rescoring.

### 2.9 Partial: less waiting, complete groups and versions retained

A task pool supports pause/resume while training admits complete groups and retains behavior versions.

<figure class="talk-figure tr-figure" data-talk-figure="partial-scheduling" lang="en" aria-labelledby="talk-partial-scheduling-title">
<p class="tf-title" id="talk-partial-scheduling-title">Partial: retain task state and deliver complete groups</p>
<div class="tr-two tr-schedule"><div class="tr-panel"><p class="tr-panel-heading">Synchronous batch</p><div class="tr-node "><strong>Start the whole batch</strong><small>One batch of tasks</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node "><strong>Wait for the whole batch</strong><small>Completion is set by the longest trajectory</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Actor update</strong><small>Then begin the next batch</small></div></div><div class="tr-panel"><p class="tr-panel-heading">Partial rollout</p><div class="tr-node tr-soft-blue"><strong>Persistent task pool</strong><small>Keep unfinished trajectories</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>Complete groups ready</strong><small>Deliver whole groups; retain the rest</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Phase transition</strong><small>Pause rollout → update Actor → resume</small></div></div></div>
<figcaption>Figure 5 · Scheduling relationships, not a time scale. Shared GPUs switch between rollout and Actor phases; complete groups and policy versions are retained.</figcaption>
</figure>

- Four formal arms each used 96 questions × 8 trajectories, or 768 per arm, retaining groups, ready buffers, and cross-version records.
- Observed container wall time fell by 11.41% for GRPO and 7.46% for IGPO.
- Tool, cache, trajectory, and correction differences limit attribution to scheduling and do not establish long-term off-policy losslessness.

### 2.10 Continuous Eval: replenish as tasks finish

Both groups completed generation and scoring on the same 512 questions; full-Eval time fell from 4505.21 s to 4126.03 s, an observed 8.42% reduction.

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="en" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">Scheduling observations for a complete Eval</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Scheduling observations for a complete Eval"><img src="/figures/agentic-rl-talk/eval-scheduling-en.svg" alt="Two complete Evals on the same 512 questions and model, with a zero-based wall-time axis." loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>Figure 6 · Shared tools, caching, and stochastic outputs limit causal attribution; individual-request latency also increased. <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

- Maintain active tasks to reduce idle capacity at batch tails.
- Stochastic outputs, shared tools, and caching limit precise causal attribution; individual-request latency increased.
- Standalone Eval and training-time Validate have separate lifecycles; this does not establish that both automatically use the same path.

### 2.11 Data and recovery: reaching actual consumption

A recoverable system needs versioned data and complete state, beyond a successful load.

| Delivery | Actual scope |
| --- | --- |
| Fixed training version | 6,994 = 6,315 originals + 679 revisions; usable does not mean error-free gold data |
| Priority research set | 512 records frozen independently, not a simple union with the 6,994 |
| A009 recovery | Resume after 8 saved updates, add 47: 55 model-path updates and 28 policy publications |
| Saving and consumption | Mixed batches, updates, sync, and subsequent validation; reconnect model, optimizer, and applicable data/sampling state |

Recovery must cross mixed batches, actual updates, and subsequent sampling; loading state alone does not establish correct continued training.

## 3. Algorithm Exploration: IGPO → CTF-IGPO

### 3.1 IGPO: intermediate feedback for information acquisition

[IGPO](https://arxiv.org/abs/2510.14967) builds turn-level signals from changes in the policy's probability of the correct answer, supplementing outcome supervision.

<figure class="talk-figure tr-figure" data-talk-figure="igpo-signal" lang="en" aria-labelledby="talk-igpo-signal-title">
<p class="tf-title" id="talk-igpo-signal-title">IGPO: from final rewards to turn-level feedback</p>
<div class="tr-panel tr-trajectory"><p class="tr-panel-heading">Multi-turn interaction within one task</p><div class="tr-three-flow"><div class="tr-node tr-soft-blue"><strong>Turn 1</strong><small>Action → observation</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>Later turns</strong><small>Action → observation</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Final answer</strong></div></div></div><p class="tr-supervision">Training supervision · reference answer used for scoring</p><div class="tr-ig-sources"><div class="tr-panel"><p class="tr-panel-heading">Turn-level process signal</p><div class="tr-score-pair"><div class="tr-node tr-yellow"><strong>Score before observation</strong></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>Score after observation</strong></div></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>Change in reference-answer score</strong></div></div><div class="tr-panel tr-ig-result"><p class="tr-panel-heading">Final-outcome supervision</p><div class="tr-node tr-green"><strong>Answer quality</strong><small>Final outcome</small></div></div></div><div class="tr-join tr-ig-join" aria-hidden="true"></div><div class="tr-node tr-shared tr-blue"><strong>Train with process and outcome signals</strong></div>
<figcaption>Figure 7 · IGPO adds turn-level feedback to outcome supervision. A score difference is a training proxy, not identified causal information value.</figcaption>
</figure>

- Identical final success/failure labels do not distinguish the contribution of intermediate interactions.
- Process scores provide denser feedback, but remain proxies rather than factual reliability or causal action value.
- Align scoring context, target span, prediction rows, and weight version.

### 3.2 Flash-IGPO: single trajectories and batch-level training

One trajectory per question broadens coverage while changing advantage statistics and sampling organization.

- The formal run covered 768 distinct questions, n=1, with 3 effective updates and complete workload draining.
- Process/outcome credit follows the corresponding batch rules, not same-question multi-sample GRPO normalization.
- The old 96×8 and new 768×1 differ in exposure; functional capacity does not establish a causal speedup or long-term quality gain.

### 3.3 CTF-IGPO: actions carry subsequent costs

**Cost-to-Go Augmented Flash-IGPO** subtracts a cost penalty covering the current turn through termination from the original advantage.

- Sum the recorded cost suffix, including the current turn, with discount 1; failed trajectories retain incurred costs.
- The first version counted generated tokens and tool calls; the complete prototype used a logical-turn charge plus returned generated tokens/1000.
- Account separately for the actual resources used by tools, prefill, scoring, training, and recovery.

### 3.4 Separate quality normalization from IG scaling

Treat quality, process, and cost separately so their statistical units and strengths are explicit.

| Version layer | Main choice |
| --- | --- |
| Complete v0 | ReBN over outcome + IG, then subtract cost |
| Separated version | Batch normalization over valid turns (ReBN) for quality only; add IG and cost outside, without final renormalization |
| IG credit | Observation-conditioned difference → suffix → first-batch RMS scaling → success gating / positive credit / stage switch |

Each choice retains its own evidence. Normalization, gating, and positive credit were not individually proven optimal; a first-batch replay does not validate the full phase schedule.

### 3.5 CTF-PW: preweight cost, then use one PPO objective

Adjust the cost channel's token weight by turn before combining advantages, retaining the quality and IG paths.

<figure class="talk-figure tr-figure" data-talk-figure="ctf-objective" lang="en" aria-labelledby="talk-ctf-objective-title">
<p class="tf-title" id="talk-ctf-objective-title">CTF-IGPO: PW advantage and update structure</p>
<div class="tr-cost-inputs"><div class="tr-node tr-green"><strong>Quality</strong><small>Normalize separately</small></div><div class="tr-node tr-yellow"><strong>Information gain</strong><small>Calibrate / gate separately</small></div><div class="tr-node tr-peach"><strong>Cost-to-go</strong><small>Accumulate from this turn → preweight by turn</small></div></div><div class="tr-join tr-join-three" aria-hidden="true"></div><div class="tr-node tr-combined tr-soft-blue"><strong>Combined advantage</strong><span class="tr-symbol">A<sub>Q</sub> + A<sub>IG</sub> + A<sub>C</sub></span></div><span class="tr-down" aria-hidden="true"></span><div class="tr-update"><div class="tr-node tr-blue"><strong>One PPO / dual-clip</strong><small>Applied to the total advantage</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>Actor update</strong></div></div>
<figcaption>Figure 8 · PW recipe: no renormalization after combination; all signals share one clipping operator. This structure is not a claim of optimality.</figcaption>
</figure>

- Only cost receives `D_m/(K_m·n_t)`: valid tokens in the minibatch / nonempty valid turns in that minibatch / valid tokens in that turn.
- Feed the combination to the original single PPO/dual-clip and token-mean reduction, rather than clipping components separately.
- This executed recipe became an optimization reference, not a mixture of historical best components or statistically established stable gains. Formulas: Appendix B01.

## 4. Experimental Results and Findings

### 4.1 A positive point estimate in a bounded short run

PW scored 133/246, the trained control 122/246, and the initial SFT reference 124/246.

<figure class="talk-figure" data-talk-figure="short-run-results" lang="en" aria-labelledby="talk-short-run-results-title">
<p class="tf-title" id="talk-short-run-results-title">Fixed short-run experiment: initial, control, and PW</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/short-run-results-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Fixed short-run experiment: initial, control, and PW"><img src="/figures/agentic-rl-talk/short-run-results-en.svg" alt="On 246 development questions, initial SFT answered 124 correctly, the trained control 122, and PW 133." loading="lazy" decoding="async" width="768" height="320"></a>
<figcaption>Figure 9 · Fixed 256 training inputs and two updates; 246 development questions. Stable gains over the trained control are not established. <a class="tf-caption-link" href="/figures/agentic-rl-talk/short-run-results-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

- **Training dose**: 256 fixed saved inputs and 2 Adam updates; evaluation used an exposed 246-question development panel.
- **Versus the trained control**: +11 correct, mean rounds −2.668%, total tokens −4.209%, pooled tokens/round −1.583%.
- Statistical evidence remains insufficient for stable gains. Mean rounds were still +0.164% versus SFT, so overall RL compression was not established.

### 4.2 Complete 55-update runs: none met the joint objective

All three training runs completed, but none simultaneously preserved quality, reduced rounds, and met the length constraint.

<figure class="talk-figure" data-talk-figure="complete-quality" lang="en" aria-labelledby="talk-complete-quality-title">
<p class="tf-title" id="talk-complete-quality-title">Quality across three complete training runs</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/complete-quality-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Quality across three complete training runs"><img src="/figures/agentic-rl-talk/complete-quality-en.svg" alt="Three panels preserve eight quality nodes each: original 120 to 1, weight cap 115 to 0, fixed cost 106 to 2; 246 questions per node." loading="lazy" decoding="async" width="768" height="420"></a>
<figcaption>Figure 10 · 55 model-path updates per run and 246 questions per node; dashed lines are each run’s own initial values. None passed the joint quality-and-cost objective; no fair cross-run ranking is claimed. <a class="tf-caption-link" href="/figures/agentic-rl-talk/complete-quality-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

- Each used 6,994 members and 55 model-path updates; nodes 0/8/16/24/32/40/48/55 each evaluated 246 questions.
- Final correct counts were 1, 0, and 2 for the original, weight-cap, and fixed-cost runs; their respective initial counts were 120, 115, and 106.
- Each has its own initial state and history, not a fair cross-run causal ranking. The short-run 133 is not a starting point on these curves. Complete Q/R/T/U: Appendices B06–B08.

### 4.3 Repaired defects and degradation causes are separate

Validating a specific repair does not explain degradation over complete training runs.

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| Same 357 outputs: ERROR → END | Parser acceptance changed | Every answer was correct |
| 9 equal-reward groups, 72 members: advantages/returns exactly 0 | A numerical invariant was restored | No KL or optimizer-driven update in the step |
| Recovery path and actual consumption of incident-exposed trajectories | Interface repair or exposure | A fix's quality contribution, specific parameter damage, or the sole cause of degradation |

KL, off-policy behavior, and learning-mechanism explanations still need comparisons; these repairs did not rule them out.

### 4.4 Deliverables and next questions

A system for continued research is in place; long-term quality-preserving compression remains unresolved.

- **Delivered**: runtime, tool server, judging, sampling, updates, synchronization, recovery, and complete evaluation.
- **Retained**: data versions, algorithm differences, full curves, failures, and recovery costs for subsequent comparisons.
- **Open**: an effective quality baseline and conditions for stable process/cost gains.

## Appendix: Formulas, Complete Data, and Validation Scope

### B01 CTF recipe: credit, scale, and updates

These formulas describe executed versions, not individually optimal components.

```text
Complete v0: A = ReBN_valid-turn(R + β·G_I) − λ·G_C
Separated:  A = ReBN_valid-turn(R) + I_eff − λ·G_C
Cost:       c_t = 1 + N_returned,t / 1000
            G_C,t = Σ(k=t…T) c_k
IG credit:  G_I,t = Σ(k=t…T−1) δ_k; terminal intrinsic reward is 0
            β = η / RMS(G_I,raw)
            I_eff,t = m_s · max(β·R_i·G_I,t, 0)
PW:         A'_t = A_Q,t + I_eff,t − λ·G_C,t · D_m/(K_m·n_t)
```

- Scale first-batch raw, ungated, signed IG suffixes before truncation; truncate weighted suffix credit, not raw increments or total advantages.
- `n_t` counts valid policy tokens across spans of the original logical turn; reuse it after packing, without dividing by zero or deleting zero-active members.
- PW retains ordered FP32, one PPO objective, and token means. Combined clipping can change signs and branches; independent cost-gradient equivalence is not claimed.

| Actual short-run version | Configuration |
| --- | --- |
| Fixed inputs | 256; minibatch 128×2; 2 Adam updates, 1 scheduler step |
| Learning rate / KL | 5e−7 / 0.001 |
| λ | 0.005660749929284128 |
| PPO clip / dual-clip | [0.8, 1.28] / 3 |
| IG activation | Inherited first-batch effective IG, m=1; not validation of a full early-off schedule |

### B02 Actor performance and numerical qualification

Later NB qualification does not repair the numerical failure of the earlier cold/warm cache comparison.

| Evidence | Performance record | Numerical boundary |
| --- | --- | --- |
| Fixed 256-trajectory Actor replay, NB disabled | New process with empty cache 1925.391 s; retained cache 656.149 s | Strict equivalence failed; update-relative L2 difference 5.61%, not a quality-loss percentage |
| Initial NB comparison | 1913.536 → 1197.195 s | Autotuning not fully controlled; 37.44% cannot be attributed entirely to NB |
| Later controlled NB check | No isolated speedup estimate | 8-rank postclip gradients and initial/final master tensors were bitwise equal |
| Combined real three-step run | Actor 973.715 / 752.250 / 655.359 s | Different tokens/microbatches; not single-component causality |

Persistent caching and de-specialization reduce repeated compilation; numerical behavior, throughput, and end-to-end effects are validated separately.

### B03 Tool and Judge denominators

Requests, URLs, attempts, panel cases, and events are different units.

| Scope | Full accounting |
| --- | --- |
| Historical Judge review | 36,601 task_id requests = 29,122 training + 7,479 Eval; 7 legacy requests separate |
| Confirmed misjudgments | 71 FN + 101 FP = 172; supported and unresolved evidence separate, not an overall error rate |
| Development-panel fix | 32 ordinary + 8 boundary, including 2 unknowns; final 40/40 match, primary 39/40 |
| Actual response use | 41 existing + 1 new review, not an independent 40-question retest; the historical count provides no newer case-by-case revalidation of all 172 |
| Four-provider service acceptance | 1 logical request, 1 primary upstream attempt; not a four-route load test or proof of RL adoption |
| Original Visit window | 2,218 logical calls, 52 business failures = 47 Reader + 5 Summary; all HTTP 200 |
| Targeted Reader reproduction | 47 historical failures deduplicated to 46 URLs; 73 attempts = 23 success + 42 timeout + 8 invalid_payload |

All 42 timeouts waited for response headers; this does not distinguish upstream queueing, fetching, or rendering.

### B04 Complete timing and scheduling observations

The gains cover different experiments and cannot be added or multiplied into a total speedup.

| Stage on 2026-09-18 | Seconds | Unit |
| --- | --- | --- |
| iteration | 5411.207 | Driver wall time |
| generate | 2859.381 | Already includes tool/scoring postprocessing |
| old-logprob | 734.510 | Driver stage |
| reference | 165.967 | Driver stage |
| Actor update | 1609.646 | Driver stage |
| Cumulative Judge | 881.243 | Sum over 154 concurrent calls |
| reward | 0.000167 | Reading results |

| Scheduling observation | Original seconds | New seconds | Complete workload |
| --- | --- | --- | --- |
| GRPO synchronous → Partial | 10828.329 | 9593.208 | 768 trajectories per arm |
| IGPO synchronous → Partial | 11678.676 | 10807.729 | 768 trajectories per arm |
| batch256 → continuous active256 Eval | 4505.21 | 4126.03 | 512 questions generated and scored per group |

Tools, caches, trajectories, and stochastic outputs limit causal interpretation; request sums and cross-rank durations are not wall time.

### B05 Data, model paths, and recovery rework

Model-path updates and physically executed work are recorded separately.

| Item | Count and scope |
| --- | --- |
| Original training pool | 8,640; structural validity does not establish factual correctness |
| Fixed usable version | 6,994 = 6,315 originals + 679 revisions |
| Priority research set | 512 frozen independently, not a simple union |
| Known errors / substantive disputes | 835 / 767 withheld; historical inputs and scores retained |
| A009 | 8 saved updates + 47 new = 55 on the model path; 28 publications |
| Fixed-cost first attempt | 22 successful updates |
| Fixed-cost recovery point | 16 saved updates |
| Fixed-cost continuation | 39 new updates |
| Fixed-cost totals | 55 model-path updates; 61 physically successful updates; 6,994 model-path members |

Do not multiply optimizer updates by rank count; recovery rework stays in resource accounting.

### B06 Original combination: complete Q/R/T/U

Every node has 246 questions: Q is number correct, R mean logical rounds, T total returned generated tokens on the panel, and U=ΣT/ΣR.

<figure class="talk-figure" data-talk-figure="training-a009" lang="en" aria-labelledby="talk-training-a009-title">
<p class="tf-title" id="talk-training-a009-title">Complete curves for the original combination</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the original combination"><img src="/figures/agentic-rl-talk/training-a009-en.svg" alt="Original combination: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>Figure 11 · All eight nodes; gray dashed lines mark this run’s initial values. Metric scales match across all three figures. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

| Path updates | Number correct | Mean rounds | Total generated tokens | Tokens/round (pooled) |
| --- | --- | --- | --- | --- |
| 0 | 120 | 45.805 | 5245056 | 465.482 |
| 8 | 117 | 33.854 | 4109116 | 493.410 |
| 16 | 111 | 33.516 | 5156335 | 625.389 |
| 24 | 85 | 28.785 | 6418762 | 906.477 |
| 32 | 49 | 15.833 | 4846495 | 1244.286 |
| 40 | 21 | 5.541 | 3683373 | 2702.401 |
| 48 | 2 | 2.366 | 3414906 | 5867.536 |
| 55 | 1 | 1.707 | 3425488 | 8155.924 |

### B07 Update weight cap: complete Q/R/T/U

Each run retains its own initial reference; cross-run curve heights do not establish a component's causal effect.

<figure class="talk-figure" data-talk-figure="training-cap2" lang="en" aria-labelledby="talk-training-cap2-title">
<p class="tf-title" id="talk-training-cap2-title">Complete curves for the update weight cap</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the update weight cap"><img src="/figures/agentic-rl-talk/training-cap2-en.svg" alt="Update weight cap: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>Figure 12 · All eight nodes; gray dashed lines mark this run’s initial values. Metric scales match across all three figures. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

| Path updates | Number correct | Mean rounds | Total generated tokens | Tokens/round (pooled) |
| --- | --- | --- | --- | --- |
| 0 | 115 | 36.138 | 4113637 | 462.726 |
| 8 | 117 | 43.163 | 5358615 | 504.673 |
| 16 | 111 | 40.183 | 6211042 | 628.330 |
| 24 | 85 | 26.683 | 6498177 | 989.972 |
| 32 | 52 | 14.037 | 4810916 | 1393.257 |
| 40 | 7 | 4.463 | 3790360 | 3452.058 |
| 48 | 1 | 2.183 | 3397617 | 6327.034 |
| 55 | 0 | 1.573 | 3348536 | 8652.548 |

### B08 Fixed cost scale: complete Q/R/T/U

All eight nodes are retained; decimals are rounded to three places for display, without recomputing evaluation or statistics. U is not the mean of per-question ratios.

<figure class="talk-figure" data-talk-figure="training-fixed-cost" lang="en" aria-labelledby="talk-training-fixed-cost-title">
<p class="tf-title" id="talk-training-fixed-cost-title">Complete curves for the fixed cost scale</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the fixed cost scale"><img src="/figures/agentic-rl-talk/training-fixed-cost-en.svg" alt="Fixed cost scale: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>Figure 13 · All eight nodes; gray dashed lines mark this run’s initial values. Metric scales match across all three figures. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

| Path updates | Number correct | Mean rounds | Total generated tokens | Tokens/round (pooled) |
| --- | --- | --- | --- | --- |
| 0 | 106 | 36.528 | 4268496 | 475.016 |
| 8 | 116 | 43.862 | 4985308 | 462.030 |
| 16 | 114 | 46.537 | 5376493 | 469.645 |
| 24 | 86 | 51.817 | 6813833 | 534.544 |
| 32 | 58 | 29.813 | 4667599 | 636.433 |
| 40 | 13 | 9.955 | 3603415 | 1471.382 |
| 48 | 5 | 5.199 | 3286799 | 2569.819 |
| 55 | 2 | 3.764 | 2897535 | 3129.087 |
