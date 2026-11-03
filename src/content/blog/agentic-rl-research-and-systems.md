---
title: "Deep Research Agent RL：系统建设与算法探索"
description: "Deep Research场景与Pipeline、基础设施与效率优化、IGPO到CTF-IGPO、短程与完整实验结果。"
category: technical
lang: zh-CN
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T05:28:55+08:00"
draft: false
review: false
presentation: true
---

## 一、Deep Research Agent：场景、目标与Pipeline

### 1.1 在保持质量的前提下减少交互成本

Deep Research Agent通过多轮推理、搜索与网页读取完成任务；目标是保持答案质量，同时减少交互与生成消耗。

- **行动**：选择Search、Visit或继续推理，判断证据是否充分，决定何时回答。
- **成本**：同时观察逻辑轮次、总生成token和单轮长度，避免用长输出补偿少轮次。
- **两类效率**：系统减少等待与重复计算；算法学习更有效的行动。两者分别验证。

### 1.2 推理Pipeline：行动—观察循环

工具观察回填上下文，Agent继续行动或给出最终回答。

<figure class="talk-figure dr-figure" data-talk-figure="inference-pipeline" lang="zh-CN" aria-labelledby="talk-inference-pipeline-title">
<p class="tf-title" id="talk-inference-pipeline-title">Deep Research · 推理 pipeline</p>
<div class="dr-panel"><p class="dr-stage">固定策略 · 多轮交互</p><div class="dr-three dr-inference-grid"><div class="dr-node dr-checkpoint dr-soft-blue"><strong>已训练 checkpoint</strong></div><span class="dr-down dr-weight-arrow" aria-hidden="true">↓</span><div class="dr-node dr-question"><strong>用户问题</strong><small>任务与约束</small></div><span class="dr-arrow dr-question-arrow" aria-hidden="true"></span><div class="dr-node dr-policy dr-blue"><strong>Agent policy</strong><small>AgentLoop · SGLang</small></div><span class="dr-arrow dr-answer-arrow" aria-hidden="true"></span><div class="dr-node dr-answer dr-green"><strong>最终回答</strong><small>选择结束时</small></div></div><div class="dr-interaction"><span>调用工具</span><b aria-hidden="true">↕</b><span>观察回填上下文</span></div><div class="dr-tools"><p class="dr-stage">工具环境 · 按需选择</p><div class="dr-tool-options"><div class="dr-node dr-soft-blue"><strong>Search</strong><small>查询 → 检索结果</small></div><div class="dr-node dr-peach"><strong>Visit</strong><small>URL → 页面内容</small><div class="dr-service-chain"><span>Reader</span><b aria-hidden="true">→</b><span>Summary</span></div></div></div></div></div>
<figcaption>图1 · 固定权重执行多轮交互；Search 与 Visit 为可选动作，Reader / Summary 按后端配置执行。</figcaption>
</figure>

- Search与Visit按需选择；HTTP成功不等于证据可靠。
- 保留实际生成动作、行为概率与策略版本；工具返回和控制器文本可进入上下文，但不作为策略动作。
- 单次任务执行不更新模型权重，新策略在训练后用于后续采样。

### 1.3 训练Pipeline：从轨迹到下一版策略

结果与可选过程/成本信号进入优势计算，再由Actor更新并发布权重。

<figure class="talk-figure dr-figure" data-talk-figure="training-pipeline" lang="zh-CN" aria-labelledby="talk-training-pipeline-title">
<p class="tf-title" id="talk-training-pipeline-title">Deep Research · RL 训练 pipeline</p>
<div class="dr-training-grid"><div class="dr-panel"><p class="dr-stage">01 · 采样</p><div class="dr-three dr-entry"><div class="dr-node "><strong>训练任务</strong><small>只输入问题</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-blue"><strong>多轨迹 Rollout</strong><small>AgentLoop · SGLang</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-soft-blue"><strong>轨迹与策略版本</strong><small>动作 token · behaviour logprob</small></div></div></div><div class="dr-flow-down" aria-hidden="true">↓</div><div class="dr-panel"><p class="dr-stage">02 · 评分与信用</p><div class="dr-supervision"><strong>监督答案</strong> → 仅用于 Judge 与 IG 评分</div><div class="dr-scorers"><div class="dr-node dr-green"><strong>Judge</strong><small>终局质量</small></div><div class="dr-node dr-yellow"><strong>IG scoring</strong><small>轮级信息增益</small></div><div class="dr-node dr-peach"><strong>Cost</strong><small>交互与生成成本</small></div></div><div class="dr-merge" aria-hidden="true"></div><div class="dr-node dr-advantage dr-soft-blue"><strong>信用分配与优势</strong></div></div><div class="dr-actor-feed" aria-hidden="true"></div><div class="dr-panel"><p class="dr-stage">03 · VERL：更新与同步</p><div class="dr-update-row"><div class="dr-adv-input">合成优势</div><span class="dr-adv-input-arrow" aria-hidden="true">↓</span><div class="dr-node dr-reference"><strong>Reference policy</strong><small>ref logprob · KL</small></div><span class="dr-arrow dr-kl-arrow" aria-hidden="true"></span><div class="dr-node dr-actor dr-blue"><strong>Actor · PPO</strong><small>合成优势 + old logprob</small></div><span class="dr-arrow dr-sync-arrow" aria-hidden="true"></span><div class="dr-node dr-sync dr-soft-blue"><strong>权重同步</strong><small>发布新策略</small></div></div><div class="dr-out-branches" aria-hidden="true"><span></span><span></span></div><div class="dr-outputs"><div class="dr-node dr-soft-blue"><strong>后续 Rollout</strong></div><div class="dr-node dr-green dr-eval"><strong>开发评测</strong><small>Q / R / T / U</small></div></div></div></div><div class="dr-save-state"><strong>Save / restore</strong><span>模型 · 优化器 · 数据游标 · Partial 状态</span></div>
<figcaption>图2 · 监督答案只进入评分。训练侧重算 old/ref；开发评测不回流梯度。信号与执行顺序按版本配置。</figcaption>
</figure>

- Rollout、工具与Judge产生轨迹和评分；训练按配方准备优势及old/ref概率。
- Actor更新后同步给推理侧，保存模型、优化器及相应数据和采样状态。
- 共享GPU按阶段调度；Partial不意味着Actor与rollout始终同时运行。

## 二、Infra搭建与效率优化

### 2.1 三条建设线：运行栈、训练链与工具服务

现有工程记录覆盖2026年8月至11月初，主要交付沿三条线推进。

| 建设线 | 基础建设（2026-08） | 后续交付（2026-09–10） |
| --- | --- | --- |
| 镜像与运行栈 | 依赖/ABI、B300算子、8卡通信 | 混合模型适配，真实更新、保存与权重同步 |
| RL训练 | 阶段计时与长上下文路径 | Actor/IG优化、Partial、连续Eval、恢复 |
| Tool server | 请求与流式状态观测 | Go迁移、双层缓存、失败子集重试、取消与Judge语义 |

早期compute-only检查关闭工具和Judge，不能代替真实Deep Research训练验收。

### 2.2 Qwen3.5 × B300：打通混合模型运行链

2026年9月的真实工具运行中，GRPO和IGPO各完成384条轨迹、3次Actor更新及最终checkpoint。

| 层面 | 具体工作 |
| --- | --- |
| 模型与内核 | 标准注意力与GatedDeltaNet分别适配，核对位置与长上下文行为 |
| 训练与转换 | VERL、Megatron-Core、MBridge、Transformer Engine |
| 推理与硬件 | SGLang、Triton、单机8×B300 |
| 闭环验收 | 真实Search/Visit/Judge、8-rank更新、保存、同步与正常退出 |

范围绑定Qwen3.5-4B的实际配置；更大模型Eval或三机安装不能代替这一训练验收。

### 2.3 Tool server：缓存、降级与生命周期

工具链保留已有成功结果，并将失败和取消传到真正执行的位置。

<figure class="talk-figure tr-figure" data-talk-figure="tool-stack" lang="zh-CN" aria-labelledby="talk-tool-stack-title">
<p class="tf-title" id="talk-tool-stack-title">Tool server：检索、读取与摘要</p>
<div class="tr-node tr-shared tr-blue"><strong>Agent 工具调用</strong><small>按动作选择 Search 或 Visit</small></div><div class="tr-two-branch tr-tool-branch" aria-hidden="true"><span>↓</span><span>↓</span></div><div class="tr-two tr-tools" role="group" aria-label="可选工具"><div class="tr-panel"><p class="tr-panel-heading">Search</p><div class="tr-node tr-search-card tr-soft-blue"><strong>搜索服务</strong><small>限流 · 请求缓存</small></div></div><div class="tr-panel"><p class="tr-panel-heading">Visit</p><div class="tr-node tr-peach"><strong>Reader</strong><small>正文缓存</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-peach"><strong>Summary</strong><small>摘要缓存</small></div></div></div><div class="tr-join" aria-hidden="true"></div><div class="tr-node tr-shared tr-green"><strong>结构化结果 + 逐项错误</strong><small>返回 Agent 的下一轮上下文</small></div>
<figcaption>图3 · 保留成功项，仅重试失败项；取消需追到实际执行句柄，运行中工作退出后再归还容量。</figcaption>
</figure>

- **Go服务与双层缓存**：Reader正文缓存、与goal相关的摘要缓存；更换goal可复用正文。
- **失败子集重试**：逐URL/query保留成功项，仅重试失败项，共用原总期限。
- **取消传播**：排队工作定位执行句柄；运行线程退出后才归还容量。进程内检查不证明远端计算终止。

### 2.4 工具观测：从笼统超时到具体阶段

串联请求ID、Reader/Summary阶段、重试与缓存状态，将一次工具失败追到实际处理环节。

| 观察范围 | 结果 |
| --- | --- |
| 2,218次逻辑Visit | 52次业务失败，其中47次归属Reader、5次归属Summary |
| 46个历史失败URL的定向复现 | 73次Reader尝试；42次timeout均停在等待响应头 |
| 集中看板 | Search/Visit/Router各6实例，Summary 10实例 |

业务失败也可能返回HTTP 200。已定位到Reader等待阶段；上游排队、抓取与渲染的内部占比仍未确定。

### 2.5 Judge：让评分可用，也让结果可信

同时建设有界调用服务与语义判分规则，避免技术失败和不确定答案变成错误奖励。

- **服务侧**：统一四路模型，补齐备用、限流、任务期限和恢复身份，兼容旧调用入口。
- **语义侧**：审查36,601个历史请求，确认172项误判；修正别名、数量单位、年代与引用校验。
- **修复验证**：同一40项开发面板中，符合预期的处理从38项到40项，包含2项应保留的unknown。

40/40是该开发面板的最终处理结果；生产上线验收实际命中一路。更细的响应使用与分母见附录B03。

### 2.6 端到端计时：评分等待藏在rollout里

reward阶段接近零，不代表Judge几乎没有成本。

| 2026-09-18单步 | 耗时 | 口径 |
| --- | --- | --- |
| 完整iteration | 5411.207 s | driver整步墙钟 |
| generate / rollout阶段 | 2859.381 s | 含工具与评分后处理 |
| Actor update | 1609.646 s | driver阶段 |
| Judge客户端 | 881.243 s／154 calls | 并发请求累计，已在generate内 |
| reward | 0.000167 s | 读取现成结果 |

Judge累计时间不能再次加到整步墙钟；完整阶段表见附录B04。

### 2.7 Actor：编译缓存与动态形状去特化

固定Actor replay的缓存对照从1925.391 s降至656.149 s，但严格数值等价未通过。

<figure class="talk-figure" data-talk-figure="actor-cache" lang="zh-CN" aria-labelledby="talk-actor-cache-title">
<p class="tf-title" id="talk-actor-cache-title">固定输入 Actor 回放：持久缓存的性能观测</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/actor-cache-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图: 固定输入 Actor 回放：持久缓存的性能观测"><img src="/figures/agentic-rl-talk/actor-cache-zh.svg" alt="同256条轨迹，两次新进程，空缓存1925.39秒、保留缓存656.15秒。严格数值等价未通过。" loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>图4 · 固定输入、两次新进程的 Actor-only 计时；不是整步收益，严格数值等价未通过。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/actor-cache-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

- 两次均为新进程；保留磁盘缓存后，可观测编译miss从19,718到0。**65.92%仅为单阶段性能观测。**
- 冷/热更新数值不等价，不能称无损加速；NB去特化的后续受控梯度/master一致是另一份资格。
- 持久缓存与卷积NB去特化共同进入真实三步训练；保留autotune，后两步无新增可观测Actor JIT入口。

### 2.8 IG评分：减少无关投影，复用已有上下文

只投影目标预测行，并复用rollout上下文；优化同时核对目标token、三轴mRoPE与策略版本。

| 已验范围 | 结果 |
| --- | --- |
| Qwen3固定组件负载 | 中位时延158.56 → 87.65 ms |
| Qwen3.5固定12目标token负载 | 增量峰值显存约1.21 → 0.191 GB；该负载评分误差0 |
| 真实三步IGPO的attached路径 | 5,224次评分、0失败；均值63.5 ms，P95 147.6 ms |

组件比较与真实调用分布属于不同负载，不能串成统一加速倍数；跨策略版本需要重评对应边界。

### 2.9 Partial：减少等待，保留完整组与版本

任务池允许暂停和续跑，但训练仍按完整组准入并保留行为版本。

<figure class="talk-figure tr-figure" data-talk-figure="partial-scheduling" lang="zh-CN" aria-labelledby="talk-partial-scheduling-title">
<p class="tf-title" id="talk-partial-scheduling-title">Partial：保留任务状态，按完整组交付</p>
<div class="tr-two tr-schedule"><div class="tr-panel"><p class="tr-panel-heading">同步整批</p><div class="tr-node "><strong>整批开始采样</strong><small>同一批任务</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node "><strong>等待整批结束</strong><small>完成时间受最长轨迹影响</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Actor 更新</strong><small>随后进入下一批</small></div></div><div class="tr-panel"><p class="tr-panel-heading">Partial rollout</p><div class="tr-node tr-soft-blue"><strong>持久任务池</strong><small>保留未完成轨迹</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>完整组 ready</strong><small>交付完整组，剩余任务留池</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>阶段切换</strong><small>暂停生成 → Actor 更新 → 续跑</small></div></div></div>
<figcaption>图5 · 调度关系示意，不表示时间比例。共享 GPU 时按阶段暂停、更新与续跑，保留组完整性及策略版本。</figcaption>
</figure>

- 四个正式对照臂各96题×8轨迹，共768条/臂；保留完整组、ready缓冲和跨版本记录。
- 容器墙钟观测：GRPO减少11.41%，IGPO减少7.46%。
- 工具、缓存、轨迹及校正条件不同，不能全部归因调度，也不证明长期off-policy无损。

### 2.10 连续Eval：完成一条，补入下一条

同512题均完成生成与评分，完整Eval从4505.21 s降到4126.03 s，观测下降8.42%。

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="zh-CN" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">完整 Eval 的调度观测</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：完整 Eval 的调度观测"><img src="/figures/agentic-rl-talk/eval-scheduling-zh.svg" alt="同512题、同模型的两次完整Eval，零起点比较墙钟时间。" loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>图6 · 共享工具、缓存与随机输出限制因果归因；单请求延迟也有所上升。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

- 持续维持active任务，减轻批次尾部的空闲。
- 随机输出、共享工具与缓存限制精确因果归因，单请求延迟有所上升。
- 独立Eval与训练内Validate各有生命周期，不能据此认定二者自动使用同一路径。

### 2.11 数据与恢复：让训练跨过真实消费

可恢复系统需要数据版本和完整状态，而不只是一次成功load。

| 交付 | 实际范围 |
| --- | --- |
| 固定训练版本 | 6,994＝6,315原版＋679修订；可用不等于无误金标准 |
| 优先研究集 | 512条独立冻结，不与6,994简单并集 |
| A009恢复闭环 | 从8次更新checkpoint恢复，新增47次，累计55次模型路径更新、28次策略发布 |
| 保存与消费 | 混批、更新、同步和后续验证；参数、优化器与相应数据/采样状态衔接 |

恢复需跨过新旧混批、真实更新与后续采样；状态加载成功本身不足以证明连续训练正确。

## 三、算法探索：IGPO → CTF-IGPO

### 3.1 IGPO：为信息获取增加中间反馈

[IGPO](https://arxiv.org/abs/2510.14967)从策略对正确答案概率的变化构造轮级信号，补充终局结果监督。

<figure class="talk-figure tr-figure" data-talk-figure="igpo-signal" lang="zh-CN" aria-labelledby="talk-igpo-signal-title">
<p class="tf-title" id="talk-igpo-signal-title">IGPO：从终局奖励到轮级反馈</p>
<div class="tr-panel tr-trajectory"><p class="tr-panel-heading">任务内的多轮交互</p><div class="tr-three-flow"><div class="tr-node tr-soft-blue"><strong>第 1 轮</strong><small>行动 → 观察</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>后续轮</strong><small>行动 → 观察</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-green"><strong>最终回答</strong></div></div></div><p class="tr-supervision">训练监督 · 参考答案用于评分</p><div class="tr-ig-sources"><div class="tr-panel"><p class="tr-panel-heading">轮级过程信号</p><div class="tr-score-pair"><div class="tr-node tr-yellow"><strong>观察前评分</strong></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>观察后评分</strong></div></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>参考答案评分变化</strong></div></div><div class="tr-panel tr-ig-result"><p class="tr-panel-heading">终局结果监督</p><div class="tr-node tr-green"><strong>回答质量</strong><small>最终结果</small></div></div></div><div class="tr-join tr-ig-join" aria-hidden="true"></div><div class="tr-node tr-shared tr-blue"><strong>结合过程与结果训练策略</strong></div>
<figcaption>图7 · IGPO 在终局监督之外提供轮级反馈。评分差是训练代理信号，不等于已识别的因果信息价值。</figcaption>
</figure>

- 最终答案相同的成败标签，难以区分中间交互的作用。
- 过程评分提供更密集反馈，但仍是代理，不等同事实可靠性或因果行动价值。
- 评分上下文、目标跨度、预测行和权重版本需要一致。

### 3.2 Flash-IGPO：单轨迹与批级训练

每题一条轨迹扩大问题覆盖，同时改变了优势统计与采样组织。

- 正式运行覆盖768个不同问题、n=1，完成3次有效更新与工作排空。
- 过程/结果信用按相应批级规则处理，不是同题多样本GRPO归一化。
- 旧96×8与新768×1的曝光不同；功能与容量通过不等于速度因果或长期质量收益。

### 3.3 CTF-IGPO：当前行动承担后续成本

**Cost-to-Go Augmented Flash-IGPO**在原优势上加入从当前轮到终点的成本约束。

- 累计已记录的成本后缀，包含当前轮，折扣为1；失败轨迹不免除已发生消耗。
- 初版计生成token与工具次数，完整原型改为逻辑轮费＋返回生成token/1000。
- 成本代理之外，工具、prefill、评分、训练与恢复的真实资源另行记账。

### 3.4 从联合归一化到独立质量与IG尺度

质量、过程与成本分别处理，让各分量的统计单位和强度可解释。

| 版本层面 | 关键取舍 |
| --- | --- |
| 完整v0 | 先对结果＋IG做ReBN，再减成本 |
| 分离后 | 仅质量做有效轮批级归一化（ReBN）；IG和成本外加，合成后不再整体归一化 |
| IG信用 | 观察条件差→后缀→首批RMS校准→成功门控/正信用/阶段开关 |

这些选择分别保留证据；归一化、门控和正信用未被逐项证明最优，短程首批也不验证完整阶段调度。

### 3.5 CTF-PW：成本预加权，统一进入PPO

成本在合成优势前按轮调整token权重，质量与IG保持原路径。

<figure class="talk-figure tr-figure" data-talk-figure="ctf-objective" lang="zh-CN" aria-labelledby="talk-ctf-objective-title">
<p class="tf-title" id="talk-ctf-objective-title">CTF-IGPO：PW 的优势与更新结构</p>
<div class="tr-cost-inputs"><div class="tr-node tr-green"><strong>Quality</strong><small>独立归一化</small></div><div class="tr-node tr-yellow"><strong>Information gain</strong><small>独立定标 / 门控</small></div><div class="tr-node tr-peach"><strong>Cost-to-go</strong><small>本轮起后缀累计 → 按轮预加权</small></div></div><div class="tr-join tr-join-three" aria-hidden="true"></div><div class="tr-node tr-combined tr-soft-blue"><strong>合成优势</strong><span class="tr-symbol">A<sub>Q</sub> + A<sub>IG</sub> + A<sub>C</sub></span></div><span class="tr-down" aria-hidden="true"></span><div class="tr-update"><div class="tr-node tr-blue"><strong>一次 PPO / dual-clip</strong><small>作用于总优势</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>Actor 更新</strong></div></div>
<figcaption>图8 · PW 配方结构：合成后不再统一归一化，三路信号共用一次裁剪；该结构不代表已证明最优。</figcaption>
</figure>

- 仅成本项乘`D_m/(K_m·n_t)`：同一minibatch的有效token总数／非空有效轮数／该轮有效token数。
- 合成后进入原单一PPO/dual-clip与token均值归约，不将分量分别裁剪后拼接。
- 该实际组合被选为优化参考；不能拼历史最好组件，也不等于统计已证稳定收益。公式见附录B01。

## 四、实验效果与关键认识

### 4.1 固定短程对照出现正向点信号

PW候选133/246，训练对照122/246，初始SFT为124/246。

<figure class="talk-figure" data-talk-figure="short-run-results" lang="zh-CN" aria-labelledby="talk-short-run-results-title">
<p class="tf-title" id="talk-short-run-results-title">固定短程实验：初始模型、训练对照与 PW 候选</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/short-run-results-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图: 固定短程实验：初始模型、训练对照与 PW 候选"><img src="/figures/agentic-rl-talk/short-run-results-zh.svg" alt="246题开发面板：初始SFT124题正确，训练对照122题，PW候选133题。" loading="lazy" decoding="async" width="768" height="320"></a>
<figcaption>图9 · 训练输入固定256条、两次更新；评测为246题开发面板。候选较训练对照的点值改善未通过更强证据要求。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/short-run-results-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

- **训练剂量**：固定保存256输入、2次Adam更新；评测为246题已暴露开发面板。
- **相对训练对照**：正确数＋11，平均轮次−2.668%，总token−4.209%，池化单轮长度−1.583%。
- 统计证据尚不足以确认稳定收益；相对SFT平均轮次仍＋0.164%，不是完整RL压缩成功。

### 4.2 完整55步：三条配置均未达联合目标

三条训练均完整执行，但没有同时保持质量、减少轮次并满足长度约束。

<figure class="talk-figure" data-talk-figure="complete-quality" lang="zh-CN" aria-labelledby="talk-complete-quality-title">
<p class="tf-title" id="talk-complete-quality-title">三条完整训练的质量轨迹</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/complete-quality-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图: 三条完整训练的质量轨迹"><img src="/figures/agentic-rl-talk/complete-quality-zh.svg" alt="三个独立面板保留每条运行的8个质量节点：原始组合120至1，更新权重上限115至0，固定尺度成本106至2；每点246题。" loading="lazy" decoding="async" width="768" height="420"></a>
<figcaption>图10 · 各运行55次模型路径更新、每点246题；虚线为各自初始值。三条均未通过质量与成本联合要求，不作公平跨运行排名。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/complete-quality-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

- 每条6,994成员、55次模型路径更新；节点0/8/16/24/32/40/48/55，每点246题。
- 原始组合、权重上限、固定成本终点正确数分别为1、0、2；各自初始为120、115、106。
- 各运行有自身初始与历史，不作公平跨run因果排名；133短程点不是这三条曲线的起点。完整Q/R/T/U见附录B06–B08。

### 4.3 已修缺陷与退化原因分开

具体缺陷的验收，不能直接解释完整训练的退化。

| 已有证据 | 能证明什么 | 尚不能证明 |
| --- | --- | --- |
| 同357条输出：ERROR→END | 解析接受发生变化 | 答案全部正确 |
| 同奖9组72成员优势/回报严格为0 | 数值不变量恢复 | 整步无KL或优化器更新 |
| 恢复链与事故暴露轨迹实际消费 | 接口修复或暴露事实 | 单项质量贡献、具体参数损害或唯一退化原因 |

KL、off-policy及学习机制的解释仍须对照；未由这些修复排除。

### 4.4 阶段交付与下一步

已形成可持续研究的运行系统，长期保质压缩目标仍未实现。

- **已交付**：运行栈、tool server、评分、采样、更新、同步、恢复与完整评测链。
- **已保留**：数据版本、算法差分、完整曲线、失败与恢复成本，支持后续对照。
- **待解决**：有效质量基线，以及过程/成本信号何时带来稳定增量。

## 附录：公式、完整数据与验收范围

### B01 CTF配方：信用、尺度与更新

公式描述实际版本的结构，不代表每个组件分别达到最优。

```text
完整v0： A = ReBN_valid-turn(R + β·G_I) − λ·G_C
分离后： A = ReBN_valid-turn(R) + I_eff − λ·G_C
成本：   c_t = 1 + N_returned,t / 1000
         G_C,t = Σ(k=t…T) c_k
IG信用： G_I,t = Σ(k=t…T−1) δ_k；终止轮intrinsic为0
         β = η / RMS(G_I,raw)
         I_eff,t = m_s · max(β·R_i·G_I,t, 0)
PW：     A'_t = A_Q,t + I_eff,t − λ·G_C,t · D_m/(K_m·n_t)
```

- IG首批raw、未门控、未裁负后缀先定标；截断作用于加权后的后缀，不裁raw增量或总优势。
- `n_t`为完整逻辑轮跨span的有效policy-token数；packing后复用，零active轮不做除零或删除成员。
- PW保留有序FP32、单一PPO和token均值；进入clip后净优势符号和分支可变，不声称独立成本梯度等价。

| 短程实际版本 | 配置 |
| --- | --- |
| 固定输入 | 256；minibatch 128×2；2次Adam、1次scheduler |
| 学习率／KL | 5e−7／0.001 |
| λ | 0.005660749929284128 |
| PPO clip／dual-clip | [0.8, 1.28]／3 |
| IG启用 | 继承首批有效IG，m=1；不等于完整early-off调度验收 |

### B02 Actor性能与数值资格分开

后续NB数值通过，不能补成早期缓存冷/热对照的无损证明。

| 证据 | 性能记录 | 数值边界 |
| --- | --- | --- |
| 固定256轨迹Actor replay，NB关闭 | 新进程空缓存1925.391 s；保留缓存656.149 s | 严格等价失败；更新相对L2差5.61%，不是质量损失比例 |
| 初次NB对照 | 1913.536→1197.195 s | autotune未完全受控，37.44%不能全归NB |
| 后续受控NB检查 | 不作独立加速率估计 | 8-rank postclip梯度及初始/最终master逐位一致 |
| 真实三步联用 | Actor 973.715 / 752.250 / 655.359 s | token/微批不同，非单组件因果 |

持久缓存与去特化减少重复编译；数值、吞吐与端到端效果分别验收。

### B03 工具与Judge的分母

请求、URL、attempt、面板项和事件不能混用。

| 统计范围 | 完整口径 |
| --- | --- |
| 历史Judge审查 | 36,601 task_id请求＝训练29,122＋Eval 7,479；legacy 7另列 |
| 确认误判 | FN 71＋FP 101＝172；支持与未决等级另列，非总体错误率 |
| 开发面板修复 | 32普通＋8边界，含2 unknown；最终40/40符合预期，主判39/40 |
| 实际响应使用 | 41旧＋1新复核，非独立重测40题；历史统计未提供172项新版逐项复验结果 |
| 四provider服务验收 | 1次逻辑请求、1次primary上游尝试；非四路压测或RL采用证明 |
| Visit原窗口 | 2,218逻辑调用，52业务失败＝47 Reader＋5 Summary；HTTP均200 |
| Reader定向复现 | 47历史失败去重46 URL；73 attempts＝23 success＋42 timeout＋8 invalid_payload |

42次timeout均在等待响应头；无法据此区分上游排队、抓取或渲染。

### B04 计时与调度的完整观察

各项收益来自不同实验范围，不能相加或相乘成总提速。

| 2026-09-18阶段 | 秒 | 单位 |
| --- | --- | --- |
| iteration | 5411.207 | driver墙钟 |
| generate | 2859.381 | 已含工具/评分后处理 |
| old-logprob | 734.510 | driver阶段 |
| reference | 165.967 | driver阶段 |
| Actor update | 1609.646 | driver阶段 |
| Judge累计 | 881.243 | 154并发调用的累计 |
| reward | 0.000167 | 读取结果 |

| 调度观察 | 原方式秒 | 新方式秒 | 完整负载 |
| --- | --- | --- | --- |
| GRPO同步→Partial | 10828.329 | 9593.208 | 每臂768轨迹 |
| IGPO同步→Partial | 11678.676 | 10807.729 | 每臂768轨迹 |
| batch256→持续active256 Eval | 4505.21 | 4126.03 | 每组512题生成＋评分 |

工具、缓存、轨迹与随机输出限制因果解释；请求累计和跨rank时间不等于墙钟。

### B05 数据、模型路径与恢复返工

模型路径更新和实际执行工作量分别记录。

| 项目 | 数量与范围 |
| --- | --- |
| 原始训练池 | 8,640；结构通过不代表全部事实正确 |
| 固定可用版本 | 6,994＝6,315原版＋679修订 |
| 优先研究集 | 512条独立冻结，不能简单并集 |
| 已知错误／实质争议 | 835／767，暂扣并保留历史输入和分数 |
| A009 | 已保存8更新＋新增47＝模型路径55；28次发布 |
| 固定成本首attempt | 22次成功更新 |
| 固定成本恢复点 | 已保存16次更新 |
| 固定成本恢复后 | 新增39次更新 |
| 固定成本总量 | 模型路径55；物理成功更新61；模型路径消费6,994成员 |

rank数不乘算优化器更新；恢复之后的返工不从资源账单中消失。

### B06 原始组合：完整Q/R/T/U

每节点246题，Q为正确数，R为平均逻辑轮次，T为面板总返回生成token，U=ΣT/ΣR。

<figure class="talk-figure" data-talk-figure="training-a009" lang="zh-CN" aria-labelledby="talk-training-a009-title">
<p class="tf-title" id="talk-training-a009-title">原始组合方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：原始组合方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-a009-zh.svg" alt="原始组合方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>图11 · 完整8个节点；灰虚线为该运行初始值。三图各指标使用相同尺度。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

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

### B07 更新权重上限：完整Q/R/T/U

各运行保留自身初始参照，不能据跨run曲线高低推断单组件因果。

<figure class="talk-figure" data-talk-figure="training-cap2" lang="zh-CN" aria-labelledby="talk-training-cap2-title">
<p class="tf-title" id="talk-training-cap2-title">更新权重上限方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：更新权重上限方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-cap2-zh.svg" alt="更新权重上限方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>图12 · 完整8个节点；灰虚线为该运行初始值。三图各指标使用相同尺度。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

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

### B08 固定尺度成本：完整Q/R/T/U

全部八节点保留；小数仅显示舍入三位，不重算评测或统计。U不是逐题比值均值。

<figure class="talk-figure" data-talk-figure="training-fixed-cost" lang="zh-CN" aria-labelledby="talk-training-fixed-cost-title">
<p class="tf-title" id="talk-training-fixed-cost-title">固定尺度成本方案的完整训练曲线</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：固定尺度成本方案的完整训练曲线"><img src="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" alt="固定尺度成本方案：质量、平均轮次、总生成token与池化单轮长度的8个记录点。" loading="lazy" decoding="async" width="768" height="640"></a>
<figcaption>图13 · 完整8个节点；灰虚线为该运行初始值。三图各指标使用相同尺度。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

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
