# 工作空间（lg-workspace）— 完成文档

> 侧边栏新增页面 · 集成 TAPD CLI 与企微 CLI 的 Apple 风格工作台
> 版本随 dsh-glass-theme 0.1.1 交付 · 本文为开发完成汇总

## 一句话

侧边栏多了一枚"工作空间"图标，点开后是一个回答"今天需要我做什么"的工作台：TAPD 待我处理的缺陷、我的需求/任务、企微待办、需要关注的事（高严重度或逾期）、企微文档搜索，以及从任意 TAPD case 一键选目录开新会话——TAPD 状态流转和转派处理人也在行内完成。

## 页面结构（自上而下）

| 区域 | 内容 |
| --- | --- |
| 头栏 | 标题 + 数据更新时间 |
| 工具栏 | 左侧常驻「TAPD 项目」玻璃胶囊：当前项目名 + 可搜索的项目列表（`tapd workspace list`，当前项打勾）；右侧两枚 CLI 状态徽标（绿点=已装且可调；黄点=未装）+ 手动刷新按钮 |
| 演示横幅 | 任一 CLI 缺失时出现：安装指引两列（tapd / wecom-cli），命令一键复制 |
| 今日聚焦 | 4 张计数卡：待我处理缺陷（红）、需求与任务、企微待办、需要关注（黄） |
| 分段标签 | 概览 / 缺陷 / 需求任务 / 企微文档 / 命令 —— 游标滑板（弹簧动画）在标签间移动 |
| 概览 | "需要关注" 条目列表（高严重度或逾期，左侧 2px 警示缘）+ 今日待办合并列表 |
| 缺陷 | `tapd bug todo` 待我处理缺陷，按严重度（致命→严重→其他）排序，已关闭项过滤 |
| 需求任务 | `tapd story todo` + `tapd task todo` 合并，按截止时间排序 |
| 企微文档 | 关键词搜索 → `wecom doc search --json {"keywords":[...],"limit":10}`，结果行可打开 |
| 命令 | 两选一直通台（tapd / wecom-cli）：任意白名单子命令 + 参数，等宽输出块，回显 exit code / 耗时 / stderr；完成后自动刷新数据 |

行内操作（缺陷与需求行）：

- **流转** — 玻璃对话框先跑 `tapd workflow status-map --system=<story|bug> --workitem-type-id=<id>`（工作项类型 id 用 `tapd workitem-type list` 解析），点选目标状态后执行 `<type> update <id> --status <code>`；任务没有状态机，直接用 CLI 自带的 `open/progressing/done`。失败时在对话框内展示错误并提示改用命令页。
- **转派** — 输入新处理人，执行 `<type> update <id> --owner <owner>`（id 是位置参数，CLI 1.0 没有 `--id`）。
- **在此开会话** — `uiWorkspace.pickDirectory()` 选目录 → `workspaces.create({path})` → `uiWorkspace.startSession(workspaceId)`；失败（服务缺失/取消）行内提示，不打断页面。
- **打开** — TAPD 条目链接由本插件拼装为 `https://www.tapd.cn/tapd_fe/<workspace>/<bug|story|task>/detail/<id>`（`tapd url` 能解析回来）；文档行打开企微文档 URL。

## 安全模型（host 半，src/host/workspace.js）

客户端从不 spawn 任何进程。全部执行走本插件自己的 host 路由，与包内其他变更路由同一条防线：

- **围栏**：loopback peer + Host 头一致性 + `sec-fetch-site: same-origin` + Origin 校验（有 `connection.requestRejection` 服务时优先委托）。
- **白名单**：仅接受 `cli: 'tapd' | 'wecom'`；首个非 flag 参数必须落在该 CLI 的子命令白名单内（tapd: workspace/story/task/bug/wiki/iteration/workflow/workitem-type/url/auth/version/help/config/me；wecom: message/mail/doc/sheet/smartsheet/smartpage/calendar/meeting/todo/disk/contact/media/identity/auth/version/help）——路由无法被当作任意执行器。
- **无 shell**：`spawn(path, argv, { shell: false, windowsHide: true })`，元字符天然惰性；Windows 下先用 `where.exe` 解析真实路径（含 npm 的 .cmd shim）。
- **限额**：args ≤ 40 条、单条 ≤ 4096 字符、禁 NUL；超时 1–120s（默认 25s）；stdout/stderr 各 2MB 截断；请求体 ≤ 256KB。
- **进程树击杀**：超限/超时用 `taskkill /T /F`（Windows）避免孤儿子进程。

路由：

```
GET  /dsh-glass-theme/ws/status   → { ok, clis: { tapd: {command, available, detail, credentialsHint, installHint}, wecom: {...} } }
POST /dsh-glass-theme/ws/run      body { cli, args, timeoutMs? }
                                  → { ok, exitCode, timedOut, durationMs, stdout: {json, value}, stderr }
POST /dsh-glass-theme/ws/install  body { cli }
                                  → { ok, cli, command, durationMs, log: string[], clis: {…} }
```

`stdout` 会尝试 JSON.parse——两个 CLI 都输出紧凑 JSON，因此结果以结构化数据进入客户端。

命令解析优先级：环境变量 `DSH_GLASS_TAPD_CMD` / `DSH_GLASS_WECOM_CMD` > 插件配置键 `tapdCommand` / `wecomCommand`（设置页 Liquid Glass 分区文本框）> 托管安装状态文件 `~/.dsh/dsh-glass-theme-ws.json`（一键安装 tapd 后记录的绝对路径）> 默认 `tapd` / `wecom-cli`。注意代码**不读** `ctx.config`——Cordis 对未 inject 的服务属性访问直接抛 `cannot get property "config" without inject`，可选链也拦不住 getter 抛错；插件配置以 `apply(ctx, config)` 第二参进入。

## 一键安装（0.2.1 起）

CLI 缺失时的演示横幅里，每一列都有主按钮「一键安装」，安装全过程在 host 侧完成，请求体只有 `{cli}`——没有任何用户输入能到达命令行：

- **wecom**：解析 `npm`（`where.exe` 含 .cmd shim）→ `npm install -g @wecom/cli`，超时 5 分钟，末尾日志回传。
- **tapd**：`api.github.com`（被限流则退回 `/releases/latest` 302 Location）解析最新 tag → 按 OS/arch 拼 `tapd_<ver>_<os>_<arch>.zip|tar.gz` → 下载（≤60MB 合理性检查）→ 与 Releases `checksums.txt` 的 sha256 比对 → 解压到 `~/.dsh/bin/tapd/<version>/`（Windows 用 System32 bsdtar）→ 定位 `tapd(.exe)` → 绝对路径写入状态文件并清空解析/探测缓存。

成功后面板立即用返回的 `clis` 报告刷新状态并重新拉取数据；认证仍需人工（tapd：`tapd auth login` 或 `TAPD_ACCESS_TOKEN`；wecom：`wecom-cli auth init`），成功提示里带对应指引。失败显示 host 回传的错误与日志尾行。`tools/ws-check.mjs` 覆盖 install 路由的拒绝面（未知 cli 400 / 缺 cli 400 / GET 405 / 非回环 403）与 `ctx.config` 抛错回归。

## 演示模式

任一 CLI 未安装时，该侧数据源切换为**明确标注的演示数据**（横幅常驻，说明这是演示 + 怎么装真 CLI），界面与真实数据完全同构，便于设计和验收。CLI 装好后点刷新即切回真实数据，无需改代码。

安装指引（也内置在横幅里，可一键复制）：

```sh
# tapd (studyzy/tapd-ai-cli) — 从 Releases 下载对应平台二进制
#   https://github.com/studyzy/tapd-ai-cli/releases
tapd auth login          # 或设置 TAPD_ACCESS_TOKEN；凭据存 ~/.tapd.json

# wecom-cli (官方)
npm i -g @wecom/cli
wecom-cli auth init      # 首次授权
```

## 视觉与动效（遵循 apple-design / apple-liquid-glass）

- **材料层次**：阅读面（卡片、列表）用实底 `--lg-surface-raised` + 0.5px 发丝线；只有浮起物（对话框）是真玻璃——`--lg-glass-3` + `blur(30px) saturate(190%)` + 三层阴影 + 顶缘高光。玻璃不叠玻璃。
- **分段标签**：单一游标滑板随选中项平移（`var(--lg-t-base) var(--lg-ease-spring)` 弹簧），文字只变色——"selection travels"。
- **列表**：iOS 分组列表语法——容器圆角卡 + 行 hover + 0.5px 分隔线；关注条目的警示是其左缘 2px 插入条，不是整行变红（状态≠故障）。
- **数字**：聚焦卡计数用 tabular-nums + -0.02em 字距；缺陷计数着 error 色、关注着 warn 色，卡片本身保持中性。
- **指针反馈**：按钮 pointer-down 即时 scale(0.96) 收缩；spinner 是页面唯一常动元素且仅在加载时出现。
- **三条无障碍线独立作答**：`prefers-reduced-motion`（滑板/对话框动画降为 1ms、按压反馈移除）、`prefers-reduced-transparency`（对话框改实底去 blur）、`prefers-contrast: more`（关键容器加 1px currentColor 内描边）。

## 代码落点

| 文件 | 角色 |
| --- | --- |
| `src/workspace.js` | 客户端模块（裸函数 `createWorkspace(require, ctx, catalog)`）：组件、状态机、演示数据、会话开启流程 |
| `src/css/workspace.css` | 页面样式（构建时第 14 张表，pages 之后 widgets 之前） |
| `src/host/workspace.js` | host 路由与 CLI 执行器（见安全模型） |
| `src/client.js` | `/*__WORKSPACE__*/null` 占位符 + apply 内独立 `ctx.effect` 注册块 |
| `src/host/index.js` | webServer 注入内追加 `registerWorkspaceRoutes(ctx, scope, config)` |
| `src/host/settings.js` | PREFS 新增 `tapdCommand` / `wecomCommand` 文本键 |
| `tools/build.mjs` | SHEETS 表 + `spliceFunction('workspace.js')` + `__WORKSPACE__` 替换 |
| `tools/ws-check.mjs` | host 路由冒烟测试（mock server，19 项断言，含 install 拒绝面与 ctx.config 抛错回归） |

注册方式与宿主 WSL 页面同一习语：`sidebar.panellist`（id `lg-workspace`，order 45）与 `main`（key 同名）配对，导航归 shell，模块只拥有两个组件。注册块各自包在 `ctx.effect` + try/catch 里——面板注册失败不会拖垮皮肤其余部分（smoke 测试恰好验证了这一点）。

## 验证记录（2026-10-23，0.2.3）

0.2.3 在 0.2.2 之上仅加 `AbortSignal.timeout` 特性检测（无该 API 的内核退化为无客户端截止，host 侧 300s 超时仍然兜底）与一次全面自检（包名链/加载链/渲染链/tarball 内容，见 README「自检」节）。

```sh
node tools/build.mjs        # 16 sheets, 483.9 KB；workspace.css 20.6 KB；host 17 模块
node tools/ws-check.mjs     # 21 项全过：status/run/install 拒绝面 + fence + 405 +
                            #   throwing ctx.config getter 回归 + installHint 存在
node tools/ws-render.mjs    # 5 项全过：Icon 渲染 / 守卫根为 WorkspaceErrorBoundary /
                            #   hooks 全流程二帧渲染 / 显式 onOpenCase 传递 /
                            #   status 命中且不可用 CLI 不触发 run
node tools/ws-package-check.mjs dsh-glass-theme-0.2.3.tgz
                            # 发布包内 package/lib/client.js：shorthand=0，显式=4
node tools/verify.mjs       # 1148 class 引用 0 未解析；47 属性钩子 0 未确认
node tools/css-check.mjs    # 全部表括号平衡（含 workspace.css）
node --check lib/client.js && node --check lib/host/workspace.js   # 语法通过
```

### 0.2.3 自检结论（包名 / 加载 / 渲染）

- **包名链一致**：`package.json name` = `lib/client.js` 内 `__ModuleLoader__.load({id})` = profile 依赖名，均为 `dsh-glass-theme`；`cordis.patch.yml` 插入行 id `ui-skin-glass-theme` 与 `skin.json wiring.id`、`bodyAttr data-dsh-glass-theme`（client `stamp()`）互相对应。目录名 `dsh-liquid-glass` 只是仓库目录，不参与解析。
- **profile 补丁层死条目已清除**：用户层 `cordis.patch.yml` 曾有 `- id: ui-skin-liquid-glass / disabled: false`（早期手动接线残留，指向不存在的行，被加载器忽略但不干净）；已删除，备份 `cordis.patch.yml.bak-cleanup-0.2.3`。
- **tarball 干净**：62 项 = LICENSE/README/patch/skin/docs/locale×2/package.json + lib（client、host×17、assets、fonts、2 json），无 src/tools/tgz 泄漏。
- **渲染链**：`main` 插槽注册的始终是 `GuardedPanel`（错误边界包裹），渲染异常显示错误卡而非黑屏；`tools/ws-render.mjs` 用 `RawPanel` 穿透边界直测。
- **环境注意**：profile 同时配置了 `dsh-claude-style` 皮肤（`ui-skin-claude-style`，brand claude/motion reduced）——两套皮肤 CSS 叠加属用户配置，非本包缺陷；如需纯净玻璃观感可停用其一。

## 渲染守卫（0.2.2 新增）

主区插槽对占用者组件没有全局错误边界——面板组件一旦在渲染期抛错，中央列就变成
空白黑屏（侧栏图标仍正常，因为它是另一个独立注册的条目）。0.2.2 起 `main` 插槽
注册的是 `GuardedPanel`：`WorkspaceErrorBoundary`（class 组件，`getDerivedStateFromError`
+ `componentDidCatch` 镜像到 console）包住 `WorkspacePanel`，渲染异常时显示
`.lgws-crashCard` 错误卡（异常名/消息/栈前 4 行），故障可见、可复制、可定位，
且绝不波及中央列其他区域。`tools/ws-render.mjs` 用 `RawPanel` 直测内层组件
（有序 hooks shim 穿不透边界包装），并断言守卫根确实是边界类。

## 部署（打包安装，0.2.1 起）

不再手工拷贝文件进 profile。标准流程：

```sh
# 1. 源码目录构建 + 全部检查
node tools/build.mjs && node tools/ws-check.mjs && node tools/verify.mjs

# 2. 打 tarball（package.json files 白名单：lib/locale/docs/cordis.patch.yml/skin.json）
npm pack --pack-destination .

# 3. 以包形式装入 profile（profile 里其他包有既有 peer 冲突，需 --legacy-peer-deps）
cd C:/Users/lenovo/.dsh/profiles/desktop
npm install "file:G:/dsh-build/plugin/dsh-liquid-glass/dsh-glass-theme-<版本>.tgz" \
  --legacy-peer-deps --no-package-lock --no-audit --no-fund
```

第 3 步会把 `node_modules/dsh-glass-theme/` 整目录替换为 tarball 的干净提取物，并把 profile `package.json` 的依赖指向新 tgz。**只有 host 半变更时才需要完全退出并重启 DSH**（host 半只在启动时装配）；仅 client 半变更（如 0.2.1→0.2.2 的渲染守卫）刷新页面即可生效。

## 启用步骤

1. **完全退出并重新打开 DSH**——host 半（新路由）只在启动时装配。
2. 刷新页面即可看到侧边栏新图标（客户端半随页面加载）。
3. 若两个 CLI 都还没装：演示横幅里点「一键安装」，装好后按提示在终端完成认证（tapd：`tapd auth login`；wecom：`wecom-cli auth init`），回到面板点刷新即切真实数据。

## 已知边界

- CLI 未认证时（如无 `~/.tapd.json`），状态徽标仍可能为绿（二进制在），具体命令会以 stderr/exit code 失败——命令页可看到原始输出，状态卡片的 credentialsHint 提示认证方式。
- TAPD workspace 未切换时，todo 类命令依赖当前工作区；必要时先用命令页 `tapd workspace switch <id>`。
- 一键安装 tapd 依赖 GitHub Releases 可达；离线时横幅仍提供「复制命令」手动路径（Releases 页 / npm）。
- 面板文案目前为中文硬编码（与 WSL 面板同例），未走 locale 服务；后续需要多语言时再迁移。

## 0.2.3 热修复：`ReferenceError: onOpenCase is not defined`

**症状**：打开工作空间面板即抛 `ReferenceError: onOpenCase is not defined`，栈顶在 `WorkspacePanel`（bundle 内 `lib/client.js` 的 4 个列表 `map` 处），面板整块渲染失败。

**根因**：`WorkRow` 的 prop 名为 `onOpenCase`，父组件作用域里的回调名是 `openCase`。父组件构造 props 时若写裸 shorthand `onOpenCase,`，对象字面量求值会去当前作用域找名为 `onOpenCase` 的绑定——它不存在，于是在渲染阶段直接抛错（不是 `WorkRow` 内部调用出错）。

修复是 4 处列表 `map` 全部写成显式映射（`src/workspace.js` 里四个 `WorkRow` 调用点）：

```js
h(WorkRow, {
  item,
  live: live.tapd,
  // ...
  onOpenCase: openCase,   // 不能写成裸 shorthand `onOpenCase,`
  // ...
})
```

**为什么改了源码还会报错**：这个错误出现在**已安装的发布包**里，而不是当前工作区源码。排查顺序应为「源码 → `lib/client.js` → tarball → profile `node_modules` → 浏览器实际加载的 bundle」，逐层比对：

```sh
node tools/ws-render.mjs                                  # 源码层：shorthand=0、显式=4
node tools/ws-package-check.mjs dsh-glass-theme-0.2.3.tgz  # 发布层：tarball 内 package/lib/client.js
node -e "const s=require('fs').readFileSync('C:/Users/lenovo/.dsh/profiles/desktop/node_modules/dsh-glass-theme/lib/client.js','utf8');console.log((s.match(/^\s+onOpenCase,\s*$/gm)||[]).length)"
```

三层任一出现 4 个裸 shorthand 就说明该层是陈旧产物：重新 `node tools/build.mjs` → `npm pack` → 替换 profile 里的包。只改源码或只改 `lib/client.js` 都不会影响运行时。

**验证**：`tools/ws-render.mjs` 已内置该回归断言（shorthand 必须为 0、显式映射必须为 4）；`tools/ws-package-check.mjs` 把同一断言施加到 tarball 上，避免「源码已修、发包仍是旧代码」。

**生效方式**：client 半变更只需刷新页面；若浏览器仍加载旧 bundle（DSH 的插件 revision 由入口 `mtimeMs`/`ctimeMs`/size 派生），完全退出并重启 DSH 即可让新 revision 生效。覆盖 `node_modules` 目录时注意保留/刷新文件时间戳，避免 revision 未变导致缓存不失效。

## 0.2.4：CLI 登录（安装后自动开始）

CLI 装好只是「二进制在」，认证是另一件事。0.2.4 把认证也做进面板：

- `probeCli` 返回 `auth: { state, detail, method }`：
  - wecom 跑 `wecom-cli auth show --status`，输出 `authorized` / `unauthorized`，其它归为 `unknown`；
  - tapd 没有 status 子命令，按「`TAPD_ACCESS_TOKEN` 环境变量 → `~/.tapd.json` 凭据文件 → 缺失」三档判断；
  - CLI 不存在时 `state: 'unavailable'`。
- 三条新路由（与 status 同样受 loopback + POST 栅栏保护）：
  - `POST /dsh-glass-theme/ws/login` — `{cli, token?}`；wecom 启动后台 `auth init --noninteractive --output-qrcode <tmp>/wecom-login.png`（5 分钟上限，重复调用不启第二个进程），tapd 无 token 时回 `needsToken: true`，有 token 时跑 `tapd auth login --access-token <token>`（10s 超时，日志脱敏）。
  - `GET /dsh-glass-theme/ws/login-state?cli=` — wecom 运行中 `running`（带 `qr`），进程退出后由 `auth show --status` 决定 `authorized` / `unauthorized`。
  - `GET /dsh-glass-theme/ws/login-qr?cli=wecom` — 直接返回 PNG（`no-store`）。
- 面板行为：已安装但 `auth.state === 'unauthorized'` 时，头部胶囊出现「未登录」，并在 demo 区块下方出现登录条；**自动**触发一次登录（安装成功后同样立刻触发）。tapd 只能给 token，所以自动那一次只把光标送进密码框；wecom 则显示 180px 二维码并每 2 秒轮询，扫码成功即刷新数据、6 秒后自动收起。

排查顺序与安装问题一致：源码 → `node tools/ws-check.mjs`（51 条）→ `lib/` → tarball → profile `node_modules`。`tools/ws-check.mjs` 里的登录用例不依赖真实 CLI：QR 用写死的 8 字节 PNG 签名，spawn 失败用不存在的可执行文件，因此 CI/离线也能跑。

**0.2.5 补充：拿不到数据时不要把 CLI 的 JSON 甩给用户。** `tapd` 未认证时命令会以 `{"error":"authentication_required", …}` 失败，但探针可能仍报 `available`。面板现在把这类失败（`authentication_required` / `No valid credentials` / `TAPD_ACCESS_TOKEN` 等）识别成「未登录」而不是「拉取失败」：`load()` 会就地把 `clis.<cli>.auth.state` 置为 `unauthorized`（于是登录条与自动登录接管），区块里原本的裸错误文本替换成一行 `lgws-authInline`（「TAPD 尚未登录 + 登录按钮」）。真正的网络/命令错误仍走 `lgws-error` 原样展示。

## 0.2.6：两种 TAPD 凭据 + npm 垫片直跑

**凭据（回答「Access Token 怎么获取」）**：TAPD 给两种凭据，面板现在都收。

| 凭据 | 从哪来 | 有效期 | 面板用法 |
| --- | --- | --- | --- |
| Access Token | TAPD 开放平台 OAuth 用户态：用应用 `client_id`/`client_secret` 拼授权 URL，用户点「下一步」后回跳带 `code`，再 `POST https://api.tapd.cn/tokens/request_token` 换 `access_token` | 2 小时（`expires_in: 7200`） | 填进「Access Token」，走 `tapd auth login --access-token` |
| API 账号 + 口令 | 公司管理员在 TAPD「公司管理 → 开放集成 / 开放平台」新建后可见 `api_user` / `api_password`（企业版商业模块，常见 90 天试用） | 长期 | 填进「API 账号 / API 口令」，走 `tapd auth login --api-user … --api-password …` |

`POST /ws/login` 的 body 因此接受 `{cli:'tapd', token}` 或 `{cli:'tapd', apiUser, apiPassword}`；两者都缺才回 `needsToken`。日志脱敏覆盖 token 与口令两个字段。

**垫片不再经过 cmd.exe**：`wecom-cli` 是 npm 全局安装的 `.cmd` 垫片，之前走 `cmd.exe /c` 回退，任何含 `"`、`%`、换行的参数都会以 `argument cannot be passed safely through the cmd.exe fallback` 失败（搜文档时关键词带「%」或引号就会踩到）。现在 `nodeShimEntry()` 解析垫片模板里的 `%dp0%\node_modules\…\cli.js`，改用 `process.execPath` 直跑 JS 入口，参数作为 argv 原样传递，`shell: false` 不变。只有解析不到 JS 入口的垫片才回退 cmd.exe，且报错文案改成中文可执行建议。

回归：`tools/ws-check.mjs` 新增 4 条（垫片解析、含 `%`/引号参数原样到达子进程、无 JS 入口时给出可读报错）与 2 条凭据用例；现在共 57 条。

## 0.2.7：TAPD 工作区（项目）引导

**先回答「这个 CLI 能不能直接登录」**：不能。`studyzy/tapd-ai-cli` 没有任何交互式/浏览器/扫码登录 —— `internal/cmd/auth.go` 的 `runLogin` 只认 `--access-token` 或 `--api-user` + `--api-password`，缺了直接以 `missing_parameter` 退出；`root.go` 的 `PersistentPreRunE` 对其它命令缺凭据时以 `authentication_required` 退出。凭据只来自 CLI flag > `TAPD_*` 环境变量 > `./.tapd.json` > `~/.tapd.json`（`internal/config/config.go`）。面板本来就用这个 CLI（`TAPD_REPO = "studyzy/tapd-ai-cli"`，一键安装从 GitHub Releases 取官方二进制），所以这里不存在「换一个 CLI」，只是把它的两种凭据都接上（0.2.6）。

**0.2.7 补的是凭据之后的第二步**：`tapd` 的列表命令还要求 `workspace_id`（公司架构里叫「项目」），缺了会以 `workspace_required` 失败 —— 面板此前只看到凭据就显示「已登录」，于是每次都「拉取失败」。

- `tapdAuthReport()` 现在同时读 `~/.tapd.json` 的 `access_token` / `api_user` + `api_password` / `workspace_id`（`TAPD_ACCESS_TOKEN`、`TAPD_WORKSPACE_ID` 优先），并在 `auth.workspace` 里给出 `configured` / `missing`。
- 登录成功后宿主立刻跑一次 `tapd workspace list`：只有一个项目就自动 `tapd workspace switch <id>`（`runResolved` 的 cwd 是家目录，而 `workspace switch` 写 `./.tapd.json`，正好落到 `~/.tapd.json`）；有多个就把列表回给面板。
- 面板侧：凭据齐全但 `auth.workspace.state === 'missing'` 时，登录条**不消失**，原地换成项目下拉框（`.lgws-wsSelect`），选中即 `POST /ws/login {cli:'tapd', workspaceId}` 切换并刷新。`POST /ws/login {cli:'tapd', action:'list-workspaces'}` 用于主动拉列表。

回归：`tools/ws-check.mjs` 现 60 条（新增 workspace list 的降级路径、`switch` 分支接线、`auth.workspace` 状态三条；`switch` 用例刻意不跑真实 CLI，避免测试把 `workspace_id` 写进用户的 `~/.tapd.json`），`tools/ws-render.mjs` 新增 1 条（登录条在缺 workspace 时保持可见）。

## 0.2.8：文档搜索不再把 JSON 塞进命令行 + 企微报错原样透传

**症状**：企微文档搜索一直报「argument cannot be passed safely through the cmd.exe fallback」（0.2.6 起中文文案为「无法把参数 … 安全传给 wecom-cli.cmd」）。原因有两层：

1. 面板调 `wecom-cli doc search` 时用的是 `--json '{"keywords":["周报"],"limit":10}'` —— 这个参数本身带引号。只要垫片解析不到 JS 入口、退回 `cmd.exe`，引号就会在 cmd 解析里被打散，于是被守卫拒绝。
2. 即便垫片正常，`--json` 也把用户输入当成了「命令里的引号」，任何一次垫片形态变化都会重新踩坑。

修法：

- 面板改用 `doc search --keywords <词…> --limit 10`（`src/workspace.js` 的 `searchDocs`），argv 里不再出现引号；`%` 只有在真的退回 cmd.exe 时才会被拒，而正常 npm 垫片永远不会退回。
- `nodeShimEntry()`（`src/host/workspace.js`）多一层兜底：标准 npm 模板（`%dp0%` / `%~dp0%` / 引号路径）之外，再扫一遍垫片里所有 `.js`/`.cjs`/`.mjs` 片段，去掉 `$basedir`、`%VAR%`、`.\` 前缀后按垫片目录解析，覆盖 pnpm / scoop / 厂商安装器写的垫片。
- `/ws/run` 的 500 响应新增 `resolved`（宿主实际解析到的可执行文件），客户端 `attempt()` 把它拼进报错文本尾部（`（命令：…）`）。以后再遇到垫片问题，面板上的报错本身就带证据，不用开控制台。
- 两个 CLI 都用「退出码 0 + JSON 信封」表示“请求被拒”：`{ errcode, errmsg, help_message }`。新增 `cliFailureHint()` 把 `errcode ≠ 0` 的信封翻成人话（`help_message` 优先，markdown 链接拍平成「文字 URL」，`\n` 还原成换行），文档搜索不再因为 `asList()` 拿不到数组就显示「没有命中」。

**实测（本机 2026-10-23）**：`wecom-cli doc search --keywords 周报 100%覆盖 --limit 3` 通过 `process.execPath` 直跑 `@wecom/cli/bin/wecom.js`（垫片解析成功，`shell:false`，参数原样到达），返回 `errcode 851008`：`当前机器人未被授权「搜索与获取文档内容」能力`。也就是说这条链路本身已经通，剩下的失败是**企微侧机器人缺少文档能力授权**，面板现在会把这句话连同官方申请链接一起显示出来。

回归：`node tools/ws-check.mjs`（60 条，含「无 JS 入口的垫片拒绝不安全参数」仍要求中文可读文案）、`node tools/ws-render.mjs`、`node tools/verify.mjs`、`node tools/css-check.mjs`、`node tools/ws-package-check.mjs dsh-glass-theme-0.2.8.tgz` 全绿。

## 0.2.9：`workspace_required` 不再当“拉取失败”显示

**症状**：配好 Access Token 后，缺陷页直接显示
`缺陷列表拉取失败：{"error":"workspace_required","message":"No workspace ID configured","hint":"Run 'tapd workspace switch <id>' …"}`。

原因：0.2.7 只在 `/ws/status` 的 `auth.workspace.state === 'missing'` 时才把登录条变成项目选择器，而列表错误走的是另一条路径——`load()` 把 CLI 的 JSON 信封原样塞进 `data.errors.bugs`，`authFailure()` 又只认凭据失败，于是「没选项目」被当成「接口坏了」。

修法（`src/workspace.js`）：

- 新增 `WORKSPACE_FAILURE_PATTERN`（`workspace_required` / `No workspace ID configured` / `--workspace-id` / `workspace switch`）与 `workspaceFailure()`。
- `load()` 一旦从任一 TAPD 列表错误里认出它，就把 `clis.tapd.auth.workspace` 补成 `{ state: 'missing', id: '' }` —— 登录条立刻变成项目选择器，并自动触发 `POST /ws/login {action:'list-workspaces'}`（只有一个项目时宿主自己 `workspace switch`）。
- 缺陷页在该状态下显示「TAPD 项目未选择：先在上方选择一个项目」，不再回显 JSON 信封；`data.workspaceBlocked.tapd` 供其它分区复用。

回归：`tools/ws-render.mjs` 新增「workspace_required 变成选择器而不是裸 JSON」四条静态断言（模式、`load()` 的提升、渲染守卫、可读文案）。实测本机 `tapd workspace list` 返回 20+ 个项目（`31112774 山东_烟台欣和_MobileMaster` 等），选择器按返回顺序列出。

## 0.3.0：没登录时直接给「创建 Access Token」的入口

TAPD 的 token 只能由用户本人在 `https://www.tapd.cn/personal_settings/index?tab=personal_token` 生成，之前的登录条只写了「Token 从开放平台换取」——用户得自己猜去哪点。

- 登录条里新增 `.lgws-authLink` 按钮：**「去 TAPD「个人设置 → 个人令牌」创建 Access Token ↗」**，点击即用系统浏览器打开令牌页（`window.open` 在桌面壳里常常是空操作，所以交给宿主开）。
- 点「登录」时如果 token 与 API 账号/口令都为空，**不再发一个注定失败的请求**：直接打开令牌页，并在行内给出「已打开…创建后粘贴到左边输入框」的提示（`phase: 'needsToken'`），同时把焦点交给 token 输入框。
- 新宿主路由 `POST /dsh-glass-theme/ws/open-url`（`src/host/workspace.js`）：只接受 https + 白名单主机（`www.tapd.cn` / `tapd.cn` / `open.tapd.cn` / `open.weixin.qq.com` / `work.weixin.qq.com`），拒绝 http、相对地址、内嵌凭据、file:，以及 `www.tapd.cn.evil.example.com` 这类后缀欺骗；启动方式为 `spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url])`（不经 cmd.exe，因此没有引号/元字符问题；macOS/Linux 用 `open` / `xdg-open`）。
- 客户端 `openExternal()` 先打这条路由，路由不可用（旧宿主半）时回退 `window.open`。

回归：`tools/ws-check.mjs` 新增 8 条（令牌页放行 + 7 类拒绝 + 路由 400）；`tools/ws-render.mjs` 新增「未登录的 tapd 行给出令牌页入口」5 条断言（页面地址、`open-url` 客户端调用、按钮类名、空凭据时改开页面、`needsToken` 提示）。

## 0.3.1：项目下拉框展开后，选项在暗色主题里看不见

**症状**：`tapd workspace list` 明明返回了十几个项目，点开 `.lgws-wsSelect` 却只看到一块白底、上面一排几乎看不见的浅灰文字；只有悬停/占位行（蓝底）能读。列表数据没有问题，是**弹层配色**的问题。

原因有两层，都出在这个控件上：

- `.lgws-wsSelect` 的 `background: var(--dsw-alias-bg-l2)` 引用了一个**不存在的 token**（皮肤里只有 `--dsw-alias-bg-l1`，没有 `-l2`），规则整条失效，控件实际是透明的；`color` 却照常继承了暗色主题的浅色文字。
- Chromium 画 `<select>` 的展开列表时，**弹层底色直接取 `<select>` 自己的 background**，透明就原样当透明画（`internal_popup_menu.cc`），不会回退到主题色；行内文字沿用浅色 → 白底浅字。`color-scheme: dark` 解决不了这件事，它只管复选框/滚动条/日期选择器。

修法（`src/css/workspace.css`）：

- 控件改成不透明的 `background-color: var(--dsw-alias-bg-layer-1)`，弹层底色随之变深。
- 补 `.lgws-wsSelect option { background-color: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary) }` —— Chromium 对每个 option 自己的 background/color 是认的，这是真正把行「上墨」的那条规则，换到任何主题/平台都不再靠宿主弹层的默认色。

回归：`node tools/assert-built.mjs` 断言新规则进了打包产物；实测暗色主题下控件的计算背景从 `rgba(0,0,0,0)` 变成 `rgb(22,26,34)`，option 同样不透明（`node tools/wsselect-probe.mjs` 现场探针，透明即失败）。

## 0.3.2：TAPD 行内操作与命令页对齐 CLI 1.0 的真实命令行

**症状**（用户原话「tapd 相关的所有功能都有问题」）：面板能出数据，但每一处会**执行命令**的功能都失败——

- 流转对话框打开后状态格子是 0 个，弹窗里只有后端原始 JSON `{"error":"missing_parameter","message":"--system and --workitem-type-id are required"}`。
- 转派点「确认转派」必失败（`--id` 不被识别）。
- 每行都没有「打开」按钮；需求行的状态显示成 `status_3 Middle`。
- 命令页无法用 `tapd --version` 探活，`workitem-type` 更是被白名单挡住。

根因是插件按旧版 CLI 的命令面写的，而本机装的是 `tapd` 1.0.0（studyzy/tapd-ai-cli）：

| 旧写法（插件） | 1.0.0 的真实命令行 |
| --- | --- |
| `workflow status-map <type>` | `workflow status-map --system=<story\|bug> --workitem-type-id=<id>` |
| `<type> update --id X --status Y` | `<type> update <id> --status <code>`（`--id` 不存在） |
| `<type> update --id X --owner Y` | `<type> update <id> --owner <name>` |
| `tapd todo` | 没有这个子命令（`bug/story/task todo` 才是） |
| `tapd --version` | 子命令 `version` 静默退出 1；`-v/--version` 才是探活 |
| 深链 `https://www.tapd.com/<id>` | `https://www.tapd.cn/tapd_fe/<ws>/<kind>/detail/<id>` |

改动：

- **客户端**（`src/workspace.js`）：新增 `tapdWorkitemTypeId()`（`workitem-type list` 取工作项类型 id，按 `entity_type` 匹配，缺省取第一条）、`tapdStatusMap()`（缺陷/需求走 `--system/--workitem-type-id`；任务用 `open/progressing/done`）、`tapdSuccess()`（`success:false` 也算失败）、`tapdItemUrl()`（拼深链）；`WorkRow` 收到 `statusLabel`，需求行不再显示 `status_3`；删掉死代码 `tapd todo` 及其 `todoItems`（每次都打一条 400，UI 还完全静默）。
- **宿主**（`src/host/workspace.js`）：白名单补 `workitem-type`；`validateRun` 允许 `--version/--help` 这类**单独的长 flag**（同时仍拒绝未知 flag）；`switchTapdWorkspace()` 切换后回读 `workspace info` 校验，失败自动切回原项目——CLI 对不存在的 id 会假报 `success:true` 并把它写进 `~/.tapd.json`，之后所有调用都 403。

还有一处更隐蔽的：`runResolved()` 之前用 `spawn` 的默认 stdio，子进程拿到一个**永远没人写入、也没人关闭的 stdin 管道**。`tapd bug update` / `story update` 这类写命令会读 stdin，于是卡到 25 s 超时才被杀掉，返回空 stdout、空 stderr —— 界面上就是「退出码 1」四个字。实测同一个命令：stdin 给 `ignore` 时 0.5 s 成功返回，给管道时永不返回。修法是把子进程的 stdin 显式设为 `ignore`（`stdio: ["ignore", "pipe", "pipe"]`）。

- 顺带一处显示/回写脏数据：TAPD 的处理人字段是 `叶凯佳;刘运辉2;` 这种尾随分号的写法，之前原样进了行内 meta，也原样预填进转派输入框——提交时就把 `叶凯佳;` 写回 TAPD。映射层新增 `normOwner()`，统一拆成英文逗号分隔、去掉空项。

- 切换项目现在要“验证后再相信”：CLI 对任何 id 都回 `{"success":true,"workspace_id":…}` 并写进 `~/.tapd.json`，之后所有命令都报 `Personal token company does not match workspace`。所以 `switchTapdWorkspace()` 切完用 `workspace info` 读回 id，不一致就切回原项目。写这段时漏了超时常量 `TAPD_LOGIN_STATUS_TIMEOUT_MS` 的声明，`ReferenceError` 被解析守卫吞掉，`landed` 永远是空串——于是每次切换都报"未成功"。已补声明，`tools/ws-check.mjs` 14c 用假 CLI 覆盖「切成功」和「切了没落地」两条路径。

- 今日聚焦的四张卡是 `<button>`，但 `onClick` 是空的——四块大的、带 hover 的按钮点了没反应。现在每张卡都跳到对应页签（待我处理缺陷→缺陷、需求与任务→需求任务、企微待办→企微文档、需要关注→概览）。第一版把 `setTab` 直接写进卡片 helper，可那个 helper 定义在组件外面，`setTab` 是组件内 state——每次点击都抛 `ReferenceError: setTab is not defined`，页面照旧不动；改成由调用方把 setter 传进来。`tools/ws-render.mjs` 新增检查，卡片的 `onClick` 必须用传入的 `onSelect`。

回归：`tools/ws-check.mjs` 覆盖「单独 `--help` 放行」「未知 flag 仍拒」「workitem-type 可跑」，并用一个「必须等到 stdin 结束才回话」的假 CLI 断言子进程 stdin 是关闭的（3 s 内必须拿到结果）；`tools/ws-render.mjs` 覆盖流转对话框真实参数（`--system`、`--workitem-type-id`、位置 id 的 `update`）与 `statusLabel` 渲染；`tools/ws-package-check.mjs <tgz>` 校验打包产物内含新规则。

- 企微文档搜索的失败原因被吞成「退出码 1」：`wecom-cli doc search` 拒绝请求时把 `{errcode:851008, errmsg, help_message}` 打在 **stdout** 上、退出码 1，而宿主会把 stdout 解析成对象放进 `run.stdout.value`；`attempt()` 只按「字符串是否为空」判断有没有输出，于是对象被当成空输出，`cliFailureHint()` 根本没机会跑。现在 `attempt()` 在退出码非 0 时先用**已解析的值**取 `errcode` 提示（tapd 的 `{error, message}` 仍按值返回，好让登录/项目选择逻辑继续识别），拿不到提示才回落到 stderr / 退出码。实测搜「周报」现在直接显示「当前机器人未被授权『搜索与获取文档内容』能力，需向管理员申请使用」＋申请链接——这是企微账号侧的权限，不是插件能修的，但至少要让人看懂。

- 「命令」页签遇到静默失败只显示「（无输出，退出码 1，198ms）」：现在补上实际命令（`命令行：tapd bug show --id 5501001`），并对 tapd 提醒「1.0.0 对参数错误不打印任何东西（SilenceErrors），空输出只说明写法不被接受：用 `tapd <子命令> --help` 看真实参数」。

- 登录条自己的标题写死成「需要登录」：项目还没选时它下面是「选择 TAPD 项目…」下拉框，登录刚成功时它下面是「已登录」——两种都不需要登录。现在标题跟着行状态走（有项目缺失→「选择 TAPD 项目」，全部已授权→「已连接」，其余→「需要登录」）；并且 `authorized` 不再让整块常驻，登录成功、项目选好之后横幅自己消失，数据直接出现在下面。实测：空配置→「需要登录」+3 个输入框；填 Token→按钮变「用 Token 登录」；登录后→标题变「选择 TAPD 项目」；选项目→横幅消失、9 张缺陷卡与 6 行列表就位、`~/.tapd.json` 里 token 与 `workspace_id` 都在。

- **转派会把两个人写成一个名字**（本次审计里唯一真的写坏了数据的一处）：行内 meta 为了好看把 TAPD 的 `甲;乙` 规整成 `甲, 乙`，而转派输入框预填的就是这个规整后的字符串；用户不改直接点「确认转派」，CLI 收到的 `--owner "甲, 乙"` 被 TAPD 当成**一个人**的名字写回去。实测 bug `1145368483001012673` 的 `current_owner` 从 `刘运辉2;叶凯佳` 变成了 `刘运辉2, 叶凯佳`（已用 `tapd bug update <id> --owner "刘运辉2;叶凯佳"` 改回）。修法：映射层同时保留 `ownerRaw`（TAPD 原文）给写路径，输入框预填 `ownerRaw`，提交时先把用户输入里的逗号/分号统一拆开、再按 TAPD 的 `;` 拼回去。`tools/ws-render.mjs` 断言 `ownerRaw` 必须存在、预填必须用 `ownerRaw`、提交必须 `join(';')`。

**注意**：0.3.2 同时改了宿主半（`lib/host/workspace.js`），升级后必须**完全退出并重开 DSH Desktop**；只刷新页面只会更新客户端半。

## 0.3.3：工作空间页重绘（液态玻璃）与常驻项目切换器

症状：项目选好之后，页面上再也找不到切换项目的入口。

根因不是样式，是结构：项目下拉框一直住在登录横幅里，而 0.3.2 为了让登录完成后横幅收起来，把 `authorized` 从 `authRowVisible()` 里去掉了。于是「配置好项目」这个动作恰好让横幅——连同里面唯一的 `<select>`——一起消失。用户第一次想换项目时，控件已经不在了。

改法：把切换器搬进工具栏，变成常驻控件。

- **项目胶囊**（`.lgws-projectButton`）：`TAPD 项目` 小标签 + 当前项目名 + 折叠箭头，玻璃材质，永远在工具栏左侧。
- **项目菜单**（`.lgws-projectMenu`）：点开是玻璃浮层，含搜索框（项目名或 ID）、项目列表（当前项打勾 + `.lgws-projectItemOn`）、`共 N 个项目 · 切换后重新拉取` 的脚注；Esc 与点击外部都关闭。
- 列表来源是 `tapd workspace list`（走 run 路由），不是登录引导接口——`tapdWorkspaceAssist()` 一旦发现已配置项目就故意返回空列表（它只负责「第一次选项目」），所以切换器必须自己拉全量。切换后重新跑 `workspace info` 校验、失败回滚（0.3.2 的逻辑），页面数据全部重拉。

重绘（Apple 液态玻璃的三层结构）：

1. **面板层**：`.lgws-page` 不滚、不透，承载所有内容。
2. **环境光层**：`.lgws-ambient` 是一块静态柔光（两团 radial 渐变），`filter: blur(52px) saturate(1.5)`，`aria-hidden`，不随内容滚动。
3. **控件层**：只有「仪器」用玻璃——项目胶囊、项目菜单、四张计数卡、对话框；毛玻璃 = `backdrop-filter: blur() saturate()` + 半透明填充 + 顶部 0.5px 高光 + 0.5px hairline。列表行、输入框、搜索框一律不透明：密排文字上做磨砂只会降低可读性。

其它细节：

- 圆角同心：菜单 22px、菜单项 14px（`inner = outer − padding`）。
- 按压反馈 `:active` 进入 0ms、退出按缓动；浮层出现用 `lgws-menu-in`（190ms，`cubic-bezier(0.2,0.8,0.2,1)`，位移 -6px + 缩放 .985）。
- 页签滑板只移动、不交叉淡出（`translateX` 由实测 `offsetLeft/offsetWidth` 驱动）。
- 遮罩不再让背景「保持清晰」：`rgba(8,10,16,0.52)` + `blur(6px) saturate(120%)`，让焦点落在对话框上；流转弹窗补了「点击状态即写入 TAPD」的提示和「取消」按钮——一触即写的网格如果没有说明，看起来就像 hover。
- 深色主题必须挂在 `body[data-ds-dark-theme]` 上（应用的主题切换只改这个属性，不看 `prefers-color-scheme`），浅色卡片的玻璃填充是 `rgba(255,255,255,0.7)`。
- 三个偏好都有答案：`prefers-reduced-transparency: reduce` → 全部换 `--lg-glass-solid`、去掉 backdrop-filter、隐藏环境光；`prefers-contrast: more` → 不透明填充 + 1.5px 边框；`prefers-reduced-motion: reduce` → 去掉位移/缩放动画，仅保留放慢的 spinner。

部署：0.3.3 只改客户端半（宿主 `lib/host/workspace.js` 与 0.3.2 语义一致），**刷新页面（Ctrl+R）即生效**，不需要重启应用。

回归：`tools/ws-render.mjs` 新增「切换器在工具栏而不是登录横幅」与「Esc/点击外部关闭菜单」两条源码级断言；`tools/ws-check.mjs` 全部通过；`tools/verify.mjs` 1148 个 class 引用 0 未解析；`tools/ws-package-check.mjs dsh-glass-theme-0.3.3.tgz` 通过。

## 0.3.4：工作空间改成「工作台」——项目空间侧栏 + 页内详情

症状：0.3.3 的页面能完成任务，但读起来是一张长表。项目切换器藏在工具栏里、四个计数只是数字、点「查看详情」会把用户扔到浏览器。用户要的是**一天的工作台**：我在哪个项目、今天要处理什么、点开一条就地在页内读完。

原型先行：先用一个独立 HTML（`.preview/workspace-prototype.html`，走真实 TAPD 数据）把版式、动效、项目切换与页内详情跑通，确认手感后再逐块移植进插件——移植时类名统一加 `lgwsp-` 前缀，与 0.3.3 的 `lgws-*` 并存，避免一改就波及旧样式。

版式（三栏，玻璃只做结构不做阅读面）：

- **项目空间 rail**（`.lgwsp-space-rail`）：228px 玻璃列，列出 token 能访问的全部 TAPD 项目（`tapd workspace list`，不是登录引导接口），首字母色块 + 项目名 + ID + 选中勾；点一下即 `chooseTapdWorkspace(id)` 换项目并重拉。窄屏整列隐藏，切换交给工具栏胶囊。
- **主区**（`.lgwsp-workspace-main`）：`今天需要我做什么` + 当前项目空间胶囊 + 四张 focus 卡（待我处理缺陷 / 需求与任务 / 企微待办 / 需要关注，点卡片即换页签）+ 分段控件（概览 / 缺陷 / 需求与任务 / 企微协作 / 执行 CLI，滑板由实测 `offsetLeft/offsetWidth` 驱动）+ 列表。列表行是整行按钮：`BUG`/`REQ` 色块 + 标题 + ID + 状态 chip + 到期/逾期，右侧处理人与「查看详情」。
- **详情 inspector**：页内第三栏，`tapd://…` 伪地址栏（`.lgwsp-embedded-frame`）里放类型、标题、ID、chips、描述、四格字段、最近动态与动作（流转状态 / 转派 / 在此开会话 / 浏览器打开 / 复制 ID / 返回列表）。**不再跳浏览器**：只有显式点「浏览器打开」才会外跳。

宽度策略（这一轮修的最大的版式问题）：应用自身侧栏 + 项目 rail 已占约 470px，再切 340px 给详情，任何 1440 屏都会被压成三行标题、竖排的「TAPD 已连接」。所以：

- `≥1560px`：详情作为第三列真正参与 grid，`grid-template-columns: 228px minmax(0,1fr) minmax(338px,416px)`。
- `901–1559px`：详情**浮层化**——`position:absolute; inset-block:0; right:0; width:min(420px,82%)`，主区保持可读行宽，并压一层 12% 遮罩。注意这条规则必须带 `min-width:901px`：否则它的高特异性选择器会盖掉 900px 断点里的底部抽屉。
- `≤900px`：详情变底部抽屉（88dvh、26px 顶角、遮罩可点关闭）；rail 隐藏；行保留「查看详情」，只把处理人藏起来。

细节修正（都是原型里踩到、移植时才发现的问题）：

- **描述是 HTML**：TAPD 的 `description` 带 `<p>`、`<img>`、实体，直接渲染会在页内详情里打出标签和碎图片路径。新增 `plainText()`：`<br>`/块级闭合转换行、去标签、解实体、折叠空行。
- **同一条不出现两次**：概览的「今日待办」用 `attentionKeys` 排除已进「需要关注」的条目（否则一条逾期需求在屏上重复两次）。
- **优先级要读得懂**：TAPD 写 `prompt`/`middle`，`priorityLabel()` 译成 紧急/高/中/低。
- **次按钮要真的是次按钮**：动作按钮此前写的是 `lgwsp-detail-action secondary`，而样式表等的是 `.lgwsp-secondary`，六个按钮全被染成主色；改名后主次分明，并且 `white-space:nowrap` + 组内换行，避免「流转状态」被挤成两行。
- **计数文案**：列表右上角曾是「1 项目项」，改为「1 项」。
- **测试钩子**：分段页签与 focus 卡带 `data-tab-id`、刷新按钮带 `data-sync-bugs`、顶栏重载按钮 `#refreshButton`——截图与端到端脚本靠它们进状态，不靠猜类名。

刷新缺陷列表：`refreshBugs()` 只重跑 `tapd bug list`，按下即进骨架（`aria-busy`、`.lgwsp-skeleton-row`、按钮转圈禁用），成功后合并 `data.bugs`、更新「上次同步」并弹 `已同步 N 项缺陷` 的 toast；切换项目时 `bugSyncSeq++` 让在途同步作废，不会把旧项目的缺陷写进新项目。

部署：仍只改客户端半，**刷新页面即生效**（宿主 `src/host/workspace.js` 未动）。profile 里装的是 tarball，所以改了源码必须走 `node tools/build.mjs` → `npm pack` → `npm install file:…tgz` 这条链——只改 `src/` 或只改 `lib/client.js` 都不会影响正在跑的界面。

回归：`tools/ws-render.mjs` 新增 4 条（数据钩子、`plainText`/`priorityLabel`、概览去重、次按钮类名），共 17 条全绿；`tools/ws-check.mjs`、`tools/verify.mjs`（1148 个 class 引用 0 未解析）、`tools/css-check.mjs` 全绿；新增 `tools/ws-live-shots.mjs` 在真实 GUI 上按序截出概览/缺陷/刷新/详情/深色/窄屏/窄屏详情七态，`tools/ws-live.mjs` 供单点探针使用。

## 0.3.5：待办列表不再被 CLI 的默认十条截断

症状：网页上「我的工作」里一个项目分组有 13 条缺陷，工作空间的缺陷页签只列出 10 条，且界面没有任何「还有更多」的提示——像是账号里就这 10 条。

根因在 CLI 不在面板：tapd-ai-cli 1.0 的 `tapd bug todo` / `story todo` / `task todo` 都是 `--limit` 默认 10（`tapd bug todo --help`：`--limit int 返回数量限制 (default 10)`）。面板此前调用裸命令 `attempt('tapd', ['bug', 'todo'])`，拿到 CLI 默认的第一页就当作全部。

修法：新增 `todoAll(cli, kind, timeoutMs)`：

- 首页用 `--limit 100 --page 1`；首页短于 100 条即原样返回那份 envelope——`load()` 里登录态与项目缺失检测（`AUTH_FAILURE_PATTERN` / `WORKSPACE_FAILURE_PATTERN` 检查 `result.error`）看到的东西和以前完全一致。
- 满页才继续翻页（`TODO_MAX_PAGES = 10` 只用来兜住无视 `--page` 的服务端），按 `id` 去重后合并进首页 envelope 的 `items`；第 2 页起失败即停、保留已到的部分，不把半份待办变成报错。
- 三处调用点全部换过去：`load()` 的 `bug`/`story`/`task` 与 `refreshBugs()` 的 `bug`。页大小取 100 而不是 1000，避免 stdout 撞上 2 MB 截断。

回归：`tools/ws-render.mjs` 新增「a todo list never inherits the CLI default page size of ten」——禁止裸 `attempt('tapd', ['bug'|'story'|'task','todo'])`，要求三种待办都走 `todoAll`、`TODO_PAGE_SIZE = 100`、`--limit`/`--page` 仍在传、翻页有上限。

部署：只改客户端半（`src/host/workspace.js` 未动），走 `node tools/build.mjs` → `npm pack` → 装进 profile 后**刷新页面即生效**，不必重启应用。
