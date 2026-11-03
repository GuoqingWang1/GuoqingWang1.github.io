---
title: "The Log Is Append-Only, but the System Prompt Is Rewritten"
description: "A compatibility branch in Pi shows how request construction can change the leading system field even when the event log only appends."
category: technical
lang: en
translationKey: system-prompt-after-adapter
topic: runtime
tags: [Agent, 上下文, 推理接口]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 10
draft: false
review: true
---

When debugging agent requests, it is easy to focus only on the local message list: the old messages are unchanged, one state update has been appended, and we infer that the next request merely appends content too.

While reading a provider compatibility branch in Pi, we noticed an easy-to-miss step: the message list still has to be adapted into request parameters. To understand the effect of an update, inspect the local events, the resolved state, and the request fields separately.

The example below uses the Pi commit pinned by the links and the `supportsMidConvoSystemMessages=false` branch. The final section records local execution of transcript collapsing and text rendering. The request-field mapping still comes from source inspection, not captured live traffic or a cache test.

## The local events gain just one update

The initial system message contains fixed rules and state `Old`. A later patch changes the state to `New`. Synthetic data can represent this as follows:

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

At this point, `before.messages.length` is 2 and `after.messages.length` is 3. The first message in the latter list still says `state: "Old"`; the new value appears only in the last patch. This is the event-log view: it records what happened without requiring the original object to be rewritten in place.

`sections` is Pi's structure for system-section updates, not an HTTP field already sent to the server. Session code produces patches by comparing these sections; a later stage still needs to interpret them.

## The adapter changes the current state without changing old events

The key branch is in [`resolveTranscript`](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/transcript.ts#L108). When the interface does not support system messages in the middle of a conversation, it calls `collapseSystemMessages`: updates are replayed into a new leading system message, and the original system events are removed from the output list. Messages with other roles remain.

During replay, a new value overwrites the old value of a section with the same name. The resolved leading message therefore contains `rules: "Fixed"` and `state: "New"`, while the original event list still retains the initial `Old`. They are different objects.

For a debugging script placed at the root of that fixed-version repository, using an environment that can load these TypeScript files directly, the imports can use the paths below. Continuing with the data above, the assertions should capture these distinctions:

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

The first entry in the original log has not been changed to `New`. Instead, a current view has been rebuilt from all the events. Printing only the original list's first message would miss this change. The resolved list also has two messages both before and after the update; comparing counts alone does not establish unchanged contents.

## The request's system text comes from the resolved view

The [text-rendering function](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/utils/text.ts#L15) then joins the content and section values. For these inputs, the expected text can be written explicitly:

```javascript
const oldText = getSystemMessageText(resolvedBefore.messages[0]);
const newText = getSystemMessageText(resolvedAfter.messages[0]);

assert.equal(oldText, "Fixed\n\nOld");
assert.equal(newText, "Fixed\n\nNew");
```

The [non-OAuth branch in `buildParams`](https://github.com/earendil-works/pi/blob/89e12ccd4a5eb587bfa3f4a823baa7cad1549735/packages/ai/src/api/anthropic-messages.ts#L1132) places this text into a text block in `params.system`. Omitting model parameters and optional cache settings, the fields relevant to this example compare as follows:

| Observation point | Before the update | After the update |
|---|---|---|
| Number of local events | `2` | `3` |
| `state` in the first local entry | `Old` | `Old` |
| Number of resolved messages | `2` | `2` |
| `state` in the first resolved entry | `Old` | `New` |
| `system[0].text` in the non-OAuth request | `Fixed\n\nOld` | `Fixed\n\nNew` |

Here, `\n` denotes a newline. The final row follows the field mapping in request-construction code; it is not a record captured after an actual network send. Old log entries have not been rewritten, but the current text used by the adapter is different.

A useful control is an update that repeats the same value: make the patch `state: "Old"`. The local log still gains one event, but the collapsed text should match the original:

```javascript
const sameValueUpdate = { messages: [...before.messages,
  { role: "system", content: "", timestamp: 2,
    sections: { state: "Old" } }
] };
const resolvedSame = resolveTranscript(sameValueUpdate, false);
assert.equal(sameValueUpdate.messages.length, 3);
assert.equal(getSystemMessageText(resolvedSame.messages[0]), oldText);
```

The number of added events therefore proves neither unchanged request contents nor an inevitable content change. This control checks the resulting text; whether there is any real cache benefit remains a separate question.

## Place checks along the actual conversion path

For a similar issue, I would retain three inspection points in order: what was appended to the event list; what the leading system message contains after adaptation; and what changed in the constructed `system`, tool definitions, and conversation messages.

Records should identify the adapter version, compatibility flags, and stage. “Pre-send log” is not precise enough: it may refer to a point before or after conversion. To judge the bytes ultimately sent, continue into the sending layer instead of treating an intermediate object as a complete HTTP request.

This branch handles interface compatibility, so rewriting alone does not establish a bug. In particular, do not force the compatibility flag to `true` merely to preserve a prefix. Required state changes must still be delivered correctly, and the interface must support the chosen representation.

The example establishes only a content change. The text `Fixed` remains the same, but which token prefixes remain reusable, whether the backend hits its cache, and how cost or latency changes require corresponding runtime evidence. A system-prompt rewrite cannot simply be equated with invalidating the entire cache.

An append in the log is only the starting point. Following the same update through each conversion stage establishes which representation of state is actually being compared.

## Run the example locally

[Download the complete example bundle](/examples/system-prompt-after-adapter.zip), extract it, and enter the `system-prompt-after-adapter` directory. The bundle includes the two unmodified source files from the pinned commit, a SHA256 manifest, and the original MIT license. No provider SDK installation is needed.

The offline check ran on 2026-11-03 with **Node.js 24.14.0 on macOS arm64**. All 16 checks passed: 3 for source/license integrity and 13 for function behavior.

```sh
node system-prompt-after-adapter.mjs
```

The local event count changed from `2` to `3`, while the collapsed message count stayed at `2`. Text changed from `Fixed\n\nOld` to `Fixed\n\nNew`; a same-value patch kept the old text. Original inputs were not rewritten. See the [recorded output](/examples/cpu-verification-more.json).

This actually executed `resolveTranscript` and `getSystemMessageText`, but **not `buildParams`, a provider call, or an HTTP request**. The table's request-field correspondence remains a source-inspection result from that version, not captured network traffic. Cache hits, token reuse, and latency were not measured. Node erased TypeScript type syntax; this is not a pass of the original project's type checker.
