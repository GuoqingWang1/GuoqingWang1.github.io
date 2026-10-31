---
title: "The Log Is Append-Only, but the System Prompt Is Rewritten"
description: "A compatibility branch in Pi shows how request construction can change the leading system field even when the event log only appends."
category: technical
lang: en
translationKey: system-prompt-after-adapter
topic: runtime
tags: [Agent, 上下文, 推理接口]
pubDate: "2026-11-01T06:32:29+08:00"
order: 10
draft: false
review: true
---

When debugging agent requests, it is easy to focus only on the local message list: the old messages are unchanged, one state update has been appended, and we infer that the next request merely appends content too.

While reading a provider compatibility branch in Pi, we noticed an easy-to-miss step: the message list still has to pass through an adapter before it becomes request parameters. An append at the earlier layer does not guarantee that the next layer retains the same beginning.

The example below covers one fixed version and the path where `supportsMidConvoSystemMessages` is `false`. It is a source-derived illustration of the fields, not a capture of live HTTP traffic.

## The log gains just one update

Suppose the initial system message contains fixed rules and a state value, which later changes from `Old` to `New`. Synthetic data can represent this as follows:

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

In this array, the original two messages are still present and the update appears only at the end. `sections` is the structure used here to express a state patch; it is not a raw HTTP field already sent to the server.

Pi's session code produces similar patches by comparing sections of the system prompt. Up to this point, the observation that the history has only appended a message is correct.

## The adapter rebuilds the beginning

The key branch is in [`resolveTranscript`](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/transcript.ts#L108). When the interface does not support system messages in the middle of a conversation, it calls `collapseSystemMessages`: all system updates are replayed into a new leading message representing the current state, and the original intermediate system messages are removed.

During replay, a new value overwrites the old value of a section with the same name. The new leading message therefore still has `rules: "Fixed"`, but its `state` is now `"New"`.

The [text-rendering function](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/text.ts#L15) then assembles the sections into system text, producing this change:

```text
System text before: Fixed\n\nOld
System text after:  Fixed\n\nNew
```

Here, `\n` denotes a newline. Further down the path, the [request-construction code](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/api/anthropic-messages.ts#L1132) uses this text to populate the `system` parameter.

The log has not modified an old message, yet the leading content produced by the adapter is different. This is compatibility handling for the interface's capabilities; the change alone does not establish a bug.

## Look one layer further when debugging

For a problem such as “the old log entries did not change, so why did the request change?”, I would move the inspection point one step further: inspect the application's message history, then the request fields after provider adaptation, instead of printing only the original `messages`.

At a minimum, record the adapter version and compatibility flags, and inspect changes to `system`, tool definitions, and conversation messages separately. Label which layer each record comes from. Otherwise, it becomes difficult to tell later whether a “pre-send log” was captured before or after conversion.

This also explains why the compatibility flag should not be forced to `true` just to preserve a prefix: it describes an interface capability. For state that must change, first ensure that the new value is delivered correctly, then consider reuse within the request paths the interface supports.

So far, we have established only that request content changes. Which token prefixes remain reusable, whether the backend hits its cache, and how cost or latency changes each require their own runtime evidence. A system-prompt rewrite must not be described automatically as “the entire cache was invalidated.”

The reminder from this example is to follow the actual conversion path when judging the effect of a context update. An append in the log is only the beginning of that path.
