# Blog CPU examples / 博客 CPU 示例

These independent scripts use synthetic inputs only. They do not load a model,
contact a service, or replay a training run. Each prints JSON and exits nonzero
if a check fails. The downloadable scripts use explicit checks that remain
active under `python -O`.

这三个独立脚本仅使用合成输入，不加载模型、不访问服务，也不重放训练。
每个脚本输出 JSON；检查失败时以非零状态退出。完整脚本使用显式检查，
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
