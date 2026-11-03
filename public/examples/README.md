# Blog CPU examples / 博客 CPU 示例

These independent scripts use synthetic inputs only. They do not load a model,
contact a service, or replay a training run. Each prints JSON and exits nonzero
if a check fails. The downloadable Python scripts use explicit checks that
remain active under `python -O`.

这些示例仅使用合成输入，不加载模型、不访问服务，也不重放训练。
每个脚本输出 JSON；检查失败时以非零状态退出。完整 Python 脚本使用显式检查，
不会因 `python -O` 而删掉检查或必要操作。

Tested on 2026-11-03 / 实测日期：2026-11-03

- Python 3.11.11, macOS arm64, CPU.
- NumPy 2.2.4 for the string example.
- PyTorch 2.6.0 for GRPO, with one CPU thread.
- The cancellation example needs only the Python standard library.

The version list in `requirements-cpu.txt` records the tested direct
dependencies, not a complete cross-platform lockfile. Use a separate virtual
environment and the PyTorch wheel appropriate for your platform. The official
CPU installation index is `https://download.pytorch.org/whl/cpu`.

`requirements-cpu.txt` 记录实测的直接依赖版本，不是跨平台完整锁文件。
建议使用独立虚拟环境，并安装适合平台的 PyTorch CPU 构建。
安装入口：https://pytorch.org/get-started/locally/

After saving the scripts, run / 保存脚本后运行：

```sh
python numpy-string-dtype-width.py
python cancelled-queued-work.py
python -O cancelled-queued-work.py
python grpo-equal-rewards-zero-advantage.py
```

The recorded output is in `cpu-verification.json`:

- NumPy: 20 checks passed; U2/U5 widening retained content; narrowing to U2
  produced `re`; all 18 original input arrays were unchanged.
- Cancellation: two controlled cases, 42 checks per run; normal and `-O`
  outputs agreed. B ran when only the result channel was cancelled, and did
  not run when its pending work Future was cancelled as well.
- GRPO: 21 checks passed. On this environment, the raw equal-reward FP32
  calculation already returned zero. This did **not** reproduce the historical
  nonzero residual described in the article. Exact-equal correction, near-equal
  preservation, and the listed input checks passed.

实际结果在 `cpu-verification.json`：NumPy 20 项通过；取消示例两个受控
case 共 42 项检查，普通模式和 `-O` 一致；GRPO 21 项通过。
本机 GRPO 原式已经输出零，**没有复现文章中的历史非零残差**。
这些结果只覆盖脚本里的边界，不证明完整训练、远端取消或性能收益。

## Additional examples / 其余示例

The second record, `cpu-verification-more.json`, contains these checks from the
same Python 3.11.11/macOS arm64 CPU environment. The two tensor examples use
PyTorch 2.6.0 with one CPU thread. The Python deserialization example additionally
uses cloudpickle 3.1.1. The article's pytest blocks were checked with pytest 8.3.5;
the downloadable rejection-stage script needs only the standard library.

第二份记录 `cpu-verification-more.json` 包含下表结果。张量示例使用 PyTorch
2.6.0、CPU 单线程；反序列化使用 cloudpickle 3.1.1。正文 pytest 片段使用
pytest 8.3.5，下载版拒绝阶段脚本本身仅使用标准库。

| File / 文件 | Checks / 检查项 | Actual scope / 实际范围 |
|---|---:|---|
| `logits-to-keep-zero.py` | 22 | Tensor indexing/projection; no model / 张量选行和投影，无模型 |
| `causal-logprob-row-alignment.py` | 23 | Synthetic logits, masks and row mapping / 合成 logits、mask 与行映射 |
| `hybrid-cache-crop-state.py` | 20 | ToyCache integers/lists only / 仅玩具整数和列表状态 |
| `resume-first-mixed-batch.py` | 22 | Synthetic dictionaries; no checkpoint / 合成字典，无 checkpoint |
| `ray-arguments-before-bootstrap.py` | 17 | Local Python subprocesses; no Ray / 本地 Python 子进程，未启动 Ray |
| `judge-timing-in-rollout.py` | 23 | Synthetic interval arithmetic; no timing / 合成区间算术，非计时实测 |
| `test-rejection-stage.py` | 15 | Toy validation functions; no production suite / 合成校验函数，非生产套件 |
| `system-prompt-after-adapter.zip` | 16 | Pinned Pi transcript/text functions; no provider / 固定 Pi 文本函数，未调用 provider |

Run a Python example with `python <filename>.py`. Extract the Pi ZIP and run
`node system-prompt-after-adapter.mjs` inside its folder with Node.js 24 (tested:
24.14.0). The bundle includes unmodified upstream source files, their SHA256
manifest, and MIT license. It runs offline and does not call `buildParams`, a
model, or any HTTP service.

Python 示例用 `python <文件名>.py` 运行。Pi 示例需解压后用 Node.js 24
运行包内的 `.mjs`（实测 24.14.0）。两份上游源码与许可已包含在包内；
这些检查不等于原项目类型检查、真实模型分块一致性或服务性能验收。
