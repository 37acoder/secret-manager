# AHO-80 UX Copy Redesign Handoff

Date: 2026-07-07
Owner: 林岚 / Product Manager
Target engineer: 杨震原
Surface: `apps/web/app/page.tsx`
Basis: Product Design audit path, existing AHO-80 screenshot audit, and current web page implementation review.

## Design Goal

把 SecretManager Web MVP 从“解释型演示页”收敛成“可直接操作的安全工作台”：

- 同一信息只在一个主位置展示，其他位置只保留必要状态或入口。
- 专业术语通过 hover/focus 帮助解释，而不是堆在页面正文里。
- 页面文案默认中文，可保留中英双语标签或提供语言切换，但不能继续全英文。
- 不改变核心 MVP 范围：项目、保险库、密钥表、导入、导出、审计、锁定状态。

## Current UX Problems

### 1. 信息重复导致主任务不清晰

Current examples:

- `Vault locked/unlocked` 同时出现在顶部、侧边栏、Vault health、State 文案、锁定面板。
- 选中密钥在表格行和 `Selected secret` 面板里重复展示 `masked value`、`description`、`reveal/copy/rotate/delete`。
- `masked by default`、`demo-safe`、`screenshot-safe` 等安全说明散落在 toolbar、state copy、export 文案和 sidebar。

Design decision:

- 状态归一到 `Vault status bar`，作为唯一权威状态区。
- 表格保留列表比较和行级快捷操作；详情面板只展示版本历史和审计上下文，不重复表格已有字段。
- 安全原则放到 tooltip/help popover，不作为多段常驻说明。

Acceptance:

- 同一字段不得在同一视口重复展示超过一次，例外是状态 chip 可以在导航里用短状态词辅助定位。
- `Vault status` 的锁定状态、截图安全状态、可执行动作必须一致。
- 删除 `Selected secret` 中重复的 `Masked value` 和 `Description`，或改成只显示表格没有的信息，例如 `Version history` 和 `Last audit events`。

### 2. 专业术语缺少即时解释

Terms that need hover/focus help:

- Project / 项目：一组业务或应用的密钥空间。
- Vault / 保险库：同一环境下加密保存密钥的容器。
- Secret / 密钥：API key、数据库连接串等敏感值。
- Masked value / 脱敏值：默认隐藏真实值，只显示安全预览。
- Reveal / 显示明文：短暂查看真实值，会写入审计。
- Rotate / 轮换：更新密钥值并保留版本记录。
- Audit / 审计：记录谁在何时执行了复制、显示、导入、导出等操作。
- Trust state / 信任状态：演示用安全模式，用来模拟锁定、截图安全、存储异常等状态。
- Screenshot-safe / 截图安全：隐藏明文输出，适合截图、录屏、融资演示。

Interaction requirement:

- 桌面端使用 hover tooltip；键盘和移动端通过 focus/click 打开同一解释。
- Tooltip 内容使用短句，不超过 48 个中文字符或 90 个英文字符。
- Tooltip 必须有可访问名称，不能只依赖 `title` 属性。

Acceptance:

- 上述术语首次出现处都有帮助入口，例如 `?` 图标、info 图标或带下划线的术语。
- 鼠标 hover、键盘 focus、移动端点击都能看到解释。
- Playwright 或组件测试覆盖至少 3 个关键 tooltip：`Vault`、`Masked value`、`Trust state`。

### 3. 文案需要中文或中英双语

Recommended approach for MVP speed:

- 默认中文界面。
- 专业名词保留中英双语，例如 `保险库 Vault`、`审计 Audit`、`截图安全 Screenshot-safe`。
- 暂不做完整 i18n 框架，先把页面内文案集中成 `copy` 对象，为后续语言切换留接口。

Primary copy map:

- `SecretManager` 保留品牌名。
- `Demo-safe workbench` -> `演示安全工作台`
- `Projects` -> `项目 Projects`
- `Vaults` -> `保险库 Vaults`
- `Vault workbench` -> `保险库工作台`
- `Masked by default` -> `默认脱敏`
- `Secrets` -> `密钥 Secrets`
- `Add secret` -> `新增密钥`
- `Import .env` -> `导入 .env`
- `Export` -> `导出`
- `Vault health` -> `保险库状态`
- `Selected secret` -> `当前密钥`
- `Recent audit` -> `最近审计`
- `Reveal` -> `显示明文`
- `Copy` -> `复制`
- `Rotate` -> `轮换`
- `Delete` -> `删除`
- `Reset demo` -> `重置演示数据`
- `Unlock vault` -> `解锁保险库`
- `Lock vault` -> `锁定保险库`
- `Screenshot-safe` -> `截图安全`
- `Plaintext .env export` -> `明文 .env 导出`
- `Encrypted backup` -> `加密备份`

Acceptance:

- 首屏主要导航、按钮、状态、空态、弹窗、导入导出流程均为中文或中英双语。
- 不出现中英文混杂但无规则的句子。
- 所有错误、成功提示和锁定说明同步更新为中文。
- 如果实现语言切换，切换控件应放在顶部状态区，不新增大面积说明文本。

## Recommended Layout Changes

### Desktop

1. Sidebar:
   - 保留项目/保险库导航。
   - 每个 vault 只显示 `环境 + 密钥数量 + locked/unlocked` 的短状态。
   - 不在 sidebar 展开安全解释。

2. Top status bar:
   - 合并顶部 session 文案和 `Vault health`。
   - 显示：当前项目、当前保险库、锁定状态、截图安全状态、重置演示。
   - `Trust state` 改成 `演示状态` 下拉，并加 tooltip 说明它是演示模拟器，不是真实生产配置。

3. Secret table:
   - 保留最常用列：`密钥名`、`环境`、`脱敏值`、`更新时间`、`操作`。
   - `Metadata/Description` 默认移到详情或 hover，不占主表列。
   - 行操作保留：复制、显示明文、轮换、删除。

4. Detail/audit rail:
   - `Selected secret` 改成 `版本与审计`。
   - 只展示表格没有的信息：版本历史、最近审计、当前选择。
   - 不重复 `masked value`、`description` 和相同行操作按钮。

### Mobile

1. 第一屏先显示 `保险库状态 + 下一步主操作`。
2. 项目/保险库导航折叠为 `切换项目/保险库` 控件，不占据首屏大段空间。
3. 表格在移动端改成密钥卡片，每张卡只显示密钥名、脱敏值、状态和更多操作。

Acceptance:

- 390 x 844 首屏能看到当前状态和一个明确主操作。
- 移动端不需要先读完整 sidebar 才知道下一步。
- 操作按钮不因中文变长而换行挤压到不可读。

## Engineering Checklist

- Add reusable `HelpTerm` or `InfoTooltip` component with hover/focus/click support.
- Centralize page copy into a typed object before replacing labels.
- Remove duplicate selected-secret fields and actions from the detail panel.
- Rename `Vault health` to a clearer status bar and consolidate trust/lock copy.
- Add Chinese/bilingual labels across all visible states.
- Update tests for tooltip visibility, Chinese labels, and no duplicated selected-secret masked value.
- Run focused web checks at desktop and mobile viewport.

## QA Checks After Implementation

1. Desktop first screen: no obvious duplicate vault status blocks.
2. Hover/focus `保险库 Vault`, `脱敏值 Masked value`, `演示状态 Trust state`: explanations appear and dismiss correctly.
3. Table selected row plus detail rail: masked value is not repeated in both places.
4. Import/export modals: all primary copy is Chinese or bilingual.
5. Locked state: only one authoritative lock status is shown, and all sensitive actions are disabled.
6. Mobile 390 x 844: first viewport shows vault status and next action before navigation details.
7. Keyboard tab order reaches tooltips and modal controls in a sensible order.

## Product Notes For 杨震原

优先级建议：

1. P1: 中文/双语文案集中化和主要页面替换。
2. P1: 信息去重，尤其是 `Vault health` 与 `Selected secret`。
3. P2: Tooltip/help term 组件和专业术语解释。
4. P2: 移动端信息架构优化。

这轮不要扩大到新的权限模型、团队协作、真实云部署或完整 i18n。目标是让当前 demo 更容易被第一次看到的人理解，并减少融资/推广演示时的解释成本。
