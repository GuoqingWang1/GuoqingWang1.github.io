# GitHub Pages

目标仓库：`GuoqingWang1/GuoqingWang1.github.io`。默认地址：<https://guoqingwang1.github.io>。

仅以本地 `site/` 为独立仓库根目录；`package.json`、`package-lock.json`、`src/` 和 `.github/` 位于仓库顶层。私下 `editorial/`、研究原件与工作区其他目录永不推送。本仓库的构建、CI 和发布均不依赖它们。

## 本地检查

使用 Node.js 24，在仓库根目录依次运行：

```sh
npm ci
npm run build
npm run verify
```

静态输出在 `dist/`。CI 在 push 和 pull request 时执行同样检查，不发布网站。

## 首次发布

1. 将已审阅的站点源码放入目标独立仓库，保留锁文件。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 审阅具体公开版并确认发布后，在 **Actions → Deploy GitHub Pages → Run workflow** 选择默认分支。工作流只接受目标仓库的默认分支；该工作流文件须已存在于默认分支。
4. 工作流重新构建并验证，只上传 `dist/`，随后通过 `github-pages` environment 部署。成功运行的 deployment 输出给出访问地址。

发布仅由 `workflow_dispatch` 手动触发；push 或 PR 不会触发发布。`pages: write` 与 `id-token: write` 仅授予部署 job；构建 job 只有仓库读取权限。并发组 `github-pages` 避免部署相互覆盖，已在执行的部署不会被新请求取消。本文与工作流本身不代表已创建仓库或已上线。

## 以后绑定域名

`guoqingwang.me` 目前仅为候选，未注册或绑定；仓库不预置 `CNAME`。确认拥有并选择域名后，再按 [GitHub 自定义域名说明](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) 配置 Pages 和 DNS，并确认 HTTPS 可用。

随后在 **Settings → Secrets and variables → Actions → Variables** 设置仓库变量 `SITE_URL` 为选定的完整 HTTPS 地址，再手动构建发布。未设置时使用默认 GitHub Pages 地址。`SITE_URL` 只控制构建中的站点 URL，不会注册域名、修改 DNS 或自动绑定 Pages。该用户主页仓库无需仓库名 `base` 前缀。

## 官方依据

2026-10-31 核对：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Astro GitHub Pages 指南](https://docs.astro.build/en/guides/deploy/github/)。这里显式运行 npm 命令，以便在上传前执行项目的 `verify`。

Action 使用当日官方 release 的明确版本：[checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[configure-pages v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0)、[upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)、[deploy-pages v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)。
