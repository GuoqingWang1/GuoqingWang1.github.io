---
title: "Agentic RL：研究与系统实践"
description: "按五章梳理搜索型 Agent 的学习方法、训练基建与完整实验，保留执行规模、适用范围和未解问题。"
category: technical
lang: zh-CN
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T02:02:30+08:00"
draft: false
review: true
---

这是一份公开的 talk 工作稿，用于逐章讨论内容，再整理为演示文稿。它包含公开方法、后续研究探索、基建工作和完整实验记录。第一章是当前精修重点，其余章节保留现有讲稿的内容和适用范围。

材料主要来自2026年8月底至11月初的可追溯工作。已有论文作为方法基础另列，发表日期不代替实际研发日期。更早阶段和个人具体分工仍在补充。

## 一、研究问题与工作全景

### 1.1 研究目标

搜索型 Agent 通过多轮生成和工具调用完成任务。它需要选择下一步行动，从外部材料中获得信息，判断证据是否充分，并在合适的时机给出回答。每一次行动都会改变后续上下文，也会消耗生成和工具资源。

我们的目标是在保持或提升任务质量的前提下，提高交互效率。平均轮次、总生成 token 和单轮输出长度需要一起观察：轮次减少以后，还要判断总消耗怎样变化，以及是否用更长的单轮输出来补偿。

围绕这个目标，工作既包括奖励、信用分配和更新规则，也包括数据、工具、评分、训练恢复及评测。前者决定希望模型学到什么，后者决定这些信号能否正确进入训练，以及结果能否支持可靠判断。

### 1.2 用一个任务理解执行与学习

**合成教学示例：虚构产品 A、B，哪一款更早正式发布？**

Agent 需要先查找材料，再核对日期口径。预告时间、正式发布时间和上市销售时间可能不同，检索到日期以后还要判断它是否回答了同一个问题。

<figure class="talk-figure " data-talk-figure="search-agent-loop" lang="zh-CN" aria-labelledby="talk-search-agent-loop-title">
<p class="tf-title" id="talk-search-agent-loop-title">Search Agent：行动、观察与回答</p>
<div class="tf-agent-loop"><div class="tf-node tf-state"><strong>任务与当前上下文</strong><small>问题、已有材料、行动历史</small></div><span class="tf-edge tf-state-edge" aria-hidden="true"></span><div class="tf-node tf-agent tf-emphasis"><strong>Search Agent</strong><small>选择下一步行动，或结束任务</small></div><span class="tf-edge tf-tool-edge" aria-hidden="true"></span><div class="tf-node tf-tools tf-soft"><strong>工具</strong><small>Search / Visit，按需选择</small></div><div class="tf-return"><span>工具观察回填到上下文，再次判断</span></div><div class="tf-node tf-answer"><strong>回答与依据</strong><small>Agent 选择结束时</small></div><span class="tf-answer-edge" aria-hidden="true"></span></div><div class="tf-training"><p class="tf-stage-label">训练阶段，与任务执行分开</p><div class="tf-linear tf-linear-four"><div class="tf-node "><strong>轨迹与版本</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>训练信号</strong><small>结果／过程／成本，按配方启用</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>策略更新</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>后续采样</strong></div></div></div>
<figcaption>图1 · 任务内可以多轮调用工具；工具观察仍需核查。下方描述训练阶段，不表示每次工具调用都会更新模型。</figcaption>
</figure>

训练需要保留完整轨迹和对应的策略版本，再按实验配方构造奖励与优势。监督可以来自最终结果、过程评价或成本信号；不同方法启用的信号与组合不同。权重更新发生在训练阶段，更新后的策略用于后续采样。

这一例子说明了研究涉及的接口：查询动作影响证据，工具接口影响观察，评分规则影响奖励，更新实现决定信号如何作用于参数。评测则需要检查策略最终改变了什么行为。

### 1.3 五层工作

| 层面 | 主要工作 |
| --- | --- |
| 方法 | 信号定义、过程信用、质量与成本、实际更新规则 |
| 数据 | 来源与版本、审阅修订、训练准入与验证隔离 |
| 环境 | Search、Visit、Summary 和 Judge 的接口、失败反馈与服务行为 |
| 训练与基建 | 模型和镜像适配、分布式更新、采样调度、权重发布、保存与恢复 |
| 评测与诊断 | 初始模型、训练对照和候选的比较，完整曲线、失败和成本归属 |

后续章节沿着这张工作图展开。算法部分解释学习信号和方案取舍，基建部分展示方法怎样进入可运行、可恢复的系统，实验部分说明哪些判断获得了支持、哪些问题仍待回答。

### 1.4 已有执行规模与当前认识

| 已核规模 | 含义与范围 |
| --- | --- |
| 6,994条可用训练数据 | 固定版本包含6,315条原版与679条修订，可用范围与版本有记录 |
| 3次完整训练 | 三个具体方案均形成55次模型路径更新的完整记录，恢复重算另记物理工作量 |
| 每次8个验证节点，每点246题 | 包含初始点，属于开发使用，不是相互独立的测试集 |

这些规模包含团队协作，个人具体工作包将在对应部分进一步确认。数据可用不等于全量无误金标准，训练完成也需要结合质量和效率指标解释。当前这三条具体配置均未产生满足质量保持与轮次压缩联合要求的模型。

完整实验提供了可复用的认识：它帮助区分短程信号与长期行为，记录固定候选的适用边界，并指出哪些环节值得继续研究。

## 二、算法探索与学习信号

### 2.1 搜索与证据处理成为可学习的行为

[WebFilter](https://arxiv.org/abs/2508.07956) 与 [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) 分别约束信息获取和信息利用。

#### [WebFilter](https://arxiv.org/abs/2508.07956)

- 限定来源的查询
- 检索结果过滤
- 行为奖励与结果奖励

#### [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/)

- 生成精简证据笔记
- 检查对答案的支持关系
- 证据质量奖励

两条公开方法并列展示，未声称已在一个系统中联合训练。

### 2.2 [Atom-Searcher](https://arxiv.org/abs/2508.12800) 提供细粒度过程反馈

把长程推理划成有功能意义的单元，让中间步骤获得监督。

1. **Atomic Thought**：定位推理单元。
2. **奖励模型 RRM**：评价单元。
3. **过程奖励 ATR**：结合终局结果。
4. **RL 更新**：课程式调度。

依据公开方法；过程与结果的具体权重随论文配方定义。

### 2.3 [IGPO](https://arxiv.org/abs/2510.14967) 用信息获取构造轮级信号

观察前后的答案概率变化，为多轮搜索提供更密集的反馈。

公开 IGPO 使用策略对正确答案的概率变化构造轮级信息增益，并与终局结果监督结合。与仅在结束时给出结果奖励的轨迹相比，轮级信号提供了中间反馈。具体评分函数、上下文和奖励公式按对应论文或实验版本解释。

方法示意：评分函数、上下文与奖励公式需绑定具体版本。

### 2.4 从信息增益走向完整训练方案

[DR-Venus](https://arxiv.org/abs/2604.19859) 将公开数据、监督微调和 Agentic RL 接成训练流程。

1. **公开轨迹**：数据来源。
2. **清洗与重采样**：长轨迹覆盖。
3. **SFT**：建立能力起点。
4. **IGPO 式 RL**：过程与结果反馈。

内部后续研究另有信用、成本和更新改动，不能直接写成公开论文的原配方。

### 2.5 原始信息增益与实际优势需要分开检查

一个分数要经过信用分配与更新规则，才影响学习。

<figure class="talk-figure " data-talk-figure="credit-update-flow" lang="zh-CN" aria-labelledby="talk-credit-update-flow-title">
<p class="tf-title" id="talk-credit-update-flow-title">从评分到实际更新的几个层次</p>
<div class="tf-sources"><div class="tf-node tf-soft"><strong>过程评分</strong><small>例如信息增益</small></div><div class="tf-node tf-soft"><strong>结果信号</strong><small>任务质量</small></div><div class="tf-node tf-soft"><strong>成本信号</strong><small>交互与生成</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>信用与优势</strong><small>按配方构造与启用</small></div></div><div class="tf-to-first" aria-hidden="true"></div><div class="tf-linear"><div class="tf-node "><strong>更新规则</strong><small>ratio / clip / reduction</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>参数更新</strong><small>实际作用仍需验证</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>后续行为</strong><small>通过任务评测检查</small></div></div>
<figcaption>图2 · 机制关系示意。各项按配置启用，不代表这些信号已形成一套优选组合；评分、优势与任务收益分别验证。</figcaption>
</figure>

1. **原始评分差**：信息变化。
2. **门控与累计**：动作如何分摊。
3. **总优势**：质量、IG、成本。
4. **策略更新**：ratio、clip、归约。

研究维度包括正负信号、观测条件化、启用阶段和归一化；代理改善仍需任务验证。

### 2.6 成本优化同时约束质量与生成行为

轮次下降可能伴随单轮变长，必须联合解释。


| 观察量 | 回答的问题 |
| --- | --- |
| 任务质量 Q | 答案质量/正确率是否保持 |
| 平均轮次 R | 交互是否更集中 |
| 总生成 token T | 总体生成消耗怎样变化 |
| 单轮长度 U | 是否以更长输出补偿少轮次 |

成本信用与实际资源账单分别记录；不通过删除慢样本获得表面收益。

### 2.7 更新规则改变信号的实际作用

信用、概率比率、裁剪与归约共同决定优化目标。

#### 信号与权重

- 质量、IG 与成本的相对权重
- 不同长度轨迹的贡献
- 成功门控与有效 token 支持

#### 更新与归约

- 学习率与 KL
- 重要性比率和 PPO 裁剪
- token 均值与序列等权

这里关注机制差分；相关更新变量与条件说明见附录B05、B06。

### 2.8 Partial 与 Flash 扩展了训练组织方式

调度方式和样本组织也会改变实际学习条件。


| 方案 | 正式验证规模 | 已证明的范围 |
| --- | --- | --- |
| Partial rollout | 4组，各96题×8轨迹 | 完整组交付、跨版本续跑 |
| Flash-IGPO | 768个不同问题，n=1 | 3次有效更新、完整排空 |

不同曝光与共享工具条件限制公平比较；功能和容量通过不证明长期质量。

## 三、训练系统与基础设施

### 3.1 模型、工具、评分与更新接成有状态闭环

每一段接口都需要明确字段、版本和生命周期。

<figure class="talk-figure " data-talk-figure="training-system" lang="zh-CN" aria-labelledby="talk-training-system-title">
<p class="tf-title" id="talk-training-system-title">训练系统的组件与状态边界</p>
<p class="tf-stage-label">采样与环境交互</p><div class="tf-system-input"><div class="tf-node "><strong>数据与运行状态</strong><small>任务、游标与待消费状态</small></div></div><p class="tf-runtime-lead" aria-hidden="true">↓</p><div class="tf-runtime"><div class="tf-node tf-emphasis"><strong>Rollout</strong><small>生成、行动与观察回填</small></div><span class="tf-edge tf-bidirectional" aria-hidden="true"></span><div class="tf-side-services"><div class="tf-node "><strong>Tools</strong><small>Search / Visit</small></div><div class="tf-node "><strong>Judge</strong><small>按实际评分路径调用</small></div></div></div><p class="tf-runtime-handoff">↓ 交付轨迹与训练信号</p><div class="tf-training"><p class="tf-stage-label">学习与策略同步</p><div class="tf-linear"><div class="tf-node "><strong>轨迹与训练信号</strong><small>奖励、信用与优势</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Actor 更新</strong><small>实际参数更新</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>权重发布</strong><small>新版本用于后续 Rollout</small></div></div></div><p class="tf-feedback-note">↺ 发布的策略用于后续 Rollout</p><p class="tf-save"><strong>保存与恢复</strong>参数、优化器、数据游标与待消费状态，在对应消费边界衔接。</p>
<figcaption>图3 · 逻辑关系示意，工具与评分不是固定串行流水线。不同实现的调用位置和恢复能力仍以实际验收为准。</figcaption>
</figure>

执行链包含任务状态、模型生成与工具、评分与奖励、信用与优势、Actor 更新、权重发布。新的策略版本供后续采样使用，保存和恢复贯穿生命周期。对象字段、数值语义、策略版本和时间边界都需要对应实际消费者。

这里概括系统关系，不将不同历史组件拼成一套已验证的最优配置。

### 3.2 训练数据形成了可追溯的版本链

保留来源、修订与准入范围，支持后续实验复用。


| 规模 | 对象 | 范围 |
| --- | --- | --- |
| 8,640 | 原始数据池 | 审阅、暂扣和版本处置 |
| 6,994 | 固定可用版本 | 6,315原版＋679修订 |
| 512 | 优先交付研究集 | 独立冻结版本，随后继续处理全池 |

可消费版本不等同无误金标准；512与6994的版本关系不能简单并集。

### 3.3 工具服务需要正确处理失败与取消

Search、Visit 和 Summary 的行为会进入 Agent 的观察。

#### 已建设的接口能力

- 服务迁移与缓存
- 逐项错误归属
- 预算、超时与模型可见错误

#### 代表案例：排队工作取消

- 结果通道取消
- 继续定位执行器中的 pending 工作
- 运行中的线程等待真实退出

历史取消复现与4项回归支持进程内边界，不代表远端HTTP计算已终止。

### 3.4 评分语义与服务可用性分别验收

固定开发面板的最终判定符合预期，由38/40变为40/40。


| 冻结开发面板口径 | 修复前 | 修复后 |
| --- | --- | --- |
| 最终判定符合预期 | 38/40 | 40/40 |
| 原始主判 | 39/40 | 39/40 |

面板包含32个普通案例和8个边界案例，其中2个应当保留非数值的 unknown。修复复用41个旧响应，只新增1次必要的真实复核，不能表述为重新独立测试40题。

另有一项截至2026-10-07的历史审查：36,601个 Judge 请求条目中，确认误拒71个、误收101个，共172个确认误判。统计单位是历史 task_id 请求条目，并非独立题目数；另有未决案例，不能据此给出总体错误率。这172个案例与上面的40例开发面板也不是同一分母，这项历史统计未提供新版逐项复验结果。

统一服务的最终独立验收包含1个真实请求，实际走primary路径，没有强制逐路测试所有provider。新配置的Actor或原生RL采用另行验收。

包含应保留的unknown。统一四provider服务验收不等于四路逐一实测，也不等于新profile已通过RL。

### 3.5 同一输出，在训练与评测中遭遇不同解释

对同一批357条末次输出，原生parser给出两种不同结果。


| 处理路径 | ERROR | END |
| --- | --- | --- |
| 原训练parser：plain关闭 | 357 | 0 |
| 原Eval parser：plain开启 | 0 | 357 |
| 训练parser：仅开启plain | 0 | 357 |

这是404条解析失败中的同输入审计。END表示语法接受，未将答案重新判为正确。

### 3.6 恢复验收跨过混批、更新和发布

加载状态只是起点，真实消费链才证明恢复路径可用。

1. **加载状态**：原checkpoint。
2. **新旧混批**：256成员混批。
3. **真实更新**：第9、10次更新。
4. **发布与验证**：策略版本5及后续曲线。

A009从已完成8次更新的checkpoint恢复后，新增47次更新，模型路径累计55次；不声称逐位随机续接。

### 3.7 计时归属决定优化方向

一次真实完整训练步骤，评分等待已经嵌在rollout中。


| 原单步观察量 | 记录值 | 范围 |
| --- | --- | --- |
| 完整 iteration | 5411.207 s | 同一driver的整步墙钟 |
| generate | 2859.381 s | 含工具与评分后处理 |
| old-logprob | 734.510 s | driver阶段 |
| reference | 165.967 s | driver阶段 |
| Actor update | 1609.646 s | driver阶段 |
| Judge客户端 | 154 calls / 累计881.243 s | 并发请求累计时间 |
| reward边界 | 0.000167 s | 读取现成结果 |

2026-09-18单次观测。Judge请求累计时间不能加到generate之外，也不能当作串行墙钟。

### 3.8 Qwen3.5 与 B300 形成可复用运行基线

打通模型算术、训练框架、推理引擎和硬件接口。


| 建设层 | 具体工作 |
| --- | --- |
| 模型与算术 | 标准注意力、GatedDeltaNet及长上下文路径 |
| 训练与转换 | VERL、Megatron-Core、MBridge、Transformer Engine |
| 推理与硬件 | SGLang、Triton及B300工具链适配 |
| 验收与固化 | 运行清单、真实更新、保存、同步与正常退出 |

2026-09-04冻结签名：Qwen3.5-4B、单机8×B300。不能外推到所有模型和拓扑。

### 3.9 分布式更新、保存与权重发布完成实测闭环

GRPO、[IGPO](https://arxiv.org/abs/2510.14967)各完成384条轨迹、三次Actor更新与最终checkpoint。

1. **Actor更新**：8个rank。
2. **完整保存**：DCP、优化器与RNG。
3. **权重同步**：训练/推理桥接。
4. **Rollout新版本**：确认消费策略版本。

原记录覆盖最终checkpoint完整性与权重同步；更大模型的评测不作为训练验收。

### 3.10 编译缓存与卷积优化进入真实训练

同一完整三步运行保留768条轨迹，8个Actor rank确认优化生效。


| 真实训练阶段 | Actor耗时 |
| --- | --- |
| Step 1 | 973.715 s |
| Step 2 | 752.250 s |
| Step 3 | 655.359 s |

后两步没有新增可观测 Actor JIT 入口。

三步实际token与微批形状不同；该曲线是运行观测，不能单独归因缓存或当作整步加速率。

### 3.11 镜像升级以实际运行和数值证据决定取舍

完成优化迁移、两组三步原生训练及固定输入诊断。


| 热态step2–3观测 | 旧镜像 | 新候选 |
| --- | --- | --- |
| 整步平均秒 | 3233.142 | 3192.462 |
| Actor秒/百万packed token | 19.593 | 20.420 |
| old-logprob秒/百万token | 5.535 | 6.454 |
| 完整生命周期 | 3/3通过 | 3/3通过 |

单次对照未证明候选稳定端到端胜出，保留旧默认。跨版本数值差异另有合同，不用速度覆盖。

### 3.12 持续补入改善完整Eval的批处理效率

相同512题全部完成，完整Eval墙钟由4505.21秒降到4126.03秒。


| 方式 | 完整Eval墙钟 | 完整性 |
| --- | --- | --- |
| 原batch256 | 4505.21 s | 512/512 |
| 持续active256 | 4126.03 s | 512/512 |

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="zh-CN" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">完整 Eval 的调度观测</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：完整 Eval 的调度观测"><img src="/figures/agentic-rl-talk/eval-scheduling-zh.svg" alt="同512题、同模型的两次完整Eval，零起点比较墙钟时间。" loading="lazy" decoding="async" width="768" height="307.2"></a>
<figcaption>图4 · 共享工具、缓存与随机输出限制精确因果归因；单请求延迟也有所上升。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

两组均完整完成512题生成与评分。

本次观测下降8.42%；随机输出、共享工具与缓存限制精确因果归因，单请求延迟也有所上升。

### 3.13 环境交付与观测支撑持续研究

代码、模型、数据、运行身份与结果形成可追溯交付。


| 建设内容 | 已记录交付 | 范围 |
| --- | --- | --- |
| [DR-Venus](https://arxiv.org/abs/2604.19859)环境 | 三机软件安装与镜像一致性 | 首台完成单卡GPU检查 |
| 模型保存冒烟 | 原生checkpoint完整保存 | 奖励/梯度为0，仅证明生命周期 |
| 运行观测 | run、step、轨迹、请求身份关联 | 训练、工具和评分分层追踪 |
| 资产与同步 | 文件校验、源码清单、结果归档 | 保留历史失败和恢复证据 |

软件安装、GPU算子、有效学习与多机训练分别验收；不把三个安装节点写成三机训练已通过。

## 四、实验证据与关键认识

### 4.1 三种参照回答不同的研究问题

总体训练收益与新增组件增量需要分别判断。


| 参照 | 检验什么 | 需要固定什么 |
| --- | --- | --- |
| 初始SFT | RL整体是否改善 | 模型起点和评测协议 |
| 训练对照 | 原训练路径的效果 | 数据、剂量与服务条件 |
| 新增候选 | 新增组件是否有价值 | 实际差分与预定验收要求 |

相同题数或相同seed不能单独保证实验可比；失败、unknown和分母完整保留。

### 4.2 探索按研究问题归并

实现、数值资格和任务结果分别保留，便于识别下一步的价值。


| 问题族 | 已经研究的维度 |
| --- | --- |
| 过程信号 | IG开关、条件化、正负、成功门控、启用阶段 |
| 成本信用 | 轮次/token、累计方式、归一化、固定尺度 |
| 更新规则 | LR、KL、ratio、clip、token/序列归约 |
| 训练组织 | 同步、Partial、单轨迹、数据曝光与恢复 |

历史条目、失败重试和独立科学实验不混算；相关研究维度见附录B04–B06，具体处置仍需结合对应原记录。

### 4.3 扩展验证改变了固定候选的判断

sequence-ratio 的同一策略在128与嵌套246开发面板上接受检查。


| 开发面板 | 训练对照正确题数 | 候选正确题数 | 原处置 |
| --- | --- | --- | --- |
| 128题 | 68 | 68 | 点门通过，强门未过 |
| 嵌套246题 | 131 | 121 | 不晋升该固定候选 |

同一候选的证据范围扩大后，原先的点值信号没有成为充分的采用依据。

这是同策略扩评，不是第二次训练，也不是独立测试。保留原始SFT与训练对照身份。

### 4.4 三条完整训练给出了系统级验证

每条均完成一个6994成员的模型路径及八个完整验证点。


| 冻结方案 | 成员 | 模型路径更新 | 验证节点 |
| --- | --- | --- | --- |
| 原始组合 | 6,994 | 55 | 8 × 246题 |
| 更新权重上限 | 6,994 | 55 | 8 × 246题 |
| 固定尺度成本 | 6,994 | 55 | 8 × 246题 |

节点为0/8/16/24/32/40/48/55。固定成本方案物理成功更新为61次，恢复成本另记。

### 4.5 完整曲线尚未给出联合目标合格模型

三条具体配置均未同时满足原定的质量保持、轮次降低与长度约束。

<figure class="talk-figure" data-talk-figure="training-a009" lang="zh-CN" aria-labelledby="talk-training-a009-title">
<p class="tf-title" id="talk-training-a009-title">原始组合方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：原始组合方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-a009-zh.svg" alt="原始组合方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="600"></a>
<figcaption>图5 · 灰虚线为该运行自身的初始参照。三条具体配置均未达到原联合要求，不作跨运行公平排名。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

<figure class="talk-figure" data-talk-figure="training-cap2" lang="zh-CN" aria-labelledby="talk-training-cap2-title">
<p class="tf-title" id="talk-training-cap2-title">更新权重上限方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：更新权重上限方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-cap2-zh.svg" alt="更新权重上限方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="600"></a>
<figcaption>图6 · 各指标坐标尺度与另外两图一致，初始参照属于该运行。折线仅连接已有观测，没有平滑或新增统计。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

<figure class="talk-figure" data-talk-figure="training-fixed-cost" lang="zh-CN" aria-labelledby="talk-training-fixed-cost-title">
<p class="tf-title" id="talk-training-fixed-cost-title">固定尺度成本方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：固定尺度成本方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" alt="固定尺度成本方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="600"></a>
<figcaption>图7 · 横轴为模型路径更新次数。总token保持原单位，只把刻度显示为百万；完整数值仍保留在附录B11。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>


| 模型路径更新次数 | 原始组合正确数 | 权重上限正确数 | 固定成本正确数 |
| --- | --- | --- | --- |
| 0 | 120 | 115 | 106 |
| 8 | 117 | 117 | 116 |
| 16 | 111 | 111 | 114 |
| 24 | 85 | 85 | 86 |
| 32 | 49 | 52 | 58 |
| 40 | 21 | 7 | 13 |
| 48 | 2 | 1 | 5 |
| 55 | 1 | 0 | 2 |

每点均为246题。

每个运行保留自身初始参照。不同运行不作公平排名，未据此否定整个方法家族。

### 4.6 已定位的缺陷与未知原因分别收口

工程诊断与科学因果需要不同证据。

#### 已有具体证据

- 训练与评测解析差异
- 同奖数值与恢复链问题
- 部分成功批次消费了事故暴露轨迹

#### 仍待确定

- 单项修复的独立质量贡献
- 具体参数损害
- 完整训练退化的唯一原因

事故暴露、实际消费与参数损害分别判断，不以关联直接替代因果。

## 五、阶段交付与下一步

### 5.1 方法成果形成了清楚的技术谱系

围绕搜索Agent的行动、监督与训练方案积累方法。


| 技术问题 | 代表工作 | 既定角色 |
| --- | --- | --- |
| 搜索与证据 | [WebFilter](https://arxiv.org/abs/2508.07956)、[EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) | 共同一作 |
| 过程监督 | [IGPO](https://arxiv.org/abs/2510.14967) | 第一作者 |
| 过程奖励与训练方案 | [Atom-Searcher](https://arxiv.org/abs/2508.12800)、[DR-Venus](https://arxiv.org/abs/2604.19859) | 核心贡献者 |
| 邻近系统演化 | [MemPro](https://aclanthology.org/2026.emnlp-main.1364/) | 共同一作 |

论文角色与具体实施分工分别记录；方法并列不代表已完成系统集成。

### 5.2 工作留下了可复用的研究资产

实现与证据可以支持下一轮更快作出可靠判断。


| 资产 | 后续用途 |
| --- | --- |
| 方法与训练实现 | 复用学习信号、更新与采样路径 |
| 版本化数据与评测 | 绑定样本、协议、结果和比较范围 |
| 工具、评分与恢复 | 减少重复接入和故障返工 |
| 诊断与负结果 | 排除旧假设，约束下一轮设计 |

个人主导、共同完成与核心参与的具体模块，仍需逐项确认。

### 5.3 下一阶段聚焦可判别的问题

继续投入的依据，是新证据能否改变研究选择。

<figure class="talk-figure " data-talk-figure="next-questions" lang="zh-CN" aria-labelledby="talk-next-questions-title">
<p class="tf-title" id="talk-next-questions-title">已有资产与后续研究问题</p>
<p class="tf-stage-label">已有可复用资产</p><div class="tf-sources"><div class="tf-node tf-soft"><strong>方法实现</strong><small>训练与评分路径</small></div><div class="tf-node tf-soft"><strong>运行基建</strong><small>工具、恢复与观测</small></div><div class="tf-node tf-soft"><strong>数据与证据</strong><small>版本、对照与曲线</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>支撑下一轮判断</strong></div></div><div class="tf-split" aria-hidden="true"><span>↓</span><span>↓</span><span>↓</span></div><div class="tf-sources" role="group" aria-label="后续研究问题"><div class="tf-node tf-future"><strong>质量基线</strong><small>建立可解释的质量学习参照</small></div><div class="tf-node tf-future"><strong>过程与成本效应</strong><small>识别有效增量的适用条件</small></div><div class="tf-node tf-future"><strong>迭代效率</strong><small>更快取得可信的研究结论</small></div></div>
<figcaption>图8 · 研究方向示意，不表示这些方案已启动或已获得效果结论。</figcaption>
</figure>

#### 质量与学习信号

- 建立可解释的质量基线
- 检验过程与成本信号何时有效
- 围绕明确竞争解释做最小对照

#### 可靠的研究迭代

- 复用已验实现与数据
- 保留完整失败和成本
- 用完整结果决定取舍

以下方向是基于现有记录提出的研究问题，具体实验设计仍需单独确定。

## 附录：补充材料与完整聚合

以下保留原讲稿的15组备份材料。数字与适用范围沿用对应记录，便于后续按需要剪枝。

### B01 可追溯的阶段里程碑


| 时间 | 代表活动 |
| --- | --- |
| 8月底 | 真实训练计时与瓶颈定位 |
| 9月上中旬 | 运行环境、Actor优化、工具与评分 |
| 9月下旬 | Partial、Flash、数据与长程训练 |
| 10月 | 信用、成本、更新与数据治理 |
| 11月初 | 完整曲线收口与基础复盘 |

更早研发日期与个人工作包尚未齐全；公开发表日期不代替投入时间。

### B02 公开方法的监督对象不同


| 工作 | 学习或改进对象 | 信号来源 |
| --- | --- | --- |
| [WebFilter](https://arxiv.org/abs/2508.07956) | 查询与过滤 | 搜索行为与结果 |
| [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) | 证据笔记 | 答案支持关系 |
| [Atom-Searcher](https://arxiv.org/abs/2508.12800) | 原子思维单元 | 外部奖励模型 |
| [IGPO](https://arxiv.org/abs/2510.14967) | 多轮信息获取 | 正确答案的条件概率变化 |
| [DR-Venus](https://arxiv.org/abs/2604.19859) | 完整训练方案 | 数据、SFT、[IGPO](https://arxiv.org/abs/2510.14967)式RL |

机制对照，不构成跨论文的公平性能排名。

### B03 轮级评分还需要正确的token对齐

目标位置j由预测行j−1评分。


| 输入位置 | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| 输入token | BOS | P0 | P1 | A0 | A1 |
| 该行目标 | P0 | P1 | A0 | A1 | 后续 |

给A0、A1打分读取第2、3行。这里是合成位置示意，未展示受保护样本。

### B04 过程信用的历史研究维度


| 维度 | 比较内容 | 结论层级 |
| --- | --- | --- |
| 来源 | 原始全历史差、观测条件化 | 各固定版本保留结果 |
| 符号 | signed、positive-only | 未确立普遍优势 |
| 门控 | 结果成功条件、有效支持 | 条件与使用范围分开 |
| 阶段 | 全程、早期、后期关闭 | 不选中点冒终局 |
| 映射 | 局部、累计、门控后优势 | 需要追到真实更新 |

依据历史问题索引；本页概括范围，不新增训练结论。

### B05 成本信用与资源账单分开解释

#### 实际消耗

- 轮次与生成token
- 工具请求与重试
- 原生墙钟与恢复成本

#### 进入优化的信用

- 即刻成本与未来成本
- 归一化与分配方式
- 总优势、裁剪与归约

Lclip(r, Aq＋Aig＋Ac) 与分量目标分别裁剪，不能无条件视为同一目标。

### B06 更新规则的历史对照范围


| 变量 | 已研究的具体差分 |
| --- | --- |
| 学习率 | 常数1e−6/5e−7、线性衰减、匹配平均剂量 |
| KL | 0.001与0.0005的限定对照 |
| PPO | 上裁剪、共享/局部重要性比率 |
| 归约 | token均值、序列等权、分量目标 |
| 采样与消费 | 同步、异步、Partial、实际曝光 |

历史候选不等于现行最优配置；不完整对照不补成有效实验。

### B07 Partial正式负载保留了全部轨迹


| 算法 | 同步容器秒 | Partial容器秒 | 每臂轨迹数 |
| --- | --- | --- | --- |
| GRPO | 10828.329 | 9593.208 | 768 |
| [IGPO](https://arxiv.org/abs/2510.14967) | 11678.676 | 10807.729 | 768 |

2026-09-22固定负载观测。共享工具、缓存、轨迹及校正差异限制纯调度因果归因。

### B08 运行栈支撑长上下文Agent训练

1. **模型运行环境**：Qwen / B300。
2. **分布式Actor**：VERL / MCore。
3. **Rollout引擎**：SGLang。
4. **工具与评分**：Search / Visit / Judge。

历史环境快照；接口、数值、保存恢复和实际训练分别验收。

### B09 故障分类决定处理边界


| 观测 | 处置原则 |
| --- | --- |
| 排队任务取消 | 找到实际执行句柄，成功取消pending工作 |
| 运行中线程 | 等待真实退出后归还容量 |
| 未知评分语义 | 保留unknown，拒绝伪造数值奖励 |
| 部分工具失败 | 逐项归属并向Agent反馈 |
| 恢复失败 | 复用合格状态，保留原失败与工作量 |

进程内回归不自动证明远端计算已经停止。

### B10 数据版本与审阅范围分别登记


| 版本/口径 | 记录的规模 | 解释 |
| --- | --- | --- |
| 原池 | 8640 | 结构通过不等全事实正确 |
| 优先研究集 | 512 | 独立冻结用途与版本 |
| 固定可用池 | 6994 | 6315原版＋679修订 |
| 已知错误/实质争议 | 835 / 767 | 暂扣，不改历史输入与分数 |

数据身份处置、内容审阅、独立复核与训练准入分别记录。

### B11 三条完整训练保留全部八个质量点


| 模型路径更新次数 | 原始组合正确数 | 权重上限正确数 | 固定成本正确数 |
| --- | --- | --- | --- |
| 0 | 120 | 115 | 106 |
| 8 | 117 | 117 | 116 |
| 16 | 111 | 111 | 114 |
| 24 | 85 | 85 | 86 |
| 32 | 49 | 52 | 58 |
| 40 | 21 | 7 | 13 |
| 48 | 2 | 1 | 5 |
| 55 | 1 | 0 | 2 |

每点均为246题。

Q为246题中的正确题数。R/T/U的完整八点数据列在下方表格；三个运行各有自身初始参照。

#### 原始组合：四指标全曲线数据

每个节点246题。U为总生成token与总轮次之比（ΣT/ΣR）；小数只做显示舍入到三位，不重新计算原评测或统计结论。

| 更新次数 | 正确题数 | 平均轮次 | 总生成token | token/轮（池化） |
| --- | --- | --- | --- | --- |
| 0 | 120 | 45.805 | 5245056 | 465.482 |
| 8 | 117 | 33.854 | 4109116 | 493.410 |
| 16 | 111 | 33.516 | 5156335 | 625.389 |
| 24 | 85 | 28.785 | 6418762 | 906.477 |
| 32 | 49 | 15.833 | 4846495 | 1244.286 |
| 40 | 21 | 5.541 | 3683373 | 2702.401 |
| 48 | 2 | 2.366 | 3414906 | 5867.536 |
| 55 | 1 | 1.707 | 3425488 | 8155.924 |

#### 更新权重上限：四指标全曲线数据

每个节点246题。小数只做显示舍入到三位，不重新计算原评测或统计结论。

| 更新次数 | 正确题数 | 平均轮次 | 总生成token | token/轮（池化） |
| --- | --- | --- | --- | --- |
| 0 | 115 | 36.138 | 4113637 | 462.726 |
| 8 | 117 | 43.163 | 5358615 | 504.673 |
| 16 | 111 | 40.183 | 6211042 | 628.330 |
| 24 | 85 | 26.683 | 6498177 | 989.972 |
| 32 | 52 | 14.037 | 4810916 | 1393.257 |
| 40 | 7 | 4.463 | 3790360 | 3452.058 |
| 48 | 1 | 2.183 | 3397617 | 6327.034 |
| 55 | 0 | 1.573 | 3348536 | 8652.548 |

#### 固定尺度成本：四指标全曲线数据

每个节点246题。小数只做显示舍入到三位，不重新计算原评测或统计结论。

| 更新次数 | 正确题数 | 平均轮次 | 总生成token | token/轮（池化） |
| --- | --- | --- | --- | --- |
| 0 | 106 | 36.528 | 4268496 | 475.016 |
| 8 | 116 | 43.862 | 4985308 | 462.030 |
| 16 | 114 | 46.537 | 5376493 | 469.645 |
| 24 | 86 | 51.817 | 6813833 | 534.544 |
| 32 | 58 | 29.813 | 4667599 | 636.433 |
| 40 | 13 | 9.955 | 3603415 | 1471.382 |
| 48 | 5 | 5.199 | 3286799 | 2569.819 |
| 55 | 2 | 3.764 | 2897535 | 3129.087 |

### B12 恢复成本不能从工作量中消失


| 记录 | 固定尺度成本方案 |
| --- | --- |
| 模型路径更新 | 55 |
| 首attempt成功更新 | 22 |
| 恢复点已保存更新 | 16 |
| 恢复后新增更新 | 39 |
| 物理成功更新 | 61 |
| 模型路径消费成员 | 6994 |

恢复点之后的返工不会被“逻辑55步”抹去。以上是该运行原记录，不套用到其他方案。

### B13 计时的嵌套与并行边界


| 时间量 | 原记录 | 可解释的范围 |
| --- | --- | --- |
| 整步墙钟 | 5411.207s | 同一driver生命周期 |
| generate | 2859.381s | 含工具与评分后处理 |
| Judge客户端累计 | 881.243s / 154 calls | 并发请求累计，已嵌入generate |
| reward阶段 | 0.000167s | 读取现成结果的边界 |

2026-09-18固定单步。阶段名不是成本定义，跨rank累计也不是墙钟。

### B14 正确性修复有独立的验收范围


| 案例 | 真实历史证据 | 不能据此推出 |
| --- | --- | --- |
| 双parser | 同357条输入：357 ERROR / 357 END | 答案全部正确 |
| 同奖归零 | 9组72成员：优势与回报为0 | 整个训练步没有其他更新 |
| 真实数值验收 | 512成员、64组、两次更新 | 单项补丁独立提高任务质量 |

历史原生证据与后来Blog的CPU教学示例分别保留。

### B15 邻近方向扩展Agent系统的改进空间

[MemPro](https://aclanthology.org/2026.emnlp-main.1364/)将记忆构建与检索作为可演化程序。

1. **记忆系统版本**：构建与检索。
2. **分析失败模式**：定位重复问题。
3. **编辑与调试**：改进实现。
4. **评估新版本**：保留有效版本。

公开机制是程序演化；本稿未声称它已与IGPO或DR-Venus集成。

## 资料与修订说明

公开方法的链接指向原论文或官方仓库。工程与未发表实验部分来自已保存的项目报告和聚合，本文只整理既有结果，没有新增训练、评分或统计实验。对照条件、失败与unknown、初始参照和模型选择范围随正文保留。

后续按章节修订这份工作稿，再从确定的论述、图表和例子整理演示文稿。
