---
title: "日志只追加，system prompt 却被重写了"
description: "从 Pi 的一个兼容分支，看追加式历史如何在请求构造时改变开头的 system 字段。"
category: technical
lang: zh-CN
translationKey: system-prompt-after-adapter
topic: runtime
tags: [Agent, 上下文, 推理接口]
pubDate: "2026-11-01T06:32:29+08:00"
order: 10
draft: false
review: true
---

排查 Agent 请求时，很容易只盯着本地消息列表：旧消息都没改，末尾只多了一条状态更新，于是推断下一次请求也只是追加了内容。

在读 Pi 的一个 provider 兼容分支时，我们看到一个容易遗漏的步骤：消息列表还要经过适配，才能变成请求参数。追加发生在前一层，不保证后一层仍保留相同的开头。

下面只讨论一个固定版本中，`supportsMidConvoSystemMessages` 为 `false` 的路径。例子是依据源码整理的字段示意，没有进行线上请求抓包。

## 日志里只多了一条更新

假设初始 system 包含固定规则和一个状态值，之后状态由 `Old` 变成 `New`。用一段合成数据表示：

```javascript
const before = { messages: [
  { role: "system", content: "", timestamp: 0,
    sections: { rules: "Fixed", state: "Old" } },
  { role: "user", content: "Task", timestamp: 1 }
] };

const after = { messages: [...before.messages,
  { role: "system", content: "", timestamp: 2,
    sections: { state: "New" } }
] };
```

从这个数组看，原来的两条消息都在，更新只出现在末尾。`sections` 是这里用于表达状态补丁的结构；它不是已经发给服务端的原始 HTTP 字段。

Pi 的会话代码会根据 system 各节的差异生成类似的补丁。到这里为止，“历史只追加了消息”这个观察成立。

## 适配器重新生成了开头

关键分支在 [`resolveTranscript`](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/transcript.ts#L108)。当接口不支持中途的 system 消息时，它调用 `collapseSystemMessages`：重放所有 system 更新，生成一条代表当前状态的开头消息，并移除原来的中途 system 消息。

重放时，同名 section 的新值覆盖旧值。因此，新开头仍有 `rules: "Fixed"`，但 `state` 已经成为 `"New"`。

随后，[文本渲染函数](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/text.ts#L15)把各节组织成 system 文本，得到这样的变化：

```text
更新前的 system 文本：Fixed\n\nOld
更新后的 system 文本：Fixed\n\nNew
```

这里的 `\n` 表示换行。再往下，[请求构造代码](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/api/anthropic-messages.ts#L1132)会使用这份文本填充 `system` 参数。

所以，日志层面没有修改旧消息，适配器交出的开头却已经不同。它是为接口能力做的兼容处理，单凭这一点不能认定实现有 bug。

## 排查时多看一层

遇到“日志没变，为什么请求变了”的问题，我会把检查位置向后移一步：先看应用维护的消息历史，再看 provider 适配之后的请求字段，而不是只打印最初的 `messages`。

比较时，至少记录使用的适配器版本和兼容标志，并分别检查 `system`、工具定义与会话消息的变化。不同层的记录要标明来源，否则一份“发送前日志”究竟位于转换之前还是之后，后来很难判断。

这也解释了为什么不应为了保留前缀，就把兼容标志强行改为 `true`：它描述的是接口能力。对于必须更新的状态，应先保证新值正确传递，再在受支持的请求路径中讨论复用。

到这里，我们确认的只是请求内容发生了变化。哪些 token 前缀仍能复用、后端是否命中缓存，以及费用和延迟如何变化，都需要各自的运行证据。尤其不能把一次 system 改写直接写成“整个缓存失效”。

这个小例子给我的提醒是：判断一次上下文更新的影响，要沿着实际的转换路径检查。日志里的追加操作，只是这条路径的起点。
