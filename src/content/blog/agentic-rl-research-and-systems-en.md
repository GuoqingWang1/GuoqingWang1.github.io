---
title: "Agentic RL: Research and Systems Practice"
description: "A five-part review of learning methods, training infrastructure, and complete experiments for search agents, retaining execution scale, scope, and open questions."
category: technical
lang: en
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T02:02:30+08:00"
draft: false
review: true
---

This is a public working draft of a talk, intended for discussion chapter by chapter before being organized into a presentation. It covers published methods, subsequent research exploration, infrastructure work, and complete experimental records. Chapter 1 is the current focus of revision; the remaining chapters retain the content and scope of the existing talk.

The material mainly draws on traceable work from late August through early November 2026. Published papers are listed separately as methodological foundations; publication dates do not stand in for actual research and development dates. Earlier work and specific individual responsibilities are still being documented.

## 1. Research Questions and Overview

### 1.1 Research goal

Search agents complete tasks through multiple rounds of generation and tool use. They must choose the next action, obtain information from external material, assess whether the evidence is sufficient, and answer at an appropriate point. Each action changes the subsequent context and consumes generation and tool resources.

Our goal is to improve interaction efficiency while preserving or improving task quality. Mean rounds, total generated tokens, and output length per round need to be examined together. When rounds decrease, we must also ask how total consumption changes and whether longer individual responses compensate for the reduction.

Work toward this goal includes rewards, credit assignment, and update rules, as well as data, tools, judging, training recovery, and evaluation. The former determine what we want the model to learn. The latter determine whether those signals enter training correctly and whether the results support reliable conclusions.

### 1.2 Understanding execution and learning through one task

**Synthetic teaching example: which of two fictional products, A and B, was officially released earlier?**

The agent first needs to find sources and then check what each date means. An announcement date, an official release date, and a retail availability date may differ. Finding dates is therefore not enough: the agent must establish that they answer the same question.

<figure class="talk-figure " data-talk-figure="search-agent-loop" lang="en" aria-labelledby="talk-search-agent-loop-title">
<p class="tf-title" id="talk-search-agent-loop-title">Search Agent: actions, observations, and answers</p>
<div class="tf-agent-loop"><div class="tf-node tf-state"><strong>Task &amp; current context</strong><small>Question, collected material, action history</small></div><span class="tf-edge tf-state-edge" aria-hidden="true"></span><div class="tf-node tf-agent tf-emphasis"><strong>Search Agent</strong><small>Choose the next action, or finish the task</small></div><span class="tf-edge tf-tool-edge" aria-hidden="true"></span><div class="tf-node tf-tools tf-soft"><strong>Tools</strong><small>Search / Visit, selected as needed</small></div><div class="tf-return"><span>Return observations to context, then decide again</span></div><div class="tf-node tf-answer"><strong>Answer &amp; support</strong><small>When the Agent chooses to finish</small></div><span class="tf-answer-edge" aria-hidden="true"></span></div><div class="tf-training"><p class="tf-stage-label">Training, separate from task execution</p><div class="tf-linear tf-linear-four"><div class="tf-node "><strong>Trajectories &amp; versions</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Training signals</strong><small>Outcome / process / cost, as configured</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Policy update</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Future rollouts</strong></div></div></div>
<figcaption>Figure 1 · Tool use can repeat within a task, and observations still require verification. The lower path describes training, not a model update after every tool call.</figcaption>
</figure>

Training must retain complete trajectories and their corresponding policy versions, then construct rewards and advantages according to the experimental recipe. Supervision may come from final outcomes, process evaluation, or cost signals; different methods enable and combine different signals. Weight updates occur during training, and the updated policy is used for subsequent sampling.

This example identifies the interfaces involved in the research: query actions affect evidence, tool interfaces affect observations, judging rules affect rewards, and the update implementation determines how signals act on parameters. Evaluation must then examine what behavior the policy actually changed.

### 1.3 Five layers of work

| Layer | Main work |
| --- | --- |
| Methods | Signal definitions, process credit, quality and cost, and the update rules actually used |
| Data | Sources and versions, review and revision, training admission, and validation isolation |
| Environment | Interfaces, failure feedback, and service behavior for Search, Visit, Summary, and Judge |
| Training and infrastructure | Model and image compatibility, distributed updates, sampling schedules, weight publication, saving, and recovery |
| Evaluation and diagnosis | Comparisons among the initial model, trained control, and candidate; complete curves, failures, and cost attribution |

The following chapters follow this map. The algorithm chapter explains learning signals and design choices. The infrastructure chapter shows how methods become runnable, recoverable systems. The experimental chapter describes which conclusions the evidence supports and which questions remain open.

### 1.4 Verified execution scale and current understanding

| Verified scale | Meaning and scope |
| --- | --- |
| 6,994 usable training records | The fixed version contains 6,315 original records and 679 revisions, with the version and scope of use recorded |
| 3 complete training runs | All three specific schemes produced complete records of 55 updates along the model path; recomputation during recovery is counted separately as physical work |
| 8 validation nodes per run, 246 questions per node | Includes the initial point; these are development evaluations, not mutually independent test sets |

These figures include collaborative work; specific individual work packages will be confirmed in the relevant sections. Usable data is not necessarily an entirely error-free gold standard, and completed training must still be interpreted through quality and efficiency metrics. None of these three specific configurations has produced a model that meets the joint requirements of quality preservation and round compression.

Complete experiments leave reusable knowledge: they help distinguish short-run signals from long-run behavior, document the limits of fixed candidates, and identify where further research may be valuable.

## 2. Algorithm Exploration and Learning Signals

### 2.1 Search and evidence processing become learnable behavior

[WebFilter](https://arxiv.org/abs/2508.07956) and [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) address information acquisition and information use, respectively.

#### [WebFilter](https://arxiv.org/abs/2508.07956)

- Queries restricted to selected sources
- Filtering of retrieved results
- Behavior and outcome rewards

#### [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/)

- Generation of concise evidence notes
- Checking whether the evidence supports the answer
- Evidence-quality rewards

These two published methods are presented side by side; no claim is made that they have been jointly trained in one system.

### 2.2 [Atom-Searcher](https://arxiv.org/abs/2508.12800) provides fine-grained process feedback

Long reasoning sequences are divided into functionally meaningful units so that intermediate steps can receive supervision.

1. **Atomic Thought**: identify reasoning units.
2. **Reward model RRM**: evaluate the units.
3. **Process reward ATR**: incorporate the final outcome.
4. **RL updates**: use curriculum-based scheduling.

This follows the published method; the specific weights for process and outcome signals are defined by the paper's recipe.

### 2.3 [IGPO](https://arxiv.org/abs/2510.14967) uses information acquisition to construct turn-level signals

Changes in answer probability before and after an observation provide denser feedback for multi-turn search.

Published IGPO constructs turn-level information gain from changes in the policy's probability of the correct answer and combines it with final-outcome supervision. Compared with a trajectory that receives an outcome reward only at the end, a turn-level signal provides intermediate feedback. The scoring function, context, and reward formula must be interpreted according to the relevant paper or experimental version.

This is a methodological illustration: the scoring function, context, and reward formula must be tied to a specific version.

### 2.4 From information gain to a complete training recipe

[DR-Venus](https://arxiv.org/abs/2604.19859) connects public data, supervised fine-tuning, and Agentic RL into a training pipeline.

1. **Public trajectories**: data sources.
2. **Cleaning and resampling**: coverage of long trajectories.
3. **SFT**: establish the initial capabilities.
4. **IGPO-style RL**: process and outcome feedback.

Subsequent internal research includes additional changes to credit, cost, and updates. Those changes must not be presented as the original recipe of the published paper.

### 2.5 Raw information gain and the actual advantage need separate checks

A score affects learning only after passing through credit assignment and update rules.

<figure class="talk-figure " data-talk-figure="credit-update-flow" lang="en" aria-labelledby="talk-credit-update-flow-title">
<p class="tf-title" id="talk-credit-update-flow-title">From scores to actual updates</p>
<div class="tf-sources"><div class="tf-node tf-soft"><strong>Process score</strong><small>For example, information gain</small></div><div class="tf-node tf-soft"><strong>Outcome signal</strong><small>Task quality</small></div><div class="tf-node tf-soft"><strong>Cost signal</strong><small>Interaction and generation</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>Credit &amp; advantages</strong><small>Constructed and enabled by the recipe</small></div></div><div class="tf-to-first" aria-hidden="true"></div><div class="tf-linear"><div class="tf-node "><strong>Update rule</strong><small>ratio / clip / reduction</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Parameter update</strong><small>Actual effects require validation</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Subsequent behavior</strong><small>Checked through task evaluation</small></div></div>
<figcaption>Figure 2 · A mechanism overview. Components are enabled by configuration, not presented as an established best combination. Scores, advantages, and task gains require separate validation.</figcaption>
</figure>

1. **Raw score difference**: information change.
2. **Gating and accumulation**: how credit is allocated to actions.
3. **Total advantage**: quality, IG, and cost.
4. **Policy update**: ratio, clipping, and reduction.

Research dimensions include positive and negative signals, observation conditioning, activation stages, and normalization. Improvements in a proxy still require task-level validation.

### 2.6 Cost optimization constrains both quality and generation behavior

Fewer rounds may be accompanied by longer individual rounds, so the measures must be interpreted together.

| Measure | Question it answers |
| --- | --- |
| Task quality Q | Is answer quality or accuracy preserved? |
| Mean rounds R | Is interaction more focused? |
| Total generated tokens T | How does overall generation consumption change? |
| Length per round U | Are longer responses compensating for fewer rounds? |

Cost credit and actual resource accounting are recorded separately. Apparent gains must not be obtained by removing slow samples.

### 2.7 Update rules change how signals act

Credit, probability ratios, clipping, and reduction jointly determine the optimization objective.

#### Signals and weights

- Relative weights of quality, IG, and cost
- Contributions from trajectories of different lengths
- Success gating and valid token support

#### Updates and reduction

- Learning rate and KL
- Importance ratios and PPO clipping
- Token means and equal weighting of sequences

The main discussion focuses on differences in mechanisms. Historical update-rule comparisons are summarized in Appendix B06.

### 2.8 Partial and Flash expand the ways training can be organized

Scheduling and sample organization can also change the conditions under which learning occurs.

| Scheme | Scope of formal validation | What was established |
| --- | --- | --- |
| Partial rollout | 4 experimental groups, each with 96 questions × 8 trajectories | Delivery of complete groups and continuation across versions |
| Flash-IGPO | 768 distinct questions, n=1 | 3 effective updates and complete draining of the workload |

Differences in exposure and shared-tool conditions limit fair comparison. Passing functional and capacity checks does not establish long-term quality.

## 3. Training Systems and Infrastructure

### 3.1 Models, tools, judging, and updates form a stateful loop

Every interface needs explicit fields, versions, and lifecycle boundaries.

<figure class="talk-figure " data-talk-figure="training-system" lang="en" aria-labelledby="talk-training-system-title">
<p class="tf-title" id="talk-training-system-title">Components and state boundaries of the training system</p>
<p class="tf-stage-label">Sampling and environment interaction</p><div class="tf-system-input"><div class="tf-node "><strong>Data &amp; runtime state</strong><small>Tasks, cursors, and pending state</small></div></div><p class="tf-runtime-lead" aria-hidden="true">↓</p><div class="tf-runtime"><div class="tf-node tf-emphasis"><strong>Rollout</strong><small>Generation, actions, and observations</small></div><span class="tf-edge tf-bidirectional" aria-hidden="true"></span><div class="tf-side-services"><div class="tf-node "><strong>Tools</strong><small>Search / Visit</small></div><div class="tf-node "><strong>Judge</strong><small>Called by the applicable scoring path</small></div></div></div><p class="tf-runtime-handoff">↓ Deliver trajectories and training signals</p><div class="tf-training"><p class="tf-stage-label">Learning and policy synchronization</p><div class="tf-linear"><div class="tf-node "><strong>Trajectories &amp; signals</strong><small>Rewards, credit, and advantages</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Actor update</strong><small>Actual parameter updates</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Policy sync</strong><small>New versions for subsequent rollouts</small></div></div></div><p class="tf-feedback-note">↺ Published policies feed subsequent rollouts</p><p class="tf-save"><strong>Save & restore</strong>Parameters, optimizer, cursors, and pending state reconnect at the corresponding consumer boundaries.</p>
<figcaption>Figure 3 · Logical relationships, not a fixed serial tool-and-judge pipeline. Call placement and restoration capabilities remain specific to the validated implementation.</figcaption>
</figure>

The execution chain includes task state, model generation and tools, judging and rewards, credit and advantages, Actor updates, and weight publication. New policy versions are used for subsequent sampling, while saving and recovery span the lifecycle. Object fields, numerical semantics, policy versions, and time boundaries must all correspond to the actual consumers.

This overview describes system relationships; it does not combine components from different historical runs into one validated optimal configuration.

### 3.2 Training data has a traceable version history

Retaining sources, revisions, and admission scope supports reuse in later experiments.

| Scale | Object | Scope |
| --- | --- | --- |
| 8,640 | Original data pool | Review, withholding, and version disposition |
| 6,994 | Fixed usable version | 6,315 originals + 679 revisions |
| 512 | Research set delivered first | An independently frozen version, followed by continued work on the full pool |

A consumable version is not an error-free gold standard. The version relationship between the 512 and 6994 sets cannot be treated as a simple union.

### 3.3 Tool services must handle failures and cancellation correctly

The behavior of Search, Visit, and Summary enters the agent's observations.

#### Interface capabilities built

- Service migration and caching
- Attribution of errors to individual operations
- Budgets, timeouts, and errors visible to the model

#### Representative case: cancelling queued work

- Cancel the result channel
- Locate the pending work in the executor as well
- Wait for running threads to actually exit

The historical cancellation reproduction and 4 regression checks establish in-process boundaries. They do not establish that remote HTTP computation has stopped.

### 3.4 Scoring semantics and service availability are validated separately

Final judgments matching expectations on a fixed development panel increased from 38/40 to 40/40.

| Measure on the frozen development panel | Before the fix | After the fix |
| --- | --- | --- |
| Final judgments matching expectations | 38/40 | 40/40 |
| Original primary judgments | 39/40 | 39/40 |

The panel contains 32 ordinary cases and 8 boundary cases, including 2 that should retain a nonnumeric unknown result. The fix reused 41 existing responses and added only 1 necessary actual review call. It must not be described as a new independent test of 40 questions.

A separate historical review, as of 2026-10-07, examined 36,601 Judge request entries and confirmed 71 false rejections and 101 false acceptances, for 172 confirmed misjudgments in total. The unit is a historical task_id request entry, not an independent question. Other cases remain unresolved, so these figures do not establish an overall error rate. These 172 cases and the 40-case development panel above also have different denominators. This historical count does not provide results from a case-by-case revalidation with the newer version.

The final independent acceptance check for the unified service included 1 actual request, which took the primary route. It did not force a separate test of every provider route. Adoption by a newly configured Actor or native RL run requires separate validation.

The results include unknowns that should remain unknown. Acceptance of a unified four-provider service does not mean that all four routes were individually exercised, or that a new profile has passed RL validation.

### 3.5 The same output receives different interpretations in training and evaluation

For the same batch of 357 final outputs, the native parsers produced two different outcomes.

| Processing path | ERROR | END |
| --- | --- | --- |
| Original training parser: plain disabled | 357 | 0 |
| Original Eval parser: plain enabled | 0 | 357 |
| Training parser: only plain acceptance enabled | 0 | 357 |

This was a same-input audit within 404 parsing failures. END means syntactic acceptance; the answers were not reclassified as correct.

### 3.6 Recovery validation extends through mixed batches, updates, and publication

Loading state is only the starting point. Actual consumption establishes whether the recovery path works.

1. **Load state**: the original checkpoint.
2. **Mix restored and fresh samples**: a batch of 256 members.
3. **Perform real updates**: the 9th and 10th parameter updates.
4. **Publish and validate**: policy version 5 and the subsequent curve.

A009 resumed from a checkpoint that had already completed 8 updates, then made 47 new updates, bringing the model's training path to 55 updates. Bitwise continuation of the stochastic process is not claimed.

### 3.7 Timing attribution determines where to optimize

In one real, complete training step, the wait for scoring was already inside rollout.

| Observation from the original step | Recorded value | Scope |
| --- | --- | --- |
| Complete iteration | 5411.207 s | Whole-step wall time in the same driver |
| generate | 2859.381 s | Includes tools and scoring postprocessing |
| old-logprob | 734.510 s | Driver stage |
| reference | 165.967 s | Driver stage |
| Actor update | 1609.646 s | Driver stage |
| Judge client | 154 calls / cumulative 881.243 s | Sum of concurrent request durations |
| reward boundary | 0.000167 s | Reading results already available |

This is one observation from 2026-09-18. Cumulative Judge request time must not be added outside generate or treated as serial wall time.

### 3.8 Qwen3.5 and B300 form a reusable runtime baseline

The work connects model computation, the training framework, the inference engine, and hardware interfaces.

| Layer | Specific work |
| --- | --- |
| Model and computation | Standard attention, GatedDeltaNet, and long-context paths |
| Training and conversion | VERL, Megatron-Core, MBridge, and Transformer Engine |
| Inference and hardware | SGLang, Triton, and B300 toolchain compatibility |
| Validation and stabilization | Runtime manifests, real updates, saving, synchronization, and normal exit |

Frozen configuration on 2026-09-04: Qwen3.5-4B on a single machine with 8×B300. This does not generalize to every model or topology.

### 3.9 Distributed updates, saving, and weight publication completed a tested loop

GRPO and [IGPO](https://arxiv.org/abs/2510.14967) each completed 384 trajectories, three Actor updates, and a final checkpoint.

1. **Actor updates**: 8 ranks.
2. **Complete saving**: DCP, optimizer state, and RNG state.
3. **Weight synchronization**: the training/inference bridge.
4. **New rollout version**: confirm consumption of the policy version.

The original record covers final-checkpoint integrity and weight synchronization. Evaluation of a larger model does not count as training validation.

### 3.10 Compilation caching and convolution optimizations entered real training

The same complete three-step run retained 768 trajectories, with all 8 Actor ranks confirming that the optimizations took effect.

| Stage of real training | Actor time |
| --- | --- |
| Step 1 | 973.715 s |
| Step 2 | 752.250 s |
| Step 3 | 655.359 s |

No additional Actor JIT entries were observed in the latter two steps.

Token counts and microbatch shapes differed across the three steps. This curve records a run observation; it cannot be attributed to caching alone or treated as a whole-step speedup.

### 3.11 Container image upgrades are selected using actual execution and numerical evidence

The work included migration of optimizations, two three-step native training runs, and diagnostics on fixed inputs.

| Observations from warm steps 2–3 | Old image | New candidate |
| --- | --- | --- |
| Mean whole-step seconds | 3233.142 | 3192.462 |
| Actor seconds per million packed tokens | 19.593 | 20.420 |
| old-logprob seconds per million tokens | 5.535 | 6.454 |
| Complete lifecycle | 3/3 passed | 3/3 passed |

This single comparison did not establish a stable end-to-end advantage for the candidate, so the old default was retained. Numerical differences across versions have a separate contract; speed does not override it.

### 3.12 Continuous replenishment improves batching efficiency for a complete Eval

All of the same 512 questions completed, with full-Eval wall time decreasing from 4505.21 seconds to 4126.03 seconds.

| Approach | Full-Eval wall time | Completeness |
| --- | --- | --- |
| Original batch256 | 4505.21 s | 512/512 |
| Continuous active256 | 4126.03 s | 512/512 |

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="en" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">Scheduling observations for a complete Eval</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Scheduling observations for a complete Eval"><img src="/figures/agentic-rl-talk/eval-scheduling-en.svg" alt="Two complete Evals on the same 512 questions and model, with a zero-based wall-time axis." loading="lazy" decoding="async" width="768" height="307.2"></a>
<figcaption>Figure 4 · Shared tools, caching, and stochastic outputs limit precise causal attribution; individual-request latency also increased. <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

Both groups completed generation and scoring for all 512 questions.

The observed reduction was 8.42%. Stochastic outputs, shared tools, and caching limit precise causal attribution; individual-request latency also increased.

### 3.13 Environment delivery and observability support continued research

Code, models, data, run identities, and results form a traceable delivery chain.

| Work | Recorded delivery | Scope |
| --- | --- | --- |
| [DR-Venus](https://arxiv.org/abs/2604.19859) environment | Software installation and image consistency across three machines | The first machine completed a single-GPU check |
| Model-saving smoke test | Complete native checkpoint save | Reward and gradient were 0; establishes lifecycle behavior only |
| Run observability | Correlation of run, step, trajectory, and request identities | Separate tracing of training, tools, and judging |
| Assets and synchronization | File verification, source manifests, and result archives | Retain historical failures and recovery evidence |

Software installation, GPU operations, effective learning, and multi-machine training are validated separately. Three installation nodes must not be reported as successful three-machine training.

## 4. Experimental Evidence and Key Findings

### 4.1 Three references answer different research questions

Overall training benefit and the increment from an added component require separate judgments.

| Reference | What it tests | What must be held fixed |
| --- | --- | --- |
| Initial SFT | Whether RL improves the model overall | Initial model and evaluation protocol |
| Trained control | The effect of the original training path | Data, training dose, and service conditions |
| New candidate | Whether an added component is valuable | Actual differences and predetermined acceptance requirements |

The same question count or seed alone does not ensure comparability. Failures, unknowns, and the complete denominator are retained.

### 4.2 Exploration is organized by research question

Implementation, numerical qualification, and task results are retained separately to help identify valuable next steps.

| Question family | Dimensions studied |
| --- | --- |
| Process signals | IG on/off, conditioning, positive/negative signals, success gating, and activation stages |
| Cost credit | Rounds/tokens, accumulation, normalization, and fixed scales |
| Update rules | LR, KL, ratio, clipping, and token/sequence reduction |
| Training organization | Synchronous execution, Partial, single-trajectory training, data exposure, and recovery |

Historical entries, failed attempts and retries, and independent scientific experiments are not counted as the same thing. Appendices B04–B06 summarize the main dimensions of those comparisons.

### 4.3 Expanded validation changed the assessment of a fixed candidate

The same sequence-ratio policy was examined on 128-question and nested 246-question development panels.

| Development panel | Trained control: correct | Candidate: correct | Original disposition |
| --- | --- | --- | --- |
| 128 questions | 68 | 68 | Point-estimate gate passed; stronger gate failed |
| Nested 246 questions | 131 | 121 | Do not promote this fixed candidate |

As the evidence for the same candidate expanded, the earlier point-estimate signal did not become sufficient grounds for adoption. The 246-question set is a nested development panel. This step added no new training run and was not an independent test.

This is expanded evaluation of the same policy, not a second training run or an independent test. The identities of the original SFT model and trained control are preserved.

### 4.4 Three complete training runs provided system-level validation

Each completed a model path over 6994 members and eight full validation points.

| Frozen scheme | Members | Updates on the model path | Validation nodes |
| --- | --- | --- | --- |
| Original combination | 6,994 | 55 | 8 × 246 questions |
| Update weight cap | 6,994 | 55 | 8 × 246 questions |
| Fixed cost scale | 6,994 | 55 | 8 × 246 questions |

The nodes are 0/8/16/24/32/40/48/55. The fixed cost-scale scheme made 61 physically executed successful updates, with recovery costs accounted for separately.

### 4.5 The complete curves have not produced a model meeting the joint objective

None of the three specific configurations simultaneously met the original requirements for quality preservation, fewer rounds, and the length constraint.

<figure class="talk-figure" data-talk-figure="training-a009" lang="en" aria-labelledby="talk-training-a009-title">
<p class="tf-title" id="talk-training-a009-title">Complete curves for the original combination</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the original combination"><img src="/figures/agentic-rl-talk/training-a009-en.svg" alt="Original combination: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="600"></a>
<figcaption>Figure 5 · Gray dashed lines mark this run’s own initial reference. None of the three specific configurations met the original joint requirements; this is not a fair cross-run ranking. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

<figure class="talk-figure" data-talk-figure="training-cap2" lang="en" aria-labelledby="talk-training-cap2-title">
<p class="tf-title" id="talk-training-cap2-title">Complete curves for the update weight cap</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the update weight cap"><img src="/figures/agentic-rl-talk/training-cap2-en.svg" alt="Update weight cap: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="600"></a>
<figcaption>Figure 6 · Metric scales match the other two figures; the initial reference belongs to this run. Lines connect recorded observations without smoothing or new statistics. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

<figure class="talk-figure" data-talk-figure="training-fixed-cost" lang="en" aria-labelledby="talk-training-fixed-cost-title">
<p class="tf-title" id="talk-training-fixed-cost-title">Complete curves for the fixed cost scale</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the fixed cost scale"><img src="/figures/agentic-rl-talk/training-fixed-cost-en.svg" alt="Fixed cost scale: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="600"></a>
<figcaption>Figure 7 · The x-axis counts updates on the model path. Total-token inputs retain their units, with ticks displayed in millions; full values remain in Appendix B11. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

| Updates on the model path | Original combination: correct | Weight cap: correct | Fixed cost scale: correct |
| --- | --- | --- | --- |
| 0 | 120 | 115 | 106 |
| 8 | 117 | 117 | 116 |
| 16 | 111 | 111 | 114 |
| 24 | 85 | 85 | 86 |
| 32 | 49 | 52 | 58 |
| 40 | 21 | 7 | 13 |
| 48 | 2 | 1 | 5 |
| 55 | 1 | 0 | 2 |

Each point contains 246 questions.

Each run retains its own initial reference. The runs are not ranked as a fair comparison, and these results do not reject an entire method family.

### 4.6 Identified defects and unknown causes are kept separate

Engineering diagnosis and scientific causality require different evidence.

#### Supported by specific evidence

- Parsing differences between training and evaluation
- Equal-reward numerical issues and recovery-chain issues
- Some successful batches consumed trajectories exposed to an incident

#### Still unresolved

- The independent contribution of a single fix to quality
- Specific damage to parameters
- The sole cause of degradation in complete training runs

Incident exposure, actual consumption, and parameter damage are assessed separately. Association does not stand in for causality.

## 5. Deliverables and Next Steps

### 5.1 The methodological outputs form a clear technical lineage

Methods have accumulated around the actions, supervision, and training recipes of search agents.

| Technical question | Representative work | Established role |
| --- | --- | --- |
| Search and evidence | [WebFilter](https://arxiv.org/abs/2508.07956), [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) | Co-first author |
| Process supervision | [IGPO](https://arxiv.org/abs/2510.14967) | First author |
| Process rewards and training recipes | [Atom-Searcher](https://arxiv.org/abs/2508.12800), [DR-Venus](https://arxiv.org/abs/2604.19859) | Core contributor |
| Related system evolution | [MemPro](https://aclanthology.org/2026.emnlp-main.1364/) | Co-first author |

Paper roles and specific implementation responsibilities are recorded separately. Presenting methods together does not imply completed system integration.

### 5.2 The work leaves reusable research assets

Implementations and evidence can support faster, more reliable decisions in the next round.

| Asset | Subsequent use |
| --- | --- |
| Methods and training implementations | Reuse learning signals, updates, and sampling paths |
| Versioned data and evaluation | Bind samples, protocols, results, and comparison scope |
| Tools, judging, and recovery | Reduce repeated integration and fault-recovery work |
| Diagnostics and negative results | Rule out earlier assumptions and constrain the next design |

The specific modules led individually, completed jointly, or supported as a core contributor still need to be confirmed one by one.

### 5.3 The next stage focuses on questions the evidence can distinguish

Further investment should depend on whether new evidence can change a research choice.

<figure class="talk-figure " data-talk-figure="next-questions" lang="en" aria-labelledby="talk-next-questions-title">
<p class="tf-title" id="talk-next-questions-title">Existing assets and next research questions</p>
<p class="tf-stage-label">Existing reusable assets</p><div class="tf-sources"><div class="tf-node tf-soft"><strong>Method implementations</strong><small>Training and scoring paths</small></div><div class="tf-node tf-soft"><strong>Runtime infrastructure</strong><small>Tools, recovery, and observability</small></div><div class="tf-node tf-soft"><strong>Data &amp; evidence</strong><small>Versions, controls, and curves</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>Support the next research decision</strong></div></div><div class="tf-split" aria-hidden="true"><span>↓</span><span>↓</span><span>↓</span></div><div class="tf-sources" role="group" aria-label="Next research questions"><div class="tf-node tf-future"><strong>Quality baseline</strong><small>An interpretable learning reference</small></div><div class="tf-node tf-future"><strong>Process &amp; cost effects</strong><small>Conditions for a useful increment</small></div><div class="tf-node tf-future"><strong>Iteration efficiency</strong><small>Reliable decisions sooner</small></div></div>
<figcaption>Figure 8 · Proposed research directions, not a claim that these studies have started or produced gains.</figcaption>
</figure>

#### Quality and learning signals

- Establish an interpretable quality baseline
- Test when process and cost signals are effective
- Use minimal comparisons to distinguish explicit competing explanations

#### Reliable research iteration

- Reuse validated implementations and data
- Retain complete failure and cost records
- Make decisions from complete results

These are research questions proposed from the current records; the design of any specific experiment still needs to be determined separately.

## Appendix: Supplementary Material and Complete Aggregates

The following 15 sets of backup material from the original talk are retained. Numbers and scope follow their respective records, allowing later pruning as needed.

### B01 Traceable milestones

| Time | Representative activity |
| --- | --- |
| Late August | Timing real training runs and locating bottlenecks |
| Early to mid-September | Runtime environment, Actor optimization, tools, and judging |
| Late September | Partial, Flash, data, and long training runs |
| October | Credit, cost, updates, and data governance |
| Early November | Completing the full curves and reviewing the foundations |

Earlier R&D dates and individual work packages are not yet complete. Publication dates do not substitute for the time invested.

### B02 Published methods supervise different objects

| Work | What is learned or improved | Signal source |
| --- | --- | --- |
| [WebFilter](https://arxiv.org/abs/2508.07956) | Queries and filtering | Search behavior and outcomes |
| [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) | Evidence notes | Support for the answer |
| [Atom-Searcher](https://arxiv.org/abs/2508.12800) | Atomic reasoning units | External reward model |
| [IGPO](https://arxiv.org/abs/2510.14967) | Multi-turn information acquisition | Change in the conditional probability of the correct answer |
| [DR-Venus](https://arxiv.org/abs/2604.19859) | Complete training recipe | Data, SFT, and [IGPO](https://arxiv.org/abs/2510.14967)-style RL |

This compares mechanisms, not performance under a fair cross-paper benchmark.

### B03 Turn-level scoring still requires correct token alignment

The target at position j is scored by prediction row j−1.

| Input position | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Input token | BOS | P0 | P1 | A0 | A1 |
| Target of that row | P0 | P1 | A0 | A1 | Next |

Read rows 2 and 3 to score A0 and A1. This is a synthetic position diagram; no protected samples are shown.

### B04 Historical dimensions of process-credit research

| Dimension | Comparison | Level of conclusion |
| --- | --- | --- |
| Source | Original full-history difference and observation conditioning | Results retained for each fixed version |
| Sign | signed and positive-only | No universal advantage established |
| Gating | Outcome-success conditions and valid support | Conditions and scope of use kept separate |
| Stage | Throughout, early only, and disabled later | Do not pass off a selected midpoint as the final endpoint |
| Mapping | Local credit, accumulated credit, and advantage after gating | Must be traced through to actual updates |

Based on the historical question index. This section summarizes scope without adding training conclusions.

### B05 Cost credit and resource accounting need separate interpretations

#### Actual consumption

- Rounds and generated tokens
- Tool requests and retries
- Native wall time and recovery costs

#### Credit entering optimization

- Immediate and future costs
- Normalization and allocation
- Total advantage, clipping, and reduction

Lclip(r, Aq＋Aig＋Ac) and separately clipped component objectives cannot be treated as the same objective without conditions.

### B06 Scope of historical update-rule comparisons

| Variable | Specific differences studied |
| --- | --- |
| Learning rate | Constants 1e−6/5e−7, linear decay, and matched mean dose |
| KL | A bounded comparison of 0.001 and 0.0005 |
| PPO | Upper clipping and shared/local importance ratios |
| Reduction | Token means, equal weighting of sequences, and component objectives |
| Sampling and consumption | Synchronous, asynchronous, Partial, and actual exposure |

Historical candidates are not the current optimal configuration. An incomplete comparison is not filled in as a valid experiment.

### B07 The formal Partial workload retained every trajectory

| Algorithm | Synchronous container seconds | Partial container seconds | Trajectories per arm |
| --- | --- | --- | --- |
| GRPO | 10828.329 | 9593.208 | 768 |
| [IGPO](https://arxiv.org/abs/2510.14967) | 11678.676 | 10807.729 | 768 |

A fixed-workload observation from 2026-09-22. Shared tools, caches, trajectories, and correction differences limit causal attribution to scheduling alone.

### B08 The runtime stack supports long-context agent training

1. **Model runtime**: Qwen / B300.
2. **Distributed Actor**: VERL / MCore.
3. **Rollout engine**: SGLang.
4. **Tools and judging**: Search / Visit / Judge.

A historical environment snapshot. Interfaces, numerical behavior, saving and recovery, and actual training are validated separately.

### B09 Failure classification determines the response boundary

| Observation | Response principle |
| --- | --- |
| Cancellation of a queued task | Find the actual execution handle and successfully cancel pending work |
| Running thread | Return capacity only after the thread actually exits |
| Unknown scoring semantics | Retain unknown; refuse to invent a numerical reward |
| Partial tool failures | Attribute failures individually and report them to the agent |
| Recovery failure | Reuse qualified state and retain the original failure and workload |

An in-process regression does not automatically establish that remote computation has stopped.

### B10 Data versions and review scope are recorded separately

| Version or scope | Recorded size | Interpretation |
| --- | --- | --- |
| Original pool | 8640 | Passing structural checks does not establish that every fact is correct |
| Priority research set | 512 | Purpose and version frozen independently |
| Fixed usable pool | 6994 | 6315 originals + 679 revisions |
| Known errors / substantive disputes | 835 / 767 | Withheld without changing historical inputs or scores |

Data-identity disposition, content review, independent verification, and training admission are recorded separately.

### B11 All eight quality points are retained for the three complete runs

| Updates on the model path | Original combination: correct | Weight cap: correct | Fixed cost scale: correct |
| --- | --- | --- | --- |
| 0 | 120 | 115 | 106 |
| 8 | 117 | 117 | 116 |
| 16 | 111 | 111 | 114 |
| 24 | 85 | 85 | 86 |
| 32 | 49 | 52 | 58 |
| 40 | 21 | 7 | 13 |
| 48 | 2 | 1 | 5 |
| 55 | 1 | 0 | 2 |

Each point contains 246 questions.

Q is the number correct out of 246. The complete R/T/U curves are provided in the tables below; U = ΣT/ΣR. Each of the three runs has its own initial reference.

#### Original combination: complete curves for all four metrics

Each node contains 246 questions. Decimals are rounded to three places for display only; the original evaluation or statistical conclusions are not recomputed.

| Updates | Number correct | Mean rounds | Total generated tokens | Tokens/round (pooled) |
| --- | --- | --- | --- | --- |
| 0 | 120 | 45.805 | 5245056 | 465.482 |
| 8 | 117 | 33.854 | 4109116 | 493.410 |
| 16 | 111 | 33.516 | 5156335 | 625.389 |
| 24 | 85 | 28.785 | 6418762 | 906.477 |
| 32 | 49 | 15.833 | 4846495 | 1244.286 |
| 40 | 21 | 5.541 | 3683373 | 2702.401 |
| 48 | 2 | 2.366 | 3414906 | 5867.536 |
| 55 | 1 | 1.707 | 3425488 | 8155.924 |

#### Update weight cap: complete curves for all four metrics

Each node contains 246 questions. Decimals are rounded to three places for display only; the original evaluation or statistical conclusions are not recomputed.

| Updates | Number correct | Mean rounds | Total generated tokens | Tokens/round (pooled) |
| --- | --- | --- | --- | --- |
| 0 | 115 | 36.138 | 4113637 | 462.726 |
| 8 | 117 | 43.163 | 5358615 | 504.673 |
| 16 | 111 | 40.183 | 6211042 | 628.330 |
| 24 | 85 | 26.683 | 6498177 | 989.972 |
| 32 | 52 | 14.037 | 4810916 | 1393.257 |
| 40 | 7 | 4.463 | 3790360 | 3452.058 |
| 48 | 1 | 2.183 | 3397617 | 6327.034 |
| 55 | 0 | 1.573 | 3348536 | 8652.548 |

#### Fixed cost scale: complete curves for all four metrics

Each node contains 246 questions. Decimals are rounded to three places for display only; the original evaluation or statistical conclusions are not recomputed.

| Updates | Number correct | Mean rounds | Total generated tokens | Tokens/round (pooled) |
| --- | --- | --- | --- | --- |
| 0 | 106 | 36.528 | 4268496 | 475.016 |
| 8 | 116 | 43.862 | 4985308 | 462.030 |
| 16 | 114 | 46.537 | 5376493 | 469.645 |
| 24 | 86 | 51.817 | 6813833 | 534.544 |
| 32 | 58 | 29.813 | 4667599 | 636.433 |
| 40 | 13 | 9.955 | 3603415 | 1471.382 |
| 48 | 5 | 5.199 | 3286799 | 2569.819 |
| 55 | 2 | 3.764 | 2897535 | 3129.087 |

### B12 Recovery costs cannot disappear from the workload

| Record | Fixed cost-scale scheme |
| --- | --- |
| Updates on the model path | 55 |
| Successful updates in the first attempt | 22 |
| Updates saved at the recovery point | 16 |
| New updates after recovery | 39 |
| Physically executed successful updates | 61 |
| Members consumed along the model path | 6994 |

Rework after the recovery point is not erased by calling the run “55 logical steps.” These are the original records for this run and are not applied to other schemes.

### B13 Boundaries between nested and concurrent timing

| Time measure | Original record | Scope of interpretation |
| --- | --- | --- |
| Whole-step wall time | 5411.207s | Lifecycle of the same driver |
| generate | 2859.381s | Includes tools and scoring postprocessing |
| Cumulative Judge-client time | 881.243s / 154 calls | Concurrent request durations, already inside generate |
| reward stage | 0.000167s | The boundary that reads existing results |

One fixed step from 2026-09-18. Stage names do not define costs, and cumulative durations across ranks are not wall time.

### B14 Correctness fixes have their own validation scope

| Case | Actual historical evidence | What it does not establish |
| --- | --- | --- |
| Two parsers | The same 357 inputs: 357 ERROR / 357 END | That every answer was correct |
| Zeroing equal-reward groups | 9 groups, 72 members: advantages and returns are 0 | That no other update occurs during the entire training step |
| Real numerical validation | 512 members, 64 groups, two updates | That one patch independently improves task quality |

Historical native evidence and the later Blog's CPU teaching examples are retained separately.

### B15 Related directions expand the ways agent systems can improve

[MemPro](https://aclanthology.org/2026.emnlp-main.1364/) treats memory construction and retrieval as evolvable programs.

1. **Memory-system version**: construction and retrieval.
2. **Analyze failure modes**: locate recurring problems.
3. **Edit and debug**: improve the implementation.
4. **Evaluate the new version**: retain effective versions.

The published mechanism is program evolution. This draft does not claim that it has been integrated with IGPO or DR-Venus.

## Sources and Revision Notes

Links to published methods point to the original papers or official repositories. The engineering and unpublished experimental sections draw on saved project reports and aggregates. This article organizes existing results; it adds no training, judging, or statistical experiments. Comparison conditions, failures and unknowns, initial references, and model-selection scope are retained throughout.

This working draft will be revised chapter by chapter, then organized into a presentation using the agreed narrative, figures, and examples.
