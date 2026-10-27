# 皮肤设置（dsh-glass-theme）

皮肤的偏好项全部住在 host 的 `settings` 服务里，命名空间 `ui-skin-glass-theme`（来自 `skin.json` 的
`wiring.id` 与 `cordis.patch.yml` 的 insert id，不是包名，也不是每个 fiber 的 entry hash）。
`src/host/settings.js` 的 `PREFS` 是唯一的声明处，`Config` 把它们投影成 schemastery 表单；
`registerSettings()` 用 `settings.configure({ auto: false })` 声明「这一页由皮肤自己画」，
所以 host 不会为这个条目再生成一个页面。

客户端通过 `ctx.get('configForms').get('ui-skin-glass-theme')` 拿到同一个条目：
`getSnapshot()` 读值，`subscribe(listener)` 跟随变更，`set(field, value)` / `unset(field)` 写入。
读的是 mirror，写的是 `settings.mutate`，版本冲突由 controller 自己重读修复。

## 两个键：`quickProviders` 与 `quickModels`

| 键 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `quickProviders` | `list`（provider id，最多 64 条，每条 128 字符，`drop: ['deepseek-official']`） | `[]` | 选择器第一层列出哪些**供应商**。空数组 = 不筛选，列出全部供应商。 |
| `quickModels` | `map`（provider id → model id 数组） | `{}` | 每个已固定供应商在第一层携带哪些**模型**。 |

两者是配套关系，分工固定：

- **`quickProviders` 决定「哪些供应商进第一层」**，`quickModels` 只决定「这个供应商的哪些模型进来」。
  一个供应商没有 `quickModels` 条目时，它的全部模型都进第一层 —— **没有条目 ≠ 空数组**。
  这条区分是「固定了供应商但还没挑过模型」与「挑过、然后全部取消」的区别：
  - 没条目 → 显示该供应商全部模型，包括以后目录里新增的；
  - 空数组 → 该供应商整体不进第一层（用户明确不要它的任何模型）。
- **为什么不是把 `provider\u0000model` 编进一个列表**：`quickProviders` 有 128 字符的
  `entryMax` 和 64 条的 `max`，编进去会吃掉这个预算，也会毁掉这个键「供应商列表」的含义，
  并且再也表达不了上面那条「没配置」的状态。
- **为什么不是每个供应商一个键**：`PREFS` 是静态表，动态键会让 schema 依赖目录，
  目录一变 schema 就得跟着变。
- **模型 id 只在供应商内唯一**：`deepseek-v4.1-flash` 同时存在于 DeepSeek Account 和
  workbuddy 下，所以选择键是 `(provider, model)` 这一对，map 的键正是那个 provider 部分。

`quickModels` 里指向已消失供应商的条目，会在皮肤设置页下一次写入时被剪掉。

## 浏览器镜像（localStorage）

选择器必须在首帧同步读到「上次的选择」，否则首帧会先画全部供应商再重排。所以皮肤在
localStorage 里保留一份投影，键 `dsh-glass-theme:quick-providers`：

```json
{ "providers": ["workbuddy"], "models": { "workbuddy": ["glm-5"] } }
```

规则（`src/client.js` 的适配器，`design.md` D1/D7）：

- **host 是事实源，镜像只是投影**：任何写入都先写 host，再写镜像，两者在同一次交互里更新。
- **开机时用 host 覆盖镜像**：镜像过期会自愈，最多错一帧，不会跨过一次 reload。
- **迁移只跑一次**：偏好为空而镜像是可解析的旧列表时，把旧列表写进偏好；偏好已有值时反过来
  用偏好覆盖镜像。不可解析的镜像内容直接丢弃，不会让页面渲染失败。
- **清除即回到声明默认**：`unset` 后偏好回到 `PREFS` 的默认值（`[]` / `{}`），镜像同时清空，
  选择器立刻跟随。

旧版镜像的格式是裸数组 `["workbuddy"]`（只有供应商），迁移时读成 `providers`，
`models` 留空 —— 也就是「供应商已固定、模型未挑选」，与旧版行为完全一致。

## 工作空间开关

`workspaceView`（`boolean`，默认 `true`）决定 工作空间 这个面板与它的侧栏图标是否注册。
关掉时皮肤销毁 `main` 与 `sidebar.panellist` 两个 slot 注册（不是用 CSS 藏起来），
host 侧的 `/dsh-glass-theme/ws/*` 路由不受影响，重新打开不需要重新登录。
如果关掉时正停在工作空间页，shell 会退回会话页，中间栏不会留白。

## 代码落点

| 文件 | 角色 |
| --- | --- |
| `src/host/settings.js` | `PREFS` 声明、`prefsField()` 的 `map` 分支、`settings.configure({ auto: false })` |
| `src/client.js` | 偏好适配器（唯一一份）、开机迁移、`inject` 里的 `configForms`、`workspaceView` 驱动 |
| `src/settings-section.js` | 设置页：工作空间开关 + 快捷供应商板 + 模型下钻 |
| `src/picker.js` | 读镜像、按 `(provider, model)` 过滤第一层 |
| `src/workspace.js` | `register()` 返回 `{start, stop}` |
| `tools/settings-page.mjs` | 设置页验收探针 |

## 相关文档

- [`WORKSPACE.md`](WORKSPACE.md) — 工作空间页本身（TAPD / 企微、host 路由、安全模型）。
- `openspec/changes/workspace-toggle-quick-models/` — 这次改动的提案、设计（D1–D7）与规格增量。
