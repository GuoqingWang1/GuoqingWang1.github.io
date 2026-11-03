---
title: "Agentic RL: Research and Systems Practice"
description: "Learning signals, training systems, complete experiments, and key findings for search agents."
category: technical
lang: en
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T04:04:03+08:00"
draft: false
review: false
presentation: true
---

## 1. Research Questions and Overview

### 1.1 Preserve quality, reduce wasted interaction

The goal is to reduce interaction and generation costs while preserving task quality.

- The agent chooses actions, checks evidence, and decides when to answer.
- Track quality, rounds, total tokens, and length per round together: fewer rounds may hide longer responses.
- Methods, data, environments, training, and evaluation jointly determine whether learning works.

### 1.2 How a search agent executes and learns

**Synthetic example: which fictional product, A or B, was officially released earlier?** The agent must check sources and distinguish announcement, release, and availability dates.

<figure class="talk-figure " data-talk-figure="search-agent-loop" lang="en" aria-labelledby="talk-search-agent-loop-title">
<p class="tf-title" id="talk-search-agent-loop-title">Search Agent: actions, observations, and answers</p>
<div class="tf-agent-loop"><div class="tf-node tf-state"><strong>Task &amp; current context</strong><small>Question, collected material, action history</small></div><span class="tf-edge tf-state-edge" aria-hidden="true"></span><div class="tf-node tf-agent tf-emphasis"><strong>Search Agent</strong><small>Choose the next action, or finish the task</small></div><span class="tf-edge tf-tool-edge" aria-hidden="true"></span><div class="tf-node tf-tools tf-soft"><strong>Tools</strong><small>Search / Visit, selected as needed</small></div><div class="tf-return"><span>Return observations to context, then decide again</span></div><div class="tf-node tf-answer"><strong>Answer &amp; support</strong><small>When the Agent chooses to finish</small></div><span class="tf-answer-edge" aria-hidden="true"></span></div><div class="tf-training"><p class="tf-stage-label">Training, separate from task execution</p><div class="tf-linear tf-linear-four"><div class="tf-node "><strong>Trajectories &amp; versions</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Training signals</strong><small>Outcome / process / cost, as configured</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Policy update</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Future rollouts</strong></div></div></div>
<figcaption>Figure 1 · Verify tool observations; parameter updates occur during training and feed future rollouts.</figcaption>
</figure>

### 1.3 Five layers and execution scale

The work spans the agent loop and includes team contributions, not sole ownership of every component.

| Layer | Work |
| --- | --- |
| Methods | Rewards, credit, quality and cost, update rules |
| Data | Sources, versions, revisions, admission, validation isolation |
| Environment | Search / Visit / Summary / Judge |
| Training | Runtime, sampling, updates, synchronization, saving and recovery |
| Evaluation | Initial references, trained controls, complete curves, diagnosis |

- **6,994 training records**: 6,315 originals + 679 revisions; usable does not mean error-free gold data.
- **3 complete runs**: 55 updates on each model path; recovery rework is counted separately.
- **8 validation nodes × 246 questions per run**: includes initialization and uses development data; none of the three configurations met the joint quality–cost objective.

## 2. Algorithm Exploration and Learning Signals

### 2.1 Search actions and evidence processing

WebFilter learns how to query; EviNoteRAG learns how to retain evidence supporting an answer.

| Method | Intervention | Training signal |
| --- | --- | --- |
| [WebFilter](https://arxiv.org/abs/2508.07956) | Source-restricted queries and retrieval filtering | Behavior and outcome rewards |
| [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) | Concise evidence notes | Entailment-based evidence-quality reward |

The methods are presented side by side, not as a jointly trained system.

### 2.2 Atom-Searcher: fine-grained process feedback

[Atom-Searcher](https://arxiv.org/abs/2508.12800) divides reasoning into units that can receive supervision.

- **Atomic Thought**: identify functional reasoning units.
- **RRM → ATR**: a reward model evaluates units and supplies process rewards.
- **Curriculum scheduling**: shift emphasis between process and final-outcome rewards.

### 2.3 IGPO: turn-level signals from information gain

[IGPO](https://arxiv.org/abs/2510.14967) constructs turn-level rewards from changes in the policy's probability of the correct answer.

- Compare scores before and after each observation to provide intermediate feedback.
- Combine turn-level information gain with final-outcome supervision.
- Bind the scoring context, formula, and reward combination to a specific version.

### 2.4 DR-Venus: from method to training recipe

[DR-Venus](https://arxiv.org/abs/2604.19859) connects open data, SFT, and IGPO-style Agentic RL.

- Clean public trajectories and resample long trajectories.
- Establish initial capabilities through SFT, then apply RL with process and outcome supervision.
- Further studies address credit assignment, cost constraints, and update rules, assessed separately from the published recipe.

### 2.5 From raw scores to actual updates

Process scores, credit and advantages, parameter updates, and task gains require separate validation.

<figure class="talk-figure " data-talk-figure="credit-update-flow" lang="en" aria-labelledby="talk-credit-update-flow-title">
<p class="tf-title" id="talk-credit-update-flow-title">From scores to actual updates</p>
<div class="tf-sources"><div class="tf-node tf-soft"><strong>Process score</strong><small>For example, information gain</small></div><div class="tf-node tf-soft"><strong>Outcome signal</strong><small>Task quality</small></div><div class="tf-node tf-soft"><strong>Cost signal</strong><small>Interaction and generation</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>Credit &amp; advantages</strong><small>Constructed and enabled by the recipe</small></div></div><div class="tf-to-first" aria-hidden="true"></div><div class="tf-linear"><div class="tf-node "><strong>Update rule</strong><small>ratio / clip / reduction</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Parameter update</strong><small>Parameter deltas</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Subsequent behavior</strong><small>Quality &amp; cost</small></div></div>
<figcaption>Figure 2 · Signals are enabled by recipe, not a selected best combination; scores, advantages, and task gains are checked separately.</figcaption>
</figure>

- Dimensions explored: observation conditioning, signed/positive-only signals, success gating, activation stages, local/accumulated mappings, and normalization.

### 2.6 Interpret quality and cost jointly

Fewer rounds may accompany longer responses and do not establish an efficiency gain on their own.

| Metric | Definition |
| --- | --- |
| Q | Number correct on the current panel |
| R | Mean logical rounds |
| T | Total generated tokens on the panel, not all compute resources |
| U | Pooled tokens per round: ΣT/ΣR, not the mean of per-question T/R |

Cost credit and resource accounting are separate; failures, unknowns, and slow samples remain in the original denominator.

### 2.7 Update rules determine how signals act

The same scores can produce different objectives under different weighting, clipping, and reduction rules.

| Layer | Variables studied |
| --- | --- |
| Signals | Quality/IG/cost weights, success gating, valid token support |
| Updates | Learning rate, KL, importance ratios, PPO clipping |
| Reduction | Token means, equal sequence weighting, component objectives |

Clipping the joint advantage and clipping components separately are not unconditionally equivalent; Appendix B05 lists historical comparisons.

## 3. Training Systems and Infrastructure

### 3.1 A stateful training loop

Trajectories, training signals, and policy versions must match their actual consumers.

<figure class="talk-figure " data-talk-figure="training-system" lang="en" aria-labelledby="talk-training-system-title">
<p class="tf-title" id="talk-training-system-title">Components and state boundaries of the training system</p>
<p class="tf-stage-label">Sampling and environment interaction</p><div class="tf-system-input"><div class="tf-node "><strong>Data &amp; runtime state</strong><small>Tasks, cursors, and pending state</small></div></div><p class="tf-runtime-lead" aria-hidden="true">↓</p><div class="tf-runtime"><div class="tf-node tf-emphasis"><strong>Rollout</strong><small>Generation, actions, and observations</small></div><span class="tf-edge tf-bidirectional" aria-hidden="true"></span><div class="tf-side-services"><div class="tf-node "><strong>Tools</strong><small>Search / Visit</small></div><div class="tf-node "><strong>Judge</strong><small>Called by the applicable scoring path</small></div></div></div><p class="tf-runtime-handoff">↓ Deliver trajectories and training signals</p><div class="tf-training"><p class="tf-stage-label">Learning and policy synchronization</p><div class="tf-linear"><div class="tf-node "><strong>Trajectories &amp; signals</strong><small>Rewards, credit, and advantages</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Actor update</strong><small>Actual parameter updates</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Policy sync</strong><small>New versions for subsequent rollouts</small></div></div></div><p class="tf-feedback-note">↺ Published policies feed subsequent rollouts</p><p class="tf-save"><strong>Save & restore</strong>Parameters, optimizer, cursors, and pending state reconnect at the corresponding consumer boundaries.</p>
<figcaption>Figure 3 · Tools and Judge follow the actual call path; saving and recovery remain within the implementation’s validated scope.</figcaption>
</figure>

### 3.2 Data versions and admission

Retaining sources and revisions produces a traceable training version.

| Object | Scale | Scope |
| --- | --- | --- |
| Original pool | 8,640 | Review and version disposition |
| Fixed usable version | 6,994 | 6,315 originals + 679 revisions |
| Priority research set | 512 | Frozen independently; not a simple union with the 6,994 |
| Known errors / substantive disputes | 835 / 767 | Withheld without changing historical inputs or scores |

Consumable data is not an error-free gold standard; content review and training admission are separate decisions.

### 3.3 Tool failures and cancellation

An outer request ending does not establish that background work or remote computation has stopped.

- Search / Visit / Summary: attribute errors individually and retain budgets, timeouts, and model-visible feedback.
- Cancelling queued work requires its executor handle; running threads release capacity only after they exit.
- The historical reproduction and 4 regressions cover in-process behavior, not termination of remote HTTP computation.

### 3.4 Judge: three validation denominators

Historical semantic review, a development panel, and service acceptance answer different questions.

| Scope | Record | Interpretation |
| --- | --- | --- |
| Historical review (2026-10-07) | 36,601 request entries; 71 confirmed false rejections + 101 confirmed false acceptances = 172 | Not independent questions or an overall error rate; supported and unresolved evidence remains separate |
| Frozen development panel | Final judgments 38/40 → 40/40; primary judgments remain 39/40 | 32 ordinary + 8 boundary cases, including 2 nonnumeric unknowns |
| Unified four-provider service | 1 actual primary request in final acceptance | Did not force all four routes or establish adoption in RL |

- The panel fix reused 41 existing responses and added only 1 actual review call, not an independent retest of 40 questions.
- The 172 historical confirmations and the 40-case panel have different denominators; the historical count provides no case-by-case revalidation with the newer version.

### 3.5 The same output, different parser results

Different plain settings caused the same 357 final outputs to be rejected in training and accepted in evaluation.

| Processing path | ERROR | END |
| --- | --- | --- |
| Original training parser: plain disabled | 357 | 0 |
| Original Eval parser: plain enabled | 0 | 357 |
| Training parser: only plain enabled | 0 | 357 |

This same-input audit covers 357 of 404 parsing failures; END means syntactic acceptance, not a correct answer.

### 3.6 Recovery must cross the consumption boundary

Recovery validation includes mixed batches, real updates, policy publication, and subsequent evaluation.

- A 256-member mixed batch reached updates 9 and 10 and publication/validation of policy version 5.
- Resuming from a checkpoint with 8 completed updates added 47 new updates, yielding 55 on the model path.
- Bitwise stochastic continuation is not claimed; recovery rework remains part of physical workload.

### 3.7 Scoring waits are inside rollout

A near-zero reward timer does not mean Judge has negligible cost.

| One step on 2026-09-18 | Time | Scope |
| --- | --- | --- |
| Complete iteration | 5411.207 s | Driver whole-step wall time |
| generate | 2859.381 s | Includes tools and scoring postprocessing |
| old-logprob | 734.510 s | Driver stage |
| reference | 165.967 s | Driver stage |
| Actor update | 1609.646 s | Driver stage |
| Judge client | 881.243 s / 154 calls | Sum of concurrent requests, already inside generate |
| reward | 0.000167 s | Reading existing results |

Request-duration sums must not be added again to whole-step wall time or treated as serial waiting.

### 3.8 Runtime and distributed execution

The frozen configuration completed real updates, saving, synchronization, and consumption of new policies.

| Layer | Components |
| --- | --- |
| Model and computation | Qwen3.5-4B, standard attention, GatedDeltaNet, long contexts |
| Training and conversion | VERL, Megatron-Core, MBridge, Transformer Engine |
| Inference and hardware | SGLang, Triton, one machine with 8×B300 |

- On 2026-09-04, GRPO and IGPO each completed 384 trajectories, 3 Actor updates, and a final checkpoint.
- All 8 ranks covered DCP, optimizer/RNG saving, and training–inference weight synchronization.
- Validation applies to this configuration; larger-model evaluation is not training validation.

### 3.9 Compilation caching and convolution optimization in training

The same three-step run retained 768 trajectories, with all 8 Actor ranks confirming the optimizations were active.

| Step | Actor-stage time |
| --- | --- |
| 1 | 973.715 s |
| 2 | 752.250 s |
| 3 | 655.359 s |

No additional Actor JIT entries were observed in steps 2–3; token counts and microbatch shapes differed, so this is not an isolated caching effect or whole-step speedup.

### 3.10 Container images: functional success is not a performance win

Two three-step native runs completed, but the single comparison did not support replacing the old default.

| Warm steps 2–3 | Old image | New candidate |
| --- | --- | --- |
| Mean whole-step seconds | 3233.142 | 3192.462 |
| Actor seconds / million packed tokens | 19.593 | 20.420 |
| old-logprob seconds / million tokens | 5.535 | 6.454 |
| Complete lifecycle | 3/3 passed | 3/3 passed |

Numerical agreement requires separate validation; speed does not replace it.

### 3.11 Scheduling observations for a complete Eval

Both groups completed generation and scoring on the same 512 questions: full-Eval time fell from 4505.21 s to 4126.03 s, an observed 8.42% reduction.

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="en" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">Scheduling observations for a complete Eval</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Scheduling observations for a complete Eval"><img src="/figures/agentic-rl-talk/eval-scheduling-en.svg" alt="Two complete Evals on the same 512 questions and model, with a zero-based wall-time axis." loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>Figure 4 · Shared tools, caching, and stochastic outputs limit causal attribution; individual-request latency also increased. <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

### 3.12 Environment delivery and observability

Installation, GPU operations, effective learning, and multi-machine training have distinct validation boundaries.

| Delivery | Established scope |
| --- | --- |
| DR-Venus environment on three machines | Software/image consistency; only the first machine completed a single-GPU check |
| Model-saving smoke test | Complete native checkpoint save; reward/gradient 0, lifecycle only |
| Run observability | Correlate run, step, trajectory, and request identities; trace tools and judging separately |
| Asset synchronization | Verify files, source manifests, and result archives; retain failures and recovery evidence |

## 4. Experimental Evidence and Key Findings

### 4.1 Three references, three questions

Overall RL gains and the increment from a new component need different controls.

| Reference | Question | Fixed conditions |
| --- | --- | --- |
| Initial SFT | Does RL improve the model overall? | Initial model and evaluation protocol |
| Trained control | How does the original path perform? | Data, dose, service conditions |
| New candidate | Does the component add value? | Actual differences, predetermined gates |

The same question count or seed does not ensure comparability; failures, unknowns, and the full denominator are retained.

### 4.2 Expanded evaluation changed the candidate decision

Nested evaluation did not support adopting the same sequence-ratio candidate.

| Development panel | Trained control: correct | Candidate: correct | Disposition |
| --- | --- | --- | --- |
| 128 questions | 68 | 68 | Point estimate passed; stronger evidence gate failed |
| Nested 246 questions | 131 | 121 | Fixed candidate not promoted |

This extends evaluation of existing policies, with no new training or independent test; the original SFT and trained-control identities remain distinct.

### 4.3 Three complete runs, no joint-objective pass

Execution completed, but none of the three specific configurations jointly preserved quality, reduced rounds, and met the length constraint.

| Configuration | Training members | Model-path updates | Validation nodes |
| --- | --- | --- | --- |
| Original combination | 6,994 | 55 | 8×246 questions |
| Update weight cap | 6,994 | 55 | 8×246 questions |
| Fixed cost scale | 6,994 | 55 | 8×246 questions |

- Nodes are 0/8/16/24/32/40/48/55, including initialization.
- Each run has its own initial reference and history: no fair cross-run causal ranking or rejection of an entire method family.
- The fixed-cost run made 61 physically executed successful updates; selecting a high point on the same development panel is not independent confirmation.

### 4.4 Original combination: fewer rounds with lower quality

The correct count fell from 120/246 to 1/246; less interaction did not preserve task quality.

<figure class="talk-figure" data-talk-figure="training-a009" lang="en" aria-labelledby="talk-training-a009-title">
<p class="tf-title" id="talk-training-a009-title">Complete curves for the original combination</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the original combination"><img src="/figures/agentic-rl-talk/training-a009-en.svg" alt="Original combination: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>Figure 5 · Gray dashed lines mark this run’s initial values; complete Q/R/T/U is in Appendix B01. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

### 4.5 Update weight cap: a short-run high point failed the joint gate

The correct count briefly rose to 117/246 without fewer rounds; the final count was 0/246.

<figure class="talk-figure" data-talk-figure="training-cap2" lang="en" aria-labelledby="talk-training-cap2-title">
<p class="tf-title" id="talk-training-cap2-title">Complete curves for the update weight cap</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the update weight cap"><img src="/figures/agentic-rl-talk/training-cap2-en.svg" alt="Update weight cap: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>Figure 6 · Gray lines mark this run’s initial values; metric scales match across figures. Full data: Appendix B02. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

### 4.6 Fixed cost scale: lower cost did not offset lost quality

Early increases in correct counts came with more rounds; the final run used fewer rounds and tokens but fell to 2/246 correct.

<figure class="talk-figure" data-talk-figure="training-fixed-cost" lang="en" aria-labelledby="talk-training-fixed-cost-title">
<p class="tf-title" id="talk-training-fixed-cost-title">Complete curves for the fixed cost scale</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer" aria-label="Open full-size figure: Complete curves for the fixed cost scale"><img src="/figures/agentic-rl-talk/training-fixed-cost-en.svg" alt="Fixed cost scale: eight recorded points for quality, mean rounds, total generated tokens, and pooled tokens per round." loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>Figure 7 · The x-axis counts model-path updates; token ticks show millions. Full original-unit data: Appendix B03. <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-en.svg" target="_blank" rel="noopener noreferrer">Open full-size figure ↗</a></figcaption>
</figure>

### 4.7 Defect evidence and degradation causes are separate

Establishing a local repair does not explain degradation across a complete run.

| Supported by evidence | Not established |
| --- | --- |
| Training/Eval parser differences, equal-reward numerics, recovery issues | An individual fix's independent quality contribution |
| Some successful batches consumed incident-exposed trajectories | Specific parameter damage or the sole cause of degradation |

Incident exposure, actual consumption, and parameter damage are not interchangeable.

## 5. Deliverables and Next Steps

### 5.1 Methods and roles

Published methods are foundations; authorship roles do not imply ownership of every implementation component.

| Direction | Work | Established role |
| --- | --- | --- |
| Search and evidence | WebFilter, EviNoteRAG | Co-first author |
| Process supervision | IGPO | First author |
| Process rewards and training recipes | Atom-Searcher, DR-Venus | Core contributor |
| Memory-system evolution | [MemPro](https://aclanthology.org/2026.emnlp-main.1364/) | Co-first author |

Listing methods together does not establish integration; MemPro evolves runnable memory construction–retrieval programs.

### 5.2 Reusable research assets

Runnable implementations and failure evidence support subsequent decisions.

- **Implementations**: training, sampling, tools, judging, synchronization, recovery.
- **Data**: versions, admission, development panels, actual exposure.
- **Evidence**: complete curves, negative results, runtime costs, scope.

### 5.3 Next: questions the evidence can distinguish

Focus on quality baselines, incremental process/cost effects, and research iteration efficiency.

<figure class="talk-figure " data-talk-figure="next-questions" lang="en" aria-labelledby="talk-next-questions-title">
<p class="tf-title" id="talk-next-questions-title">Existing assets and next research questions</p>
<p class="tf-stage-label">Existing reusable assets</p><div class="tf-sources"><div class="tf-node tf-soft"><strong>Method implementations</strong><small>Training and scoring paths</small></div><div class="tf-node tf-soft"><strong>Runtime infrastructure</strong><small>Tools, recovery, and observability</small></div><div class="tf-node tf-soft"><strong>Data &amp; evidence</strong><small>Versions, controls, and curves</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>Support the next research decision</strong></div></div><div class="tf-split" aria-hidden="true"><span>↓</span><span>↓</span><span>↓</span></div><div class="tf-sources" role="group" aria-label="Next research questions"><div class="tf-node tf-future"><strong>Quality baseline</strong><small>An interpretable learning reference</small></div><div class="tf-node tf-future"><strong>Process &amp; cost effects</strong><small>Conditions for a useful increment</small></div><div class="tf-node tf-future"><strong>Iteration efficiency</strong><small>Reliable decisions sooner</small></div></div>
<figcaption>Figure 8 · Research directions, not newly started experiments or established incremental gains.</figcaption>
</figure>

## Appendix: Numbers and Scope

Each validation node has 246 questions: Q is the number correct, R mean logical rounds, T total generated tokens on the panel, and U=ΣT/ΣR. Decimals are rounded to three places for display; each run retains its own initial reference.

### B01 Original combination: complete Q/R/T/U

All eight nodes are retained; a short-run high point does not replace the endpoint.

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

### B02 Update weight cap: complete Q/R/T/U

The brief increase in the correct count did not also satisfy the round and length constraints.

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

### B03 Fixed cost scale: complete Q/R/T/U

Lower final rounds and tokens accompanied lost quality, not quality-preserving compression.

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

### B04 Formal Partial and Flash workloads

Partial's four experimental groups each contained 96 questions × 8 trajectories, with every trajectory retained.

| Algorithm | Synchronous container seconds | Partial container seconds | Trajectories per arm |
| --- | --- | --- | --- |
| GRPO | 10828.329 | 9593.208 | 768 |
| IGPO | 11678.676 | 10807.729 | 768 |

- The fixed workload on 2026-09-22 validated complete-group delivery and continuation across versions.
- Shared tools, caches, trajectories, and correction differences limit attribution to scheduling alone.
- Flash-IGPO separately used 768 distinct questions, n=1, and completed 3 effective updates and workload draining; this is neither a matched-exposure speed comparison nor a long-term quality result.

### B05 Historical update-rule comparisons

Joint-advantage clipping and separate component clipping are not unconditionally the same objective.

| Variable | Comparison scope |
| --- | --- |
| Learning rate | Constants 1e−6/5e−7, linear decay, matched mean dose |
| KL | Bounded comparison of 0.001 and 0.0005 |
| PPO | Upper clipping, shared/local importance ratios |
| Reduction | Token means, equal sequence weighting, component objectives |
| Sampling | Synchronous, asynchronous, Partial, actual exposure |

These are historical research dimensions, not a selected unified recipe.

### B06 Numerical validation boundaries

Numerical invariants and task-quality gains are validated separately.

| Historical validation | Established scope | Does not establish |
| --- | --- | --- |
| Equal-reward zeroing: 9 groups, 72 members | Advantages and returns are 0 | No other update during the training step |
| 512 members, 64 groups, two updates | Native numerical validation | An individual patch's independent quality gain |

KL terms or optimizer state can still change parameters; zero advantages do not imply a zero update for the whole step.

### B07 Recovery rework remains in the physical workload

The fixed-cost run has 55 model-path updates but 61 physically executed successful updates.

| Record | Updates |
| --- | --- |
| Successful updates in the first attempt | 22 |
| Updates saved at the recovery point | 16 |
| New updates after recovery | 39 |
| Model path | 55 |
| Physically executed successful updates | 61 |

The model path consumed 6,994 members; work repeated after the recovery point remains in the accounting.

### B08 Align prediction rows with target tokens

Target position j is scored by prediction row j−1.

| Input position | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Input token | BOS | P0 | P1 | A0 | A1 |
| Target of that row | P0 | P1 | A0 | A1 | Next |

Read rows 2 and 3 to score A0 and A1; these symbols are synthetic.
