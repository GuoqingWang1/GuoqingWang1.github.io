---
title: "Agentic RL：研究与系统实践"
description: "搜索型Agent的学习信号、系统基建、完整实验与关键边界。"
category: technical
lang: zh-CN
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T04:04:03+08:00"
draft: false
review: false
presentation: true
---

## 一、研究问题与工作全景

### 1.1 保持质量，减少无效交互

研究目标是在保持任务质量的前提下，降低交互与生成成本。

- Agent决定下一步行动、核查证据，并选择何时回答。
- 联合观察质量、轮次、总token与单轮长度，避免“少轮次、长输出”的补偿。
- 方法、数据、环境、训练和评测共同决定学习是否有效。

### 1.2 Search Agent如何执行与学习

**合成示例：虚构产品A、B，哪款更早正式发布？** Agent需反复查证，区分预告、发布与上市日期。

<figure class="talk-figure " data-talk-figure="search-agent-loop" lang="zh-CN" aria-labelledby="talk-search-agent-loop-title">
<p class="tf-title" id="talk-search-agent-loop-title">Search Agent：行动、观察与回答</p>
<div class="tf-agent-loop"><div class="tf-node tf-state"><strong>任务与当前上下文</strong><small>问题、已有材料、行动历史</small></div><span class="tf-edge tf-state-edge" aria-hidden="true"></span><div class="tf-node tf-agent tf-emphasis"><strong>Search Agent</strong><small>选择下一步行动，或结束任务</small></div><span class="tf-edge tf-tool-edge" aria-hidden="true"></span><div class="tf-node tf-tools tf-soft"><strong>工具</strong><small>Search / Visit，按需选择</small></div><div class="tf-return"><span>工具观察回填到上下文，再次判断</span></div><div class="tf-node tf-answer"><strong>回答与依据</strong><small>Agent 选择结束时</small></div><span class="tf-answer-edge" aria-hidden="true"></span></div><div class="tf-training"><p class="tf-stage-label">训练阶段，与任务执行分开</p><div class="tf-linear tf-linear-four"><div class="tf-node "><strong>轨迹与版本</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>训练信号</strong><small>结果／过程／成本，按配方启用</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>策略更新</strong></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>后续采样</strong></div></div></div>
<figcaption>图1 · 工具观察需核查；参数更新属于训练阶段，新策略用于后续采样。</figcaption>
</figure>

### 1.3 五层工作与执行规模

工作覆盖完整Agent闭环，规模包含团队协作，不代表个人独立完成所有环节。

| 层面 | 工作 |
| --- | --- |
| 方法 | 奖励、信用、质量与成本、更新规则 |
| 数据 | 来源、版本、修订、准入与验证隔离 |
| 环境 | Search / Visit / Summary / Judge |
| 训练 | 运行栈、采样、更新、同步、保存与恢复 |
| 评测 | 初始参照、训练对照、完整曲线与诊断 |

- **6,994条训练数据**：6,315条原版＋679条修订；可用不等于无误金标准。
- **3条完整训练**：每条55次模型路径更新；恢复返工另记。
- **每条8个验证节点×246题**：包含初始点，属于开发评测；三条配置均未达联合质量—成本目标。

## 二、算法探索与学习信号

### 2.1 搜索行动与证据处理

WebFilter学习怎样查询，EviNoteRAG学习怎样保留支持答案的证据。

| 方法 | 干预位置 | 训练信号 |
| --- | --- | --- |
| [WebFilter](https://arxiv.org/abs/2508.07956) | 限定来源查询、检索过滤 | 行为与结果奖励 |
| [EviNoteRAG](https://aclanthology.org/2026.emnlp-main.2108/) | 精简证据笔记 | 基于蕴含的证据质量奖励 |

两项方法并列，不表示已联合训练。

### 2.2 Atom-Searcher：细粒度过程反馈

[Atom-Searcher](https://arxiv.org/abs/2508.12800)把推理拆成可监督的功能单元。

- **Atomic Thought**：定位推理单元。
- **RRM → ATR**：奖励模型评价单元，形成过程奖励。
- **课程式调度**：调整过程奖励与最终结果奖励的侧重。

### 2.3 IGPO：以信息增益构造轮级信号

[IGPO](https://arxiv.org/abs/2510.14967)从策略对正确答案的概率变化构造轮级奖励。

- 对比每轮观察前后的评分，提供中间反馈。
- 将轮级信息增益与终局结果监督结合。
- 评分上下文、公式与奖励组合绑定具体版本。

### 2.4 DR-Venus：从方法到训练方案

[DR-Venus](https://arxiv.org/abs/2604.19859)连接公开数据、SFT与IGPO式Agentic RL。

- 清洗公开轨迹，重采样长轨迹。
- 通过SFT建立初始能力，再进行过程与结果监督的RL。
- 后续探索：信用分配、成本约束与更新规则，与公开配方分别验证。

### 2.5 从原始评分到实际更新

过程评分、信用与优势、参数更新和任务收益需要分层验证。

<figure class="talk-figure " data-talk-figure="credit-update-flow" lang="zh-CN" aria-labelledby="talk-credit-update-flow-title">
<p class="tf-title" id="talk-credit-update-flow-title">从评分到实际更新的几个层次</p>
<div class="tf-sources"><div class="tf-node tf-soft"><strong>过程评分</strong><small>例如信息增益</small></div><div class="tf-node tf-soft"><strong>结果信号</strong><small>任务质量</small></div><div class="tf-node tf-soft"><strong>成本信号</strong><small>交互与生成</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>信用与优势</strong><small>按配方构造与启用</small></div></div><div class="tf-to-first" aria-hidden="true"></div><div class="tf-linear"><div class="tf-node "><strong>更新规则</strong><small>ratio / clip / reduction</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>参数更新</strong><small>参数增量</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>后续行为</strong><small>质量与成本</small></div></div>
<figcaption>图2 · 按配方启用信号，不代表已优选组合；评分、优势与任务收益分别验证。</figcaption>
</figure>

- 探索维度：观测条件化、signed/positive-only、成功门控、启用阶段、局部/累计映射与归一化。

### 2.6 质量与成本必须联合解释

轮次下降可能伴随单轮变长，不能单独作为效率收益。

| 指标 | 口径 |
| --- | --- |
| Q | 当前面板的正确题数 |
| R | 平均逻辑轮次 |
| T | 面板总生成token，不是全部计算资源 |
| U | 池化单轮长度：ΣT/ΣR，非逐题T/R的均值 |

成本信用与实际资源账单分开；失败、unknown和慢样本保留在原分母中。

### 2.7 更新规则决定信号的作用

同样的评分，经过不同权重、裁剪与归约后，可能形成不同更新目标。

| 层面 | 研究变量 |
| --- | --- |
| 信号 | 质量/IG/成本权重、成功门控、有效token支持 |
| 更新 | 学习率、KL、重要性比率、PPO裁剪 |
| 归约 | token均值、序列等权、分量目标 |

联合优势裁剪与各分量分别裁剪不能无条件等同；历史对照范围见附录B05。

## 三、训练系统与基础设施

### 3.1 有状态的训练闭环

轨迹、训练信号与策略版本必须对应实际消费者。

<figure class="talk-figure " data-talk-figure="training-system" lang="zh-CN" aria-labelledby="talk-training-system-title">
<p class="tf-title" id="talk-training-system-title">训练系统的组件与状态边界</p>
<p class="tf-stage-label">采样与环境交互</p><div class="tf-system-input"><div class="tf-node "><strong>数据与运行状态</strong><small>任务、游标与待消费状态</small></div></div><p class="tf-runtime-lead" aria-hidden="true">↓</p><div class="tf-runtime"><div class="tf-node tf-emphasis"><strong>Rollout</strong><small>生成、行动与观察回填</small></div><span class="tf-edge tf-bidirectional" aria-hidden="true"></span><div class="tf-side-services"><div class="tf-node "><strong>Tools</strong><small>Search / Visit</small></div><div class="tf-node "><strong>Judge</strong><small>按实际评分路径调用</small></div></div></div><p class="tf-runtime-handoff">↓ 交付轨迹与训练信号</p><div class="tf-training"><p class="tf-stage-label">学习与策略同步</p><div class="tf-linear"><div class="tf-node "><strong>轨迹与训练信号</strong><small>奖励、信用与优势</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>Actor 更新</strong><small>实际参数更新</small></div><span class="tf-edge " aria-hidden="true"></span><div class="tf-node "><strong>权重发布</strong><small>新版本用于后续 Rollout</small></div></div></div><p class="tf-feedback-note">↺ 发布的策略用于后续 Rollout</p><p class="tf-save"><strong>保存与恢复</strong>参数、优化器、数据游标与待消费状态，在对应消费边界衔接。</p>
<figcaption>图3 · 工具与Judge按实际路径调用；保存与恢复以具体实现的验收范围为准。</figcaption>
</figure>

### 3.2 数据版本与准入

保留来源和修订，形成可追溯的训练版本。

| 对象 | 规模 | 范围 |
| --- | --- | --- |
| 原始池 | 8,640 | 审阅与版本处置 |
| 固定可用版本 | 6,994 | 6,315原版＋679修订 |
| 优先研究集 | 512 | 独立冻结，不与6,994简单并集 |
| 已知错误／实质争议 | 835／767 | 暂扣，不改历史输入与分数 |

可消费版本不等于无误金标准；内容审阅与训练准入分别判断。

### 3.3 工具失败与取消

外层请求结束，不代表后台工作和远端计算已经停止。

- Search / Visit / Summary：逐项归属错误，保留预算、超时与模型可见反馈。
- 取消排队工作需定位执行器句柄；运行中线程退出后才归还容量。
- 历史复现与4项回归支持进程内边界，不证明远端HTTP计算终止。

### 3.4 Judge：三种验收分母

历史语义审查、开发面板与服务验收回答不同问题。

| 对象 | 记录 | 解释 |
| --- | --- | --- |
| 历史审查（2026-10-07） | 36,601个请求条目；确认误拒71、误收101，共172项 | 非独立题数或总体错误率；另有支持与未决等级 |
| 冻结开发面板 | 最终判定38/40→40/40；原始主判39/40未变 | 32普通＋8边界，包含2个非数值unknown |
| 四provider统一服务 | 最终验收1个真实primary请求 | 未强制走四路，也不证明新配置已通过RL |

- 面板修复复用41个旧响应，仅新增1次真实复核，不是独立重测40题。
- 172项历史确认错误与40项面板不是同一分母；历史统计没有提供新版逐项复验结果。

### 3.5 同一输出，不同解析结果

同一批357条末次输出因plain配置不同，在训练与评测中被分别拒绝和接受。

| 处理路径 | ERROR | END |
| --- | --- | --- |
| 原训练parser：plain关闭 | 357 | 0 |
| 原Eval parser：plain开启 | 0 | 357 |
| 训练parser：仅开启plain | 0 | 357 |

这是404条解析失败中的同输入审计；END是语法接受，不是答案正确。

### 3.6 恢复必须跨过实际消费

恢复验收包括新旧混批、真实更新、策略发布与后续验证。

- 256成员混批后，完成第9、10次更新及策略版本5的发布验证。
- 从已有8次更新的checkpoint恢复后，新增47次，模型路径累计55次更新。
- 不声称逐位随机续接；恢复返工仍计入物理工作量。

### 3.7 评分等待嵌在rollout中

reward计时接近零，不代表Judge几乎没有成本。

| 2026-09-18单步记录 | 时间 | 口径 |
| --- | --- | --- |
| 完整iteration | 5411.207 s | driver整步墙钟 |
| generate | 2859.381 s | 含工具与评分后处理 |
| old-logprob | 734.510 s | driver阶段 |
| reference | 165.967 s | driver阶段 |
| Actor update | 1609.646 s | driver阶段 |
| Judge客户端 | 881.243 s／154 calls | 并发请求累计，已在generate内 |
| reward | 0.000167 s | 读取现成结果 |

请求累计时间不能再次加到整步墙钟，也不能当作串行等待。

### 3.8 运行栈与分布式闭环

冻结配置完成真实更新、保存、同步与新策略消费。

| 建设层 | 内容 |
| --- | --- |
| 模型与算术 | Qwen3.5-4B、标准注意力、GatedDeltaNet、长上下文 |
| 训练与转换 | VERL、Megatron-Core、MBridge、Transformer Engine |
| 推理与硬件 | SGLang、Triton、单机8×B300 |

- 2026-09-04：GRPO、IGPO各完成384条轨迹、3次Actor更新与最终checkpoint。
- 8个rank覆盖DCP、优化器/RNG保存及训练—推理权重同步。
- 验收仅适用于该配置；更大模型的Eval不作为训练验收。

### 3.9 编译缓存与卷积优化进入训练

同一三步运行保留768条轨迹，8个Actor rank确认优化生效。

| 步骤 | Actor阶段耗时 |
| --- | --- |
| 1 | 973.715 s |
| 2 | 752.250 s |
| 3 | 655.359 s |

后两步无新增可观测Actor JIT入口；token与微批形状不同，耗时变化不能独归因缓存或视为整步加速率。

### 3.10 镜像升级：功能通过不等于性能胜出

两组三步原生运行完成，但单次对照未支持切换旧默认。

| 热态step2–3 | 旧镜像 | 新候选 |
| --- | --- | --- |
| 整步平均秒 | 3233.142 | 3192.462 |
| Actor秒／百万packed token | 19.593 | 20.420 |
| old-logprob秒／百万token | 5.535 | 6.454 |
| 完整生命周期 | 3/3通过 | 3/3通过 |

数值一致性需独立验收，不能由速度提升替代。

### 3.11 完整Eval的调度观测

同512题均完成生成与评分，完整Eval从4505.21 s降至4126.03 s，本次观测下降8.42%。

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="zh-CN" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">完整 Eval 的调度观测</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：完整 Eval 的调度观测"><img src="/figures/agentic-rl-talk/eval-scheduling-zh.svg" alt="同512题、同模型的两次完整Eval，零起点比较墙钟时间。" loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>图4 · 共享工具、缓存与随机输出限制因果归因；单请求延迟也有所上升。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

### 3.12 环境交付与可观测性

安装、算子、有效学习和多机训练使用不同验收边界。

| 交付 | 已证范围 |
| --- | --- |
| DR-Venus三机环境 | 软件与镜像一致；仅首台完成单卡GPU检查 |
| 模型保存冒烟 | 原生checkpoint完整保存；奖励/梯度为0，只证明生命周期 |
| 运行观测 | run、step、轨迹与请求身份关联，分层追踪工具和评分 |
| 资产同步 | 文件校验、源码清单与结果归档，保留失败和恢复证据 |

## 四、实验证据与关键认识

### 4.1 三种参照，三类问题

整体RL收益与新增组件增量需要不同对照。

| 参照 | 检验什么 | 固定条件 |
| --- | --- | --- |
| 初始SFT | RL整体是否改善 | 模型起点、评测协议 |
| 训练对照 | 原路径的效果 | 数据、剂量、服务条件 |
| 新增候选 | 组件是否有增量 | 实际差分、预定验收要求 |

相同题数或seed不保证可比；失败、unknown与完整分母保留。

### 4.2 扩评改变固定候选的判断

同一sequence-ratio候选的嵌套扩评没有支持采用。

| 开发面板 | 训练对照正确数 | 候选正确数 | 处置 |
| --- | --- | --- | --- |
| 128题 | 68 | 68 | 点估计通过，强证据门未过 |
| 嵌套246题 | 131 | 121 | 固定候选未晋升 |

这是已有策略的扩评，没有新增训练，也不是独立测试；原始SFT与训练对照身份保留。

### 4.3 三条完整训练，联合目标均未通过

完整执行已交付，但三条具体配置均未同时满足质量保持、轮次下降与长度约束。

| 配置 | 训练成员 | 模型路径更新 | 验证节点 |
| --- | --- | --- | --- |
| 原始组合 | 6,994 | 55 | 8×246题 |
| 更新权重上限 | 6,994 | 55 | 8×246题 |
| 固定尺度成本 | 6,994 | 55 | 8×246题 |

- 节点为0/8/16/24/32/40/48/55，包含初始点。
- 三个运行各有自身初始与历史，不作公平跨run因果排名，也不否定整个方法家族。
- 固定成本方案物理成功更新61次；同开发面板选出的高点不是独立确认。

### 4.4 原始组合：轮次减少伴随质量退化

正确题数从120/246降至1/246，较少交互未保持任务质量。

<figure class="talk-figure" data-talk-figure="training-a009" lang="zh-CN" aria-labelledby="talk-training-a009-title">
<p class="tf-title" id="talk-training-a009-title">原始组合方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：原始组合方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-a009-zh.svg" alt="原始组合方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>图5 · 灰虚线为本运行初始值；完整Q/R/T/U见附录B01。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

### 4.5 更新权重上限：短程高点未过联合门

正确题数短程升至117/246，但轮次未降；最终为0/246。

<figure class="talk-figure" data-talk-figure="training-cap2" lang="zh-CN" aria-labelledby="talk-training-cap2-title">
<p class="tf-title" id="talk-training-cap2-title">更新权重上限方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：更新权重上限方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-cap2-zh.svg" alt="更新权重上限方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>图6 · 灰线为本运行初始值，各图采用相同指标尺度；完整数据见附录B02。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

### 4.6 固定尺度成本：成本下降不能抵消质量损失

早期正确题数增加伴随更多轮次；最终轮次与总token下降，正确题数却降至2/246。

<figure class="talk-figure" data-talk-figure="training-fixed-cost" lang="zh-CN" aria-labelledby="talk-training-fixed-cost-title">
<p class="tf-title" id="talk-training-fixed-cost-title">固定尺度成本方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：固定尺度成本方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" alt="固定尺度成本方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>图7 · 横轴为模型路径更新；token刻度以百万显示，完整原单位数据见附录B03。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

### 4.7 缺陷证据与退化原因分开

局部修复成立，不等于已经解释完整训练的退化。

| 已有证据 | 尚未建立 |
| --- | --- |
| 训练/Eval解析差异，同奖数值与恢复链问题 | 单项修复的独立质量贡献 |
| 部分成功批次实际消费事故暴露轨迹 | 具体参数损害与退化的唯一原因 |

事故暴露、实际消费与参数损害不能互相替代。

## 五、阶段交付与下一步

### 5.1 方法成果与角色

公开方法构成技术积累，作者角色不等于全部实施分工。

| 方向 | 工作 | 既定角色 |
| --- | --- | --- |
| 搜索与证据 | WebFilter、EviNoteRAG | 共同一作 |
| 过程监督 | IGPO | 第一作者 |
| 过程奖励与训练方案 | Atom-Searcher、DR-Venus | 核心贡献者 |
| 记忆系统演化 | [MemPro](https://aclanthology.org/2026.emnlp-main.1364/) | 共同一作 |

方法并列不表示完成集成；MemPro改进的是可运行的记忆构建—检索程序。

### 5.2 可复用的研究资产

保留可运行实现与失败证据，支持后续判断。

- **实现**：训练、采样、工具、评分、同步与恢复路径。
- **数据**：版本、准入、开发面板与实际曝光。
- **证据**：完整曲线、负结果、运行成本与适用范围。

### 5.3 下一步：可判别的研究问题

聚焦质量基线、过程/成本增量与研究迭代效率。

<figure class="talk-figure " data-talk-figure="next-questions" lang="zh-CN" aria-labelledby="talk-next-questions-title">
<p class="tf-title" id="talk-next-questions-title">已有资产与后续研究问题</p>
<p class="tf-stage-label">已有可复用资产</p><div class="tf-sources"><div class="tf-node tf-soft"><strong>方法实现</strong><small>训练与评分路径</small></div><div class="tf-node tf-soft"><strong>运行基建</strong><small>工具、恢复与观测</small></div><div class="tf-node tf-soft"><strong>数据与证据</strong><small>版本、对照与曲线</small></div></div><div class="tf-join" aria-hidden="true"></div><div class="tf-merged"><div class="tf-node tf-emphasis"><strong>支撑下一轮判断</strong></div></div><div class="tf-split" aria-hidden="true"><span>↓</span><span>↓</span><span>↓</span></div><div class="tf-sources" role="group" aria-label="后续研究问题"><div class="tf-node tf-future"><strong>质量基线</strong><small>建立可解释的质量学习参照</small></div><div class="tf-node tf-future"><strong>过程与成本效应</strong><small>识别有效增量的适用条件</small></div><div class="tf-node tf-future"><strong>迭代效率</strong><small>更快取得可信的研究结论</small></div></div>
<figcaption>图8 · 后续研究方向，不表示新实验已启动或已取得增量收益。</figcaption>
</figure>

## 附录：数字与适用边界

各验证节点246题；Q为正确题数，R为平均逻辑轮次，T为面板总生成token，U=ΣT/ΣR。小数仅显示舍入至三位；各运行保留自身初始参照。

### B01 原始组合：完整Q/R/T/U

八个节点全部保留，不以短程高点替代终局。

| 路径更新 | 正确题数 | 平均轮次 | 总生成token | token/轮（池化） |
| --- | --- | --- | --- | --- |
| 0 | 120 | 45.805 | 5245056 | 465.482 |
| 8 | 117 | 33.854 | 4109116 | 493.410 |
| 16 | 111 | 33.516 | 5156335 | 625.389 |
| 24 | 85 | 28.785 | 6418762 | 906.477 |
| 32 | 49 | 15.833 | 4846495 | 1244.286 |
| 40 | 21 | 5.541 | 3683373 | 2702.401 |
| 48 | 2 | 2.366 | 3414906 | 5867.536 |
| 55 | 1 | 1.707 | 3425488 | 8155.924 |

### B02 更新权重上限：完整Q/R/T/U

正确题数的短程增加没有同时满足轮次下降与长度约束。

| 路径更新 | 正确题数 | 平均轮次 | 总生成token | token/轮（池化） |
| --- | --- | --- | --- | --- |
| 0 | 115 | 36.138 | 4113637 | 462.726 |
| 8 | 117 | 43.163 | 5358615 | 504.673 |
| 16 | 111 | 40.183 | 6211042 | 628.330 |
| 24 | 85 | 26.683 | 6498177 | 989.972 |
| 32 | 52 | 14.037 | 4810916 | 1393.257 |
| 40 | 7 | 4.463 | 3790360 | 3452.058 |
| 48 | 1 | 2.183 | 3397617 | 6327.034 |
| 55 | 0 | 1.573 | 3348536 | 8652.548 |

### B03 固定尺度成本：完整Q/R/T/U

较低的终局轮次与token伴随质量损失，不构成保质压缩。

| 路径更新 | 正确题数 | 平均轮次 | 总生成token | token/轮（池化） |
| --- | --- | --- | --- | --- |
| 0 | 106 | 36.528 | 4268496 | 475.016 |
| 8 | 116 | 43.862 | 4985308 | 462.030 |
| 16 | 114 | 46.537 | 5376493 | 469.645 |
| 24 | 86 | 51.817 | 6813833 | 534.544 |
| 32 | 58 | 29.813 | 4667599 | 636.433 |
| 40 | 13 | 9.955 | 3603415 | 1471.382 |
| 48 | 5 | 5.199 | 3286799 | 2569.819 |
| 55 | 2 | 3.764 | 2897535 | 3129.087 |

### B04 Partial与Flash的正式负载

Partial四个实验组各有96题×8轨迹，保留全部轨迹。

| 算法 | 同步容器秒 | Partial容器秒 | 每臂轨迹 |
| --- | --- | --- | --- |
| GRPO | 10828.329 | 9593.208 | 768 |
| IGPO | 11678.676 | 10807.729 | 768 |

- 2026-09-22固定负载观测，已验证完整组交付与跨版本续跑。
- 共享工具、缓存、轨迹及校正差异限制纯调度因果归因。
- Flash-IGPO另用768个不同问题、n=1，完成3次有效更新与排空；不作同曝光速度对比或长期质量结论。

### B05 更新变量的历史对照范围

联合优势裁剪与分量分别裁剪不能无条件视为同一目标。

| 变量 | 对照范围 |
| --- | --- |
| 学习率 | 常数1e−6/5e−7、线性衰减、匹配平均剂量 |
| KL | 0.001与0.0005的限定对照 |
| PPO | 上裁剪、共享/局部重要性比率 |
| 归约 | token均值、序列等权、分量目标 |
| 采样 | 同步、异步、Partial、实际曝光 |

这些是历史研究维度，不是已优选的统一配方。

### B06 数值正确性的验收边界

数值不变量修复与任务质量收益分别验证。

| 历史验收 | 已证范围 | 不代表 |
| --- | --- | --- |
| 同奖归零：9组72成员 | 优势与回报为0 | 整个训练步无其他更新 |
| 512成员、64组、两次更新 | 原生数值验收 | 单项补丁独立提高质量 |

KL项或优化器状态仍可能导致参数变化；零优势不等于整步零更新。

### B07 恢复返工计入真实工作量

固定成本方案模型路径55次更新，物理成功更新61次。

| 记录 | 更新次数 |
| --- | --- |
| 首attempt成功更新 | 22 |
| 恢复点已保存更新 | 16 |
| 恢复后新增更新 | 39 |
| 模型路径 | 55 |
| 物理成功更新 | 61 |

模型路径消费6,994成员；恢复点之后的返工不从账单中抹去。

### B08 预测行与目标token对齐

目标位置j由预测行j−1评分。

| 输入位置 | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| 输入token | BOS | P0 | P1 | A0 | A1 |
| 该行目标 | P0 | P1 | A0 | A1 | 后续 |

给A0、A1打分读取第2、3行；这里只使用合成符号。
