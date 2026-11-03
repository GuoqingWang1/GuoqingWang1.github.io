---
title: "日志只追加，system prompt 却被重写了"
description: "从 Pi 的一个兼容分支，看追加式历史如何在请求构造时改变开头的 system 字段。"
category: technical
lang: zh-CN
translationKey: system-prompt-after-adapter
topic: runtime
tags: [Agent, 上下文, 推理接口]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 10
draft: false
review: true
---

排查 Agent 请求时，很容易只盯着本地消息列表：旧消息没改，末尾只多了一条状态更新，于是推断下一次请求也只是追加了内容。

在读 Pi 的一个 provider 兼容分支时，我们看到一个容易遗漏的步骤：消息列表还要经过适配，才能成为请求参数。判断更新影响时，需要分别看本地事件、适配后的状态和请求字段。

下面固定使用文中链接的 Pi commit，并讨论 `supportsMidConvoSystemMessages=false` 的分支。文末记录了事件折叠和文本渲染函数的本地实跑；请求字段映射仍来自源码核对，不是线上抓包或缓存测试。

## 本地事件只增加一条

初始 system 包含固定规则和状态 `Old`，后来追加一个把状态改为 `New` 的补丁。用合成数据表示：

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

此时 `before.messages.length` 是 2，`after.messages.length` 是 3。后一份列表的首条消息仍写着 `state: "Old"`，新值只出现在最后一个补丁里。这就是事件日志的视角：记录发生了什么，不要求原地改写最初的对象。

`sections` 是 Pi 用来表示 system 各节更新的结构，不是已经发给服务端的 HTTP 字段。会话代码会根据这些节的差异生成补丁；后面还需要解释这些补丁。

## 适配后，旧事件不动，当前状态改变

关键分支在 [`resolveTranscript`](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/transcript.ts#L108)。当接口不支持中途 system 消息时，它调用 `collapseSystemMessages`：重放更新、生成一条新的开头 system，并从输出列表中移除原来的 system 事件。其他角色的消息保留下来。

重放时，同名 section 的新值覆盖旧值。因此，适配后的开头包含 `rules: "Fixed"` 和 `state: "New"`，而原事件列表仍保留最初的 `Old`。这是两个不同的对象。

若在该固定版本的仓库根目录放置调试脚本，并使用能直接加载这些 TypeScript 文件的环境，可以按下面的路径导入函数。接着前面的数据，断言应当描述这些区别：

```javascript
import assert from "node:assert/strict";
import { resolveTranscript } from "./packages/ai/src/utils/transcript.ts";
import { getSystemMessageText } from "./packages/ai/src/utils/text.ts";

const resolvedBefore = resolveTranscript(before, false);
const resolvedAfter = resolveTranscript(after, false);

assert.equal(before.messages.length, 2);
assert.equal(after.messages.length, 3);
assert.equal(after.messages[0].sections.state, "Old");
assert.equal(resolvedBefore.messages[0].sections.state, "Old");
assert.equal(resolvedAfter.messages[0].sections.state, "New");
assert.equal(resolvedBefore.messages.length, 2);
assert.equal(resolvedAfter.messages.length, 2);
```

这里没有把原日志的首条记录改成 `New`，而是根据全部事件重新生成了当前视图。若只打印原列表的第一条消息，就会错过这个变化。适配后的列表在更新前后也都是两条消息；只比数量，同样不能证明内容未变。

## 请求中的 system 文本来自当前视图

接下来，[文本渲染函数](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/text.ts#L15)把内容和 section 的值连接起来。对这组输入，预期文本可以明确写成：

```javascript
const oldText = getSystemMessageText(resolvedBefore.messages[0]);
const newText = getSystemMessageText(resolvedAfter.messages[0]);

assert.equal(oldText, "Fixed\n\nOld");
assert.equal(newText, "Fixed\n\nNew");
```

[`buildParams` 的非 OAuth 分支](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/api/anthropic-messages.ts#L1132)会把这段文本放进 `params.system` 的 text block。省略模型参数和可选缓存选项，只比较本例关心的字段：

| 观察点 | 更新前 | 更新后 |
|---|---|---|
| 本地事件数量 | `2` | `3` |
| 本地首条记录的 `state` | `Old` | `Old` |
| 适配后的消息数量 | `2` | `2` |
| 适配后首条记录的 `state` | `Old` | `New` |
| 非 OAuth 请求的 `system[0].text` | `Fixed\n\nOld` | `Fixed\n\nNew` |

表中的 `\n` 表示换行。最后一行来自请求构造代码的字段对应关系，不是一份实际发送后的网络记录。日志的旧记录没有被改写，但适配器使用的当前文本已经不同。

还可以补一个同值更新的对照：把补丁写成 `state: "Old"`。本地日志仍增加一条，但折叠后的文本应与原来相同：

```javascript
const sameValueUpdate = { messages: [...before.messages,
  { role: "system", content: "", timestamp: 2,
    sections: { state: "Old" } }
] };
const resolvedSame = resolveTranscript(sameValueUpdate, false);
assert.equal(sameValueUpdate.messages.length, 3);
assert.equal(getSystemMessageText(resolvedSame.messages[0]), oldText);
```

因此，新增事件数既不能证明请求内容不变，也不能证明它必然变化。这个对照检查的是更新后的文本；有没有真实缓存收益，仍是另一个问题。

## 把检查点放在实际转换路径上

遇到类似问题，我会依次保留三个检查点：事件列表里追加了什么；适配输出中的首条 system 现在是什么；构造出的 `system`、工具定义和会话消息分别发生了什么变化。

记录也应标明适配器版本、兼容标志和所处阶段。“发送前日志”这个名字不够精确：它可能在转换之前，也可能在之后。如果还需要判断最终发出的字节，必须继续核对发送层，而不是把中间对象直接当成完整 HTTP 请求。

这个分支属于接口兼容处理，不能单凭改写认定它有 bug。尤其不要为了保留前缀，就强行把兼容标志改为 `true`；必须变化的状态仍要正确传递，接口也必须支持所选表示。

本例只能确认内容变化。`Fixed` 这段文本仍然相同，但究竟哪些 token 前缀可复用、后端是否命中缓存，以及费用和延迟怎样变化，都需要对应的运行证据。一次 system 改写不能直接等同于“整个缓存失效”。

日志里的追加只是起点。把同一次更新沿实际转换路径逐层对齐，才能知道自己比较的是哪一种状态。

## 运行本文示例

[下载完整示例包](/examples/system-prompt-after-adapter.zip)，解压后进入 `system-prompt-after-adapter` 目录。包内包含文中固定 commit 的两份未改写源码、SHA256 清单及原 MIT 许可；不需要安装 provider SDK。

2026-11-03 使用 **Node.js 24.14.0、macOS arm64** 离线运行，16 项检查通过，其中 3 项核对源码／许可完整性，13 项核对函数行为：

```sh
node system-prompt-after-adapter.mjs
```

本地事件数从 `2` 变为 `3`，折叠后的消息数保持 `2`；文本由 `Fixed\n\nOld` 变为 `Fixed\n\nNew`，同值补丁则保留旧文本。原输入未被改写，见[实测记录](/examples/cpu-verification-more.json)。

本次实际执行了 `resolveTranscript` 和 `getSystemMessageText`，**没有执行 `buildParams`、调用 provider 或发送 HTTP 请求**。表中请求字段的对应仍是同一版本的源码核对，不是网络抓包；缓存命中、token 复用和耗时也没有被测量。Node 只擦除了 TypeScript 类型语法，这不等于通过原项目的类型检查。
