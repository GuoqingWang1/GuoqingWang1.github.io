---
title: "Deep Research Agent RL: Systems and Algorithm Exploration"
description: "Deep Research pipelines, infrastructure and efficiency, IGPO to CTF-IGPO, and short-run and complete experimental results."
category: technical
lang: en
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T08:12:50+08:00"
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

### 1.2 Agent loop: reason, call a tool, observe, reason again

<figure class="talk-figure al-figure" data-talk-figure="inference-pipeline" lang="en" aria-labelledby="talk-inference-pipeline-title">
<p class="tf-title" id="talk-inference-pipeline-title">Deep Research Agent loop</p>
<div class="al-flow"><div class="al-node al-question">Question</div><span class="al-arrow" aria-hidden="true"></span><div class="al-cycle"><div class="al-turn"><div class="al-node ">Think</div><span class="al-arrow" aria-hidden="true"></span><div class="al-node ">Tool call</div><span class="al-arrow" aria-hidden="true"></span><div class="al-node al-observation">Tool response</div></div><div class="al-repeat"><span>Repeat as needed · zero or more times</span></div></div><span class="al-arrow" aria-hidden="true"></span><div class="al-finish"><div class="al-node ">Think</div><span class="al-arrow" aria-hidden="true"></span><div class="al-node al-answer">Answer</div></div></div>
<figcaption>The Agent decides whether to call another tool or answer with the information already available.</figcaption>
</figure>

## 2. Infrastructure and Efficiency

### 2.1 Objective: less repeated work, less waiting, recoverable runs

Deep Research training combines GPU computation, multi-turn sampling, and external services. Four modules make the system runnable and reduce repeated computation, tail waits, and recovery work.

<figure class="talk-figure im-figure" data-talk-figure="infra-map" lang="en" aria-labelledby="talk-infra-map-title">
<p class="tf-title" id="talk-infra-map-title">Infra: supporting a complete research iteration</p>
<div class="im-modules" role="group" aria-label="Four cooperating capabilities for research iteration"><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="5"/><path d="m13 13 4 4M16 4h5M16 8h5M4 20h7m5 0 2 2 4-5"/></svg><strong>Tools and judging</strong></div><div class="im-lines"><span>Search / Visit caches · concurrency</span><span>Retries and cancellation · Judge</span></div></div><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/></svg><strong>Training compute</strong></div><div class="im-lines"><span>Qwen / B300 stack · Actor optimization</span><span>Compiler cache / kernels · IG and logprob</span></div></div><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 5h13M3 10h9M3 15h6"/><circle cx="17" cy="16" r="5"/><path d="M17 13v3l2 1"/></svg><strong>Sampling and evaluation</strong></div><div class="im-lines"><span>Partial · complete groups and versions</span><span>Continuous scheduling · complete Eval</span></div></div><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 4 6v6c0 4.7 4.2 7.5 8 9 3.8-1.5 8-4.3 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg><strong>Reliable execution</strong></div><div class="im-lines"><span>Data versions · save and restore</span><span>Observability · result archives</span></div></div></div><div class="im-connector" aria-hidden="true"></div><div class="im-objective"><span class="im-objective-label">Optimization objectives</span><strong>Less repeated work · shorter waits · recoverable complete experiments</strong></div>
</figure>

### 2.2 Tools and judging: reusable services for external dependencies

#### Tool Server: request paths and engineering changes

Follow the Search and Visit paths through execution, cache reuse, Summary handling, and result delivery. Blue numbers mark engineering work; green arrows mark cache-hit shortcuts.

<figure class="talk-figure tool-architecture" data-talk-figure="tool-stack" lang="en" aria-labelledby="talk-tool-stack-title">
<p class="tf-title" id="talk-tool-stack-title">Tool Server: request paths and engineering changes</p>
<div class="tool-architecture-scroll" role="region" aria-label="Open full-size framework" tabindex="0"><a class="talk-plot-link" href="/figures/agentic-rl-talk/tool-server-framework-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size framework"><img src="/figures/agentic-rl-talk/tool-server-framework-en.svg" alt="Detailed Tool Server framework: admission branches into Search or Visit; valid cache hits return directly and misses call upstream services. Each Summary attempt is validated before budgeted retry or fallback. Blue01–07 mark engineering changes." width="1600" height="1060" loading="lazy" decoding="async"></a></div>
<figcaption>Search and Visit are alternative paths; cache validity, fallback, and retries retain their identity, version, and budget constraints. <a class="tf-caption-link" href="/figures/agentic-rl-talk/tool-server-framework-en.svg" target="_blank" rel="noopener noreferrer">Open full-size framework ↗</a><span class="tool-scroll-hint">Scroll horizontally on a narrow screen.</span></figcaption>
</figure>

<details class="tool-change-notes"><summary>Engineering changes in the diagram</summary><ol><li><strong>01 Request admission and execution</strong><span>Connect the Python-to-Go service path while preserving interface compatibility. Retain successful batch items and retry failed items only within the original deadline. Cancellation targets the execution handle; running work releases capacity only after exit.</span></li><li><strong>02 Search-result caching</strong><span>Isolate by tool, query parameters, and version. Hits skip repeated upstream searches. Structural checks govern cache eligibility; storage errors do not rewrite successful tool outcomes.</span></li><li><strong>03 Two semantic Visit caches</strong><span>Separate Reader bodies from goal-dependent final summaries. Valid final hits skip Reader fetching and Summary; a new goal can reuse the body after a final-cache miss.</span></li><li><strong>04 Summary routing</strong><span>Select primary, bounded fallback, and long-input routes by configuration. Routes retain the original remaining budget and the actual source identity.</span></li><li><strong>05 Validate every attempt</strong><span>Check the response, JSON, refusal, and filtering before deciding whether an allowed failure can retry or use fallback. Only validated primary or fallback results qualify for final caching.</span></li><li><strong>06 Cache identity and durability</strong><span>Check goal, model, prompt, version, content dependencies, and expiry; the 365-day TTL default is configurable. Process-local coalescing is not a cross-replica lock, and queued is not durable. Multimodal finals are separate; Reader bodies and locks may be shared.</span></li><li><strong>07 End-to-end observation</strong><span>Link root requests, upstream attempts, Reader/Summary, and cache events. Durable spools, paginated reads, and acknowledgments support the central dashboard, distinguishing hits, writes, errors, cancellations, and missing telemetry.</span></li></ol></details>

#### LLM Judge: durable tasks, bounded execution, explicit semantics

Judge evolved from a scoring call into a task service shared by training and evaluation.

| Module | Implemented work | Role in training and evaluation |
| --- | --- | --- |
| Tasks and results | Durable tasks, identity-based deduplication, status queries, result reuse, and recovery | Resume interruptions without repeating completed scoring |
| Execution | Worker queues, shared quotas, rate limits, primary/fallback routes, conditional review | Attempts and deadlines belong to the same task; recovery does not reset its budget |
| Scoring semantics | Strict output checks; aliases, units, years, and citations; preserve unknown | Do not silently turn uncertainty or technical failure into an incorrect reward of 0 |
| Consumers and observation | Separate generation/scoring, preserve legacy interfaces, select new protocols explicitly, persist events and collect them centrally | Identify the actual model route, scoring state, and failure location |

Reviewing 36,601 historical requests confirmed 172 misjudgments. On a separate 40-case development panel, expected handling rose from 38 to 40, including 2 required unknown outcomes. Production acceptance of the four-route service actually exercised one route; detailed denominators are in Appendix B03.

### 2.3 Training computation: runtime, Actor, and IG scoring

#### Establish a repeatable path into real training

Qwen3.5's hybrid architecture, B300 kernels, training frameworks, and inference engines must work together; successful imports are only the beginning.

| Layer | Work |
| --- | --- |
| Images and kernels | Pin dependencies and ABI; support standard attention, GatedDeltaNet, and long-context paths separately |
| Training and inference | Connect VERL, Megatron-Core, MBridge, Transformer Engine, and SGLang; validate training-to-inference weight conversion |
| Trajectories and numerics | Preserve actual action tokens, behavior logprobs, masks, and policy versions; distinguish old/ref from rollout probabilities |
| Full lifecycle | On 8×B300, GRPO and IGPO each completed 384 real-tool trajectories, 3 Actor updates, final saving, and weight synchronization |

#### Reduce repeated compilation and unnecessary scoring work

- **Actor**: persist compilation artifacts, isolate cache environments, reduce repeated convolution specialization for dynamic shapes, retain autotuning, and validate integration in real three-step training.
- **IG scoring**: project target prediction rows only, check three-axis mRoPE, reuse rollout context, and handle scoring boundaries across policy versions.
- **End-to-end diagnosis**: connect timing across rollout, tools/Judge, old/ref, Actor, synchronization, and saving; optimize the observed critical path.

The fixed Actor cache replay observed 1925.39→656.15 seconds, but strict numerical equivalence failed; this is not a lossless-speedup result. That comparison and the later independent NB check remain in Appendix B02.

### 2.4 Sampling and evaluation: reduce idle capacity at the tail

#### Partial rollout: keep unfinished work and deliver complete groups

<figure class="talk-figure tr-figure" data-talk-figure="partial-scheduling" lang="en" aria-labelledby="talk-partial-scheduling-title">
<p class="tf-title" id="talk-partial-scheduling-title">Partial: retain task state and deliver complete groups</p>
<div class="tr-two tr-schedule"><div class="tr-panel"><p class="tr-panel-heading">Synchronous batch</p><div class="tr-node "><strong>Start the whole batch</strong><small>One batch of tasks</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node "><strong>Wait for the whole batch</strong><small>Completion is set by the longest trajectory</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Actor update</strong><small>Then begin the next batch</small></div></div><div class="tr-panel"><p class="tr-panel-heading">Partial rollout</p><div class="tr-node tr-soft-blue"><strong>Persistent task pool</strong><small>Keep unfinished trajectories</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>Complete groups ready</strong><small>Deliver whole groups; retain the rest</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Phase transition</strong><small>Pause rollout → update Actor → resume</small></div></div></div>
<figcaption>Scheduling relationships, not a time scale. Shared GPUs switch between rollout and Actor phases; complete groups and policy versions are retained.</figcaption>
</figure>

Task pools, ready buffers, policy versions, pause/resume, and IG boundary rescoring jointly support Partial. Shared GPUs still switch between generation and update phases.

- Four formal arms each retained 96 questions × 8 trajectories, or 768 per arm, including the final tails.
- Observed container time fell by 11.41% for GRPO and 7.46% for IGPO; long-term quality and off-policy effects remain separate questions.

#### Continuous Eval: replenish as tasks finish

Maintain active tasks and separate generation from scoring postprocessing, instead of waiting for the slowest sample in every batch before admitting the next.

All 512 questions completed generation and scoring. Full Eval fell from 4505.21 to 4126.03 seconds, an observed 8.42% reduction; per-request latency increased. Standalone Eval adopted continuous replenishment, while training-time Validate retained its own path.

### 2.5 Run reliability: continue research after interruptions

Data versions, complete state, and observation identities connect sampling, updates, saving, and recovery to reduce lost work and repeated computation.

| Module | Delivery |
| --- | --- |
| Data versions | 6,994 usable exact versions: 6,315 original + 679 revised; a separate frozen 512-question research set, with sources and revision records |
| Save/restore | Connect model, optimizer, data cursor, and applicable sampling state; handle mixed batches, formats, retention, and completeness checks |
| Actual continuation | One complete run resumed after 8 saved updates and added 47, reaching 55 model-path updates and 28 policy publications |
| Observation and archiving | Link runs, steps, trajectories, requests, and policy versions; retain complete results, failures, and recovery costs |

Recovery acceptance crosses mixed batches, actual updates, and subsequent sampling. Usable data is not an error-free gold standard, and completed execution does not establish improved model quality.

### 2.6 Measured effects in the corresponding workloads

Compute optimizations reduce scoring latency and memory use; scheduling optimizations reduce waits in complete workloads.

<figure class="talk-figure" data-talk-figure="infra-benefits" lang="en" aria-labelledby="talk-infra-benefits-title">
<p class="tf-title" id="talk-infra-benefits-title">Infrastructure optimization results</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/infra-benefits-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure"><img src="/figures/agentic-rl-talk/infra-benefits-en.svg" alt="Infrastructure optimization results: IG scoring latency, incremental memory, Partial rollout, continuous evaluation." width="1024" height="672" loading="lazy" decoding="async"></a>
<figcaption>Two fixed component comparisons and complete-run observations for Partial and continuous Eval; each panel retains its own units and scope. <a class="tf-caption-link" href="/figures/agentic-rl-talk/infra-benefits-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

The panels come from separate component comparisons or scheduling experiments; gains cannot be added together. Tool Server and Judge also deliver reusable caches, bounded retries, durable recovery, and diagnosis, without claiming an unmeasured global speedup.

## 3. Algorithm Exploration: IGPO → CTF-IGPO

The training framework turns trajectories and scores into policy updates, then uses new weights for subsequent rollouts.

<figure class="talk-figure dr-figure" data-talk-figure="training-pipeline" lang="en" aria-labelledby="talk-training-pipeline-title">
<p class="tf-title" id="talk-training-pipeline-title">Deep Research · RL training pipeline</p>
<div class="dr-training-grid"><div class="dr-panel"><p class="dr-stage">01 · Rollout</p><div class="dr-three dr-entry"><div class="dr-node "><strong>Training tasks</strong><small>Questions only</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-blue"><strong>Multi-trajectory rollout</strong><small>AgentLoop · SGLang</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-soft-blue"><strong>Trajectories &amp; policy version</strong><small>Action tokens · behaviour logprob</small></div></div></div><div class="dr-flow-down" aria-hidden="true">↓</div><div class="dr-panel"><p class="dr-stage">02 · Scoring and credit</p><div class="dr-supervision"><strong>Reference answers</strong> → Judge and IG scoring only</div><div class="dr-scorers"><div class="dr-node dr-green"><strong>Judge</strong><small>Outcome quality</small></div><div class="dr-node dr-yellow"><strong>IG scoring</strong><small>Turn-level information gain</small></div><div class="dr-node dr-peach"><strong>Cost</strong><small>Interaction and generation</small></div></div><div class="dr-merge" aria-hidden="true"></div><div class="dr-node dr-advantage dr-soft-blue"><strong>Credit &amp; advantages</strong></div></div><div class="dr-actor-feed" aria-hidden="true"></div><div class="dr-panel"><p class="dr-stage">03 · VERL: update and synchronization</p><div class="dr-update-row"><div class="dr-adv-input">Combined advantage</div><span class="dr-adv-input-arrow" aria-hidden="true">↓</span><div class="dr-node dr-reference"><strong>Reference policy</strong><small>ref logprob · KL</small></div><span class="dr-arrow dr-kl-arrow" aria-hidden="true"></span><div class="dr-node dr-actor dr-blue"><strong>Actor · PPO</strong><small>Combined advantage + old logprob</small></div><span class="dr-arrow dr-sync-arrow" aria-hidden="true"></span><div class="dr-node dr-sync dr-soft-blue"><strong>Weight sync</strong><small>Publish new policy</small></div></div><div class="dr-out-branches" aria-hidden="true"><span></span><span></span></div><div class="dr-outputs"><div class="dr-node dr-soft-blue"><strong>Future rollouts</strong></div><div class="dr-node dr-green dr-eval"><strong>Development evaluation</strong><small>Q / R / T / U</small></div></div></div></div><div class="dr-save-state"><strong>Save / restore</strong><span>Model · optimizer · data cursor · Partial state</span></div>
<figcaption>References enter scoring only. The training side recomputes old/ref; development evaluation supplies no gradients. Signals and execution order depend on the recipe.</figcaption>
</figure>

### 3.1 IGPO: intermediate feedback for information acquisition

[IGPO](https://arxiv.org/abs/2510.14967) builds turn-level signals from changes in the policy's probability of the correct answer, supplementing outcome supervision.

<figure class="talk-figure tr-figure" data-talk-figure="igpo-signal" lang="en" aria-labelledby="talk-igpo-signal-title">
<p class="tf-title" id="talk-igpo-signal-title">IGPO: from final rewards to turn-level feedback</p>
<div class="tr-panel tr-trajectory"><p class="tr-panel-heading">Multi-turn interaction within one task</p><div class="tr-three-flow"><div class="tr-node tr-soft-blue"><strong>Turn 1</strong><small>Action → observation</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>Later turns</strong><small>Action → observation</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Final answer</strong></div></div></div><p class="tr-supervision">Training supervision · reference answer used for scoring</p><div class="tr-ig-sources"><div class="tr-panel"><p class="tr-panel-heading">Turn-level process signal</p><div class="tr-score-pair"><div class="tr-node tr-yellow"><strong>Score before observation</strong></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>Score after observation</strong></div></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>Change in reference-answer score</strong></div></div><div class="tr-panel tr-ig-result"><p class="tr-panel-heading">Final-outcome supervision</p><div class="tr-node tr-green"><strong>Answer quality</strong><small>Final outcome</small></div></div></div><div class="tr-join tr-ig-join" aria-hidden="true"></div><div class="tr-node tr-shared tr-blue"><strong>Train with process and outcome signals</strong></div>
<figcaption>IGPO adds turn-level feedback to outcome supervision. A score difference is a training proxy, not identified causal information value.</figcaption>
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
<figcaption>PW recipe: no renormalization after combination; all signals share one clipping operator. This structure is not a claim of optimality.</figcaption>
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
<figcaption>Fixed 256 training inputs and two updates; 246 development questions. Stable gains over the trained control are not established. <a class="tf-caption-link" href="/figures/agentic-rl-talk/short-run-results-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

- **Training dose**: 256 fixed saved inputs and 2 Adam updates; evaluation used an exposed 246-question development panel.
- **Versus the trained control**: +11 correct, mean rounds −2.668%, total tokens −4.209%, pooled tokens/round −1.583%.
- Statistical evidence remains insufficient for stable gains. Mean rounds were still +0.164% versus SFT, so overall RL compression was not established.

### 4.2 Complete 55-update runs: none met the joint objective

All three training runs completed, but none simultaneously preserved quality, reduced rounds, and met the length constraint.

<figure class="talk-figure" data-talk-figure="complete-quality" lang="en" aria-labelledby="talk-complete-quality-title">
<p class="tf-title" id="talk-complete-quality-title">Quality across three complete training runs</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/complete-quality-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Quality across three complete training runs"><img src="/figures/agentic-rl-talk/complete-quality-en.svg" alt="Three panels preserve eight quality nodes each: original 120 to 1, weight cap 115 to 0, fixed cost 106 to 2; 246 questions per node." loading="lazy" decoding="async" width="768" height="420"></a>
<figcaption>55 model-path updates per run and 246 questions per node; dashed lines are each run’s own initial values. None passed the joint quality-and-cost objective; no fair cross-run ranking is claimed. <a class="tf-caption-link" href="/figures/agentic-rl-talk/complete-quality-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
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

<figure class="talk-figure" data-talk-figure="actor-cache" lang="en" aria-labelledby="talk-actor-cache-title">
<p class="tf-title" id="talk-actor-cache-title">Fixed-input Actor replay: persistent-cache timing</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/actor-cache-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Fixed-input Actor replay: persistent-cache timing"><img src="/figures/agentic-rl-talk/actor-cache-en.svg" alt="The same 256 trajectories in two fresh processes: 1925.39 seconds with empty cache and 656.15 seconds with retained cache. Strict numerical equivalence failed." loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>Fixed-input Actor-only timing in two fresh processes, not end-to-end speedup. Strict numerical equivalence failed. <a class="tf-caption-link" href="/figures/agentic-rl-talk/actor-cache-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

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

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="en" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">Scheduling observations for a complete Eval</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Scheduling observations for a complete Eval"><img src="/figures/agentic-rl-talk/eval-scheduling-en.svg" alt="Two complete Evals on the same 512 questions and model, with a zero-based wall-time axis." loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>Shared tools, caching, and stochastic outputs limit causal attribution; individual-request latency also increased. <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

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
<figcaption>All eight nodes; gray dashed lines mark this run’s initial values. Metric scales match across all three figures. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
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
<figcaption>All eight nodes; gray dashed lines mark this run’s initial values. Metric scales match across all three figures. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
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
<figcaption>All eight nodes; gray dashed lines mark this run’s initial values. Metric scales match across all three figures. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
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
