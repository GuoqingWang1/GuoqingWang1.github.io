---
title: "Deep Research Agent RL：系统建设与算法探索"
description: "Deep Research场景与Pipeline、基础设施与效率优化、IGPO到CTF-IGPO、短程与完整实验结果。"
category: technical
lang: zh-CN
translationKey: agentic-rl-research-and-systems
topic: training
tags: [Agentic RL, Talk, 研究进展, 系统基建]
pubDate: "2026-11-03T17:21:13.321Z"
updatedDate: "2026-11-04T08:12:50+08:00"
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

### 1.2 Agent Loop：推理、调用工具、观察、再推理

<figure class="talk-figure al-figure" data-talk-figure="inference-pipeline" lang="zh-CN" aria-labelledby="talk-inference-pipeline-title">
<p class="tf-title" id="talk-inference-pipeline-title">Deep Research Agent loop</p>
<div class="al-flow"><div class="al-node al-question">问题</div><span class="al-arrow" aria-hidden="true"></span><div class="al-cycle"><div class="al-turn"><div class="al-node ">推理</div><span class="al-arrow" aria-hidden="true"></span><div class="al-node ">工具调用</div><span class="al-arrow" aria-hidden="true"></span><div class="al-node al-observation">工具观察</div></div><div class="al-repeat"><span>按需重复 · 0 次或多次</span></div></div><span class="al-arrow" aria-hidden="true"></span><div class="al-finish"><div class="al-node ">推理</div><span class="al-arrow" aria-hidden="true"></span><div class="al-node al-answer">回答</div></div></div>
<figcaption>Agent 根据已有信息决定继续调用工具，或直接给出回答。</figcaption>
</figure>

## 二、Infra搭建与效率优化

### 2.1 主旨：让完整迭代少重复、少等待、可恢复

Deep Research训练同时依赖GPU计算、多轮采样与外部服务。我们的工作围绕四个模块展开：把系统接通，再减少重复计算、长尾等待和故障返工。

<figure class="talk-figure im-figure" data-talk-figure="infra-map" lang="zh-CN" aria-labelledby="talk-infra-map-title">
<p class="tf-title" id="talk-infra-map-title">Infra：支撑一次完整研究迭代</p>
<div class="im-modules" role="group" aria-label="协同支撑研究迭代的四类能力"><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="5"/><path d="m13 13 4 4M16 4h5M16 8h5M4 20h7m5 0 2 2 4-5"/></svg><strong>工具与评分环境</strong></div><div class="im-lines"><span>Search / Visit 缓存 · 并发控制</span><span>重试与取消 · Judge 服务</span></div></div><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/></svg><strong>训练计算</strong></div><div class="im-lines"><span>Qwen / B300 运行栈 · Actor 优化</span><span>编译缓存 / 内核 · IG 与 logprob</span></div></div><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 5h13M3 10h9M3 15h6"/><circle cx="17" cy="16" r="5"/><path d="M17 13v3l2 1"/></svg><strong>采样与评测调度</strong></div><div class="im-lines"><span>Partial · 完整组与策略版本</span><span>连续补入 · 完整 Eval</span></div></div><div class="im-card"><div class="im-heading"><svg class="im-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 4 6v6c0 4.7 4.2 7.5 8 9 3.8-1.5 8-4.3 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg><strong>运行保障</strong></div><div class="im-lines"><span>数据版本 · 保存与恢复</span><span>运行观测 · 结果归档</span></div></div></div><div class="im-connector" aria-hidden="true"></div><div class="im-objective"><span class="im-objective-label">优化目标</span><strong>更少重复工作 · 更短等待 · 可恢复的完整实验</strong></div>
</figure>

### 2.2 工具与评分环境：把外部依赖变成可复用服务

#### Tool Server：关键链路与改造位置

沿Search与Visit两条路径，展示请求执行、缓存复用、Summary处理和结果返回。蓝色编号标出重点建设与改动，绿色箭头标出缓存命中的捷径。

<figure class="talk-figure tool-architecture" data-talk-figure="tool-stack" lang="zh-CN" aria-labelledby="talk-tool-stack-title">
<p class="tf-title" id="talk-tool-stack-title">Tool Server：关键链路与改造位置</p>
<div class="tool-architecture-scroll" role="region" aria-label="查看完整框架图" tabindex="0"><a class="talk-plot-link" href="/figures/agentic-rl-talk/tool-server-framework-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看完整框架图"><img src="/figures/agentic-rl-talk/tool-server-framework-zh.svg" alt="Tool Server详细框架：请求入口分到Search和Visit；有效缓存命中直接返回，未命中才访问上游；Summary每次尝试均校验，再在原预算内重试或切换。蓝色01至07标出重点改动。" width="1600" height="1060" loading="lazy" decoding="async"></a></div>
<figcaption>Search与Visit是可选分支；缓存有效性、备用与重试均受原身份、版本和预算约束。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/tool-server-framework-zh.svg" target="_blank" rel="noopener noreferrer">查看完整框架图 ↗</a><span class="tool-scroll-hint">手机可横向滚动查看。</span></figcaption>
</figure>

<details class="tool-change-notes"><summary>图中改动说明</summary><ol><li><strong>01 统一入口与执行控制</strong><span>完成Python到Go服务接入与接口兼容。批量请求保留逐项成功状态，仅补失败项；沿用原总期限。排队取消定位执行句柄，运行中的工作退出后才释放容量。</span></li><li><strong>02 检索结果缓存</strong><span>按工具、查询参数和版本隔离；命中跳过重复上游搜索。结果结构检查决定缓存资格，存储失败不改写已成功的工具结果。</span></li><li><strong>03 Visit 双层语义缓存</strong><span>正文缓存与goal相关的最终摘要分开。有效final命中可跳过Reader抓取和Summary；final未命中时，换goal仍可复用正文。</span></li><li><strong>04 Summary 路由</strong><span>按配置选择主路、受限备用与长文路径；主备共用原剩余预算，并保留实际来源。</span></li><li><strong>05 每次尝试的结果校验</strong><span>检查响应、JSON与拒绝/过滤等状态；只有允许的失败进入预算内重试或备用。通过校验的主路或备用结果才有final缓存资格。</span></li><li><strong>06 缓存身份与持久化</strong><span>检查goal、模型、提示词、版本、内容依赖及到期；默认365天TTL可被配置覆盖。同进程合并不等于跨副本锁；queued不等于已落盘。图文final独立，Reader正文和锁可共享。</span></li><li><strong>07 全链路可观测性</strong><span>关联根请求、上游尝试、Reader/Summary与缓存事件；持久化spool、分页读取和ACK支撑中央看板，区分命中、写入、错误、取消和采集缺口。</span></li></ol></details>

#### LLM Judge：持久任务、有界执行、明确语义

Judge从一个评分调用，扩展为训练与评测共同使用的任务服务。

| 模块 | 已完成的建设 | 对训练与评测的作用 |
| --- | --- | --- |
| 任务与结果 | 持久任务、身份去重、状态查询、结果复用与恢复 | 中断后接续，避免已完成评分重复执行 |
| 执行调度 | 工作队列、共享配额、限流、主备路由、条件复核 | 同一任务共享剩余次数和截止时间，恢复不重新获得预算 |
| 评分语义 | 严格输出校验；别名、单位、年代、引用检查；保留unknown | 不把信息不足或技术失败静默写成错误奖励0 |
| 消费与观测 | 生成和评分解耦、旧接口兼容、显式新协议、事件持久化与集中采集 | 明确实际使用的模型路径、评分状态和故障位置 |

36,601个历史请求的审查确认172项误判；另一个40项开发面板中，符合预期的处理从38项到40项，包含2项应保留的unknown。四路服务的上线验收实际命中一路，详细分母见附录B03。

### 2.3 训练计算：从运行栈到Actor与IG评分

#### 先建立可重复进入真实训练的运行基线

Qwen3.5混合结构、B300内核、训练框架和推理引擎必须共同工作，导入成功只是起点。

| 建设层 | 实际工作 |
| --- | --- |
| 镜像与内核 | 固定依赖与ABI；分别适配标准注意力、GatedDeltaNet及长上下文路径 |
| 训练与推理 | 接通VERL、Megatron-Core、MBridge、Transformer Engine和SGLang；核对训练—推理权重转换 |
| 轨迹与数值 | 保存真实动作token、行为logprob、mask和策略版本；区分训练侧old/ref与rollout概率 |
| 完整生命周期 | 在8×B300上，GRPO/IGPO各完成384条真实工具轨迹、3次Actor更新、最终保存与权重同步 |

#### 再减少重复编译与无关评分计算

- **Actor**：持久化编译缓存、隔离缓存环境，减少卷积动态形状的重复特化；保留原autotune，并进入真实三步训练验证。
- **IG评分**：只投影目标预测行，核对三轴mRoPE；复用rollout上下文，并处理跨策略版本的评分边界。
- **端到端定位**：关联rollout、工具/Judge、old/ref、Actor和同步保存的时间；优先优化实际关键路径。

固定Actor缓存回放观察到1925.39→656.15秒，但严格数值等价未通过，不能作为无损加速成绩；该对照和后续独立NB检查保留在附录B02。

### 2.4 采样与评测：减少长尾造成的空闲

#### Partial rollout：保留未完成任务，按完整组交付

<figure class="talk-figure tr-figure" data-talk-figure="partial-scheduling" lang="zh-CN" aria-labelledby="talk-partial-scheduling-title">
<p class="tf-title" id="talk-partial-scheduling-title">Partial：保留任务状态，按完整组交付</p>
<div class="tr-two tr-schedule"><div class="tr-panel"><p class="tr-panel-heading">同步整批</p><div class="tr-node "><strong>整批开始采样</strong><small>同一批任务</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node "><strong>等待整批结束</strong><small>完成时间受最长轨迹影响</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>Actor 更新</strong><small>随后进入下一批</small></div></div><div class="tr-panel"><p class="tr-panel-heading">Partial rollout</p><div class="tr-node tr-soft-blue"><strong>持久任务池</strong><small>保留未完成轨迹</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>完整组 ready</strong><small>交付完整组，剩余任务留池</small></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-green"><strong>阶段切换</strong><small>暂停生成 → Actor 更新 → 续跑</small></div></div></div>
<figcaption>调度关系示意，不表示时间比例。共享 GPU 时按阶段暂停、更新与续跑，保留组完整性及策略版本。</figcaption>
</figure>

任务池、ready缓冲、策略版本、暂停续跑和IG边界重评共同支撑Partial；共享GPU仍按生成与更新阶段切换。

- 正式四臂验证各保留96题×8轨迹，768条/臂，包含最终长尾。
- 容器墙钟观测下降：GRPO 11.41%，IGPO 7.46%；长期质量与off-policy影响另行验证。

#### 连续Eval：完成一条，补入下一条

持续维持活跃任务，分开生成与评分后处理，避免每一批都等待最慢样本再开始下一批。

同512题全部完成生成和评分，完整Eval由4505.21降至4126.03秒，观测下降8.42%。单请求延迟有所上升；独立Eval采用持续补入，训练内Validate保留自身路径。

### 2.5 运行保障：让中断之后能够继续研究

数据版本、完整状态和观测身份贯穿采样、更新、保存与恢复，减少丢失工作和重复计算。

| 模块 | 交付 |
| --- | --- |
| 数据版本 | 6,994个可用精确版本：6,315原版＋679修订；512研究集独立冻结，保留来源与修订记录 |
| 保存恢复 | 模型、优化器、数据游标及相应采样状态衔接；处理混批、格式、保留策略和完整性检查 |
| 实际续跑 | 一条完整运行从8次更新checkpoint接续，新增47次；累计55次模型路径更新、28次策略发布 |
| 观测归档 | 关联run、step、轨迹、请求和策略版本，保存完整结果、失败与恢复成本 |

恢复验收跨过混批、真实更新和后续采样；数据可用不等于全量事实无误，运行完成也不等于模型质量提升。

### 2.6 优化效果：在对应负载下看收益

计算优化减少评分时延与显存占用；调度优化减少完整任务中的等待。

<figure class="talk-figure" data-talk-figure="infra-benefits" lang="zh-CN" aria-labelledby="talk-infra-benefits-title">
<p class="tf-title" id="talk-infra-benefits-title">Infra优化效果总览</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/infra-benefits-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图"><img src="/figures/agentic-rl-talk/infra-benefits-zh.svg" alt="Infra优化效果总览：IG评分时延、增量峰值显存、Partial训练调度与连续评测。" width="1024" height="672" loading="lazy" decoding="async"></a>
<figcaption>两项固定组件负载对照，以及Partial和连续Eval的完整运行观测；每个面板保留自己的单位与范围。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/infra-benefits-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

四个面板来自各自的组件对照或调度实验，收益不能相加。Tool Server与Judge另形成了缓存复用、有限重试、持久恢复和可诊断能力，不用未测的全局提速比例代替这些交付。

## 三、算法探索：IGPO → CTF-IGPO

训练框架将完整轨迹与评分转成策略更新，再把新权重用于后续采样。

<figure class="talk-figure dr-figure" data-talk-figure="training-pipeline" lang="zh-CN" aria-labelledby="talk-training-pipeline-title">
<p class="tf-title" id="talk-training-pipeline-title">Deep Research · RL 训练 pipeline</p>
<div class="dr-training-grid"><div class="dr-panel"><p class="dr-stage">01 · 采样</p><div class="dr-three dr-entry"><div class="dr-node "><strong>训练任务</strong><small>只输入问题</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-blue"><strong>多轨迹 Rollout</strong><small>AgentLoop · SGLang</small></div><span class="dr-arrow " aria-hidden="true"></span><div class="dr-node dr-soft-blue"><strong>轨迹与策略版本</strong><small>动作 token · behaviour logprob</small></div></div></div><div class="dr-flow-down" aria-hidden="true">↓</div><div class="dr-panel"><p class="dr-stage">02 · 评分与信用</p><div class="dr-supervision"><strong>监督答案</strong> → 仅用于 Judge 与 IG 评分</div><div class="dr-scorers"><div class="dr-node dr-green"><strong>Judge</strong><small>终局质量</small></div><div class="dr-node dr-yellow"><strong>IG scoring</strong><small>轮级信息增益</small></div><div class="dr-node dr-peach"><strong>Cost</strong><small>交互与生成成本</small></div></div><div class="dr-merge" aria-hidden="true"></div><div class="dr-node dr-advantage dr-soft-blue"><strong>信用分配与优势</strong></div></div><div class="dr-actor-feed" aria-hidden="true"></div><div class="dr-panel"><p class="dr-stage">03 · VERL：更新与同步</p><div class="dr-update-row"><div class="dr-adv-input">合成优势</div><span class="dr-adv-input-arrow" aria-hidden="true">↓</span><div class="dr-node dr-reference"><strong>Reference policy</strong><small>ref logprob · KL</small></div><span class="dr-arrow dr-kl-arrow" aria-hidden="true"></span><div class="dr-node dr-actor dr-blue"><strong>Actor · PPO</strong><small>合成优势 + old logprob</small></div><span class="dr-arrow dr-sync-arrow" aria-hidden="true"></span><div class="dr-node dr-sync dr-soft-blue"><strong>权重同步</strong><small>发布新策略</small></div></div><div class="dr-out-branches" aria-hidden="true"><span></span><span></span></div><div class="dr-outputs"><div class="dr-node dr-soft-blue"><strong>后续 Rollout</strong></div><div class="dr-node dr-green dr-eval"><strong>开发评测</strong><small>Q / R / T / U</small></div></div></div></div><div class="dr-save-state"><strong>Save / restore</strong><span>模型 · 优化器 · 数据游标 · Partial 状态</span></div>
<figcaption>监督答案只进入评分。训练侧重算 old/ref；开发评测不回流梯度。信号与执行顺序按版本配置。</figcaption>
</figure>

### 3.1 IGPO：为信息获取增加中间反馈

[IGPO](https://arxiv.org/abs/2510.14967)从策略对正确答案概率的变化构造轮级信号，补充终局结果监督。

<figure class="talk-figure tr-figure" data-talk-figure="igpo-signal" lang="zh-CN" aria-labelledby="talk-igpo-signal-title">
<p class="tf-title" id="talk-igpo-signal-title">IGPO：从终局奖励到轮级反馈</p>
<div class="tr-panel tr-trajectory"><p class="tr-panel-heading">任务内的多轮交互</p><div class="tr-three-flow"><div class="tr-node tr-soft-blue"><strong>第 1 轮</strong><small>行动 → 观察</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-soft-blue"><strong>后续轮</strong><small>行动 → 观察</small></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-green"><strong>最终回答</strong></div></div></div><p class="tr-supervision">训练监督 · 参考答案用于评分</p><div class="tr-ig-sources"><div class="tr-panel"><p class="tr-panel-heading">轮级过程信号</p><div class="tr-score-pair"><div class="tr-node tr-yellow"><strong>观察前评分</strong></div><span class="tr-arrow" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>观察后评分</strong></div></div><span class="tr-down" aria-hidden="true"></span><div class="tr-node tr-yellow"><strong>参考答案评分变化</strong></div></div><div class="tr-panel tr-ig-result"><p class="tr-panel-heading">终局结果监督</p><div class="tr-node tr-green"><strong>回答质量</strong><small>最终结果</small></div></div></div><div class="tr-join tr-ig-join" aria-hidden="true"></div><div class="tr-node tr-shared tr-blue"><strong>结合过程与结果训练策略</strong></div>
<figcaption>IGPO 在终局监督之外提供轮级反馈。评分差是训练代理信号，不等于已识别的因果信息价值。</figcaption>
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
<figcaption>PW 配方结构：合成后不再统一归一化，三路信号共用一次裁剪；该结构不代表已证明最优。</figcaption>
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
<figcaption>训练输入固定256条、两次更新；评测为246题开发面板。候选较训练对照的点值改善未通过更强证据要求。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/short-run-results-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

- **训练剂量**：固定保存256输入、2次Adam更新；评测为246题已暴露开发面板。
- **相对训练对照**：正确数＋11，平均轮次−2.668%，总token−4.209%，池化单轮长度−1.583%。
- 统计证据尚不足以确认稳定收益；相对SFT平均轮次仍＋0.164%，不是完整RL压缩成功。

### 4.2 完整55步：三条配置均未达联合目标

三条训练均完整执行，但没有同时保持质量、减少轮次并满足长度约束。

<figure class="talk-figure" data-talk-figure="complete-quality" lang="zh-CN" aria-labelledby="talk-complete-quality-title">
<p class="tf-title" id="talk-complete-quality-title">三条完整训练的质量轨迹</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/complete-quality-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图: 三条完整训练的质量轨迹"><img src="/figures/agentic-rl-talk/complete-quality-zh.svg" alt="三个独立面板保留每条运行的8个质量节点：原始组合120至1，更新权重上限115至0，固定尺度成本106至2；每点246题。" loading="lazy" decoding="async" width="768" height="420"></a>
<figcaption>各运行55次模型路径更新、每点246题；虚线为各自初始值。三条均未通过质量与成本联合要求，不作公平跨运行排名。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/complete-quality-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
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

<figure class="talk-figure" data-talk-figure="actor-cache" lang="zh-CN" aria-labelledby="talk-actor-cache-title">
<p class="tf-title" id="talk-actor-cache-title">固定输入 Actor 回放：持久缓存的性能观测</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/actor-cache-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图: 固定输入 Actor 回放：持久缓存的性能观测"><img src="/figures/agentic-rl-talk/actor-cache-zh.svg" alt="同256条轨迹，两次新进程，空缓存1925.39秒、保留缓存656.15秒。严格数值等价未通过。" loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>固定输入、两次新进程的 Actor-only 计时；不是整步收益，严格数值等价未通过。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/actor-cache-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

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

<figure class="talk-figure" data-talk-figure="eval-scheduling" lang="zh-CN" aria-labelledby="talk-eval-scheduling-title">
<p class="tf-title" id="talk-eval-scheduling-title">完整 Eval 的调度观测</p>
<a class="talk-plot-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer" aria-label="查看大图：完整 Eval 的调度观测"><img src="/figures/agentic-rl-talk/eval-scheduling-zh.svg" alt="同512题、同模型的两次完整Eval，零起点比较墙钟时间。" loading="lazy" decoding="async" width="768" height="336"></a>
<figcaption>共享工具、缓存与随机输出限制因果归因；单请求延迟也有所上升。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/eval-scheduling-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
</figure>

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
<figcaption>完整8个节点；灰虚线为该运行初始值。三图各指标使用相同尺度。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-a009-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
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
<figcaption>完整8个节点；灰虚线为该运行初始值。三图各指标使用相同尺度。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-cap2-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
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
<figcaption>完整8个节点；灰虚线为该运行初始值。三图各指标使用相同尺度。 <a class="tf-caption-link" href="/figures/agentic-rl-talk/training-fixed-cost-zh.svg" target="_blank" rel="noopener noreferrer">查看大图 ↗</a></figcaption>
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
