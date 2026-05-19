# AgentProxy 中文阶段开发进度追踪清单

- 文档类型：阶段任务清单 / 迭代追踪表
- 依据方案：`docs/agentproxy-development-plan.md`
- 当前方案版本：Draft v3
- 创建日期：2026-05-19
- 首版目标：以 OpenCode 作为第一个完整 Coding Agent runtime provider
- 维护规则：后续迭代以本文档为主要开发进度追踪清单，完成项必须有实现、测试、文档或验证记录支撑；每完成一个阶段任务后立即提交一次 commit

## 最新开发状态（2026-05-19）

### 当前阶段

- 当前处于：Phase 2.4 日志与脱敏第一组已完成实现与验证；Gate 2 尚未通过，下一步进入 Phase 2.5 SQLite 存储。
- 当前启动基线：`161c02c 阶段进展：完成 Phase 2.4 日志与脱敏第一组最小闭环`。
- 最新阶段实现提交：`161c02c 阶段进展：完成 Phase 2.4 日志与脱敏第一组最小闭环`。
- Phase 0.2 / Phase 1 阶段提交：`e5eb0ce 阶段进展：完成 Phase 0.2 技术决策与 Phase 1 工程骨架`
- 当前主要进度来源：本文档和 `docs/agentproxy-development-plan.md`
- 当前代码状态：已初始化 TypeScript 工程骨架，并完成核心 contract 层、provider registry 最小闭环、配置解析层最小闭环和日志/脱敏第一组：稳定错误码、provider capability 默认化、metadata escape hatch、runtime/session/event 类型、`AgentProvider` 契约、provider 注册/lookup/list、capability probe、schema mismatch limited mode、OpenCodeProvider 占位实现、AgentProxy 默认配置、全局/项目/显式配置读取、env/CLI 覆盖、schema 校验、路径规范化、OpenCode 配置隔离、结构化 NDJSON logger、correlationId、标准日志字段、redaction、stdout/stderr 分离和 Commander parse error 脱敏。
- 当前工作区预期：本文档同步提交后应保持干净；下次启动必须先运行 `git status --short` 和 `git log -1 --oneline` 复核，若最新提交是文档同步提交，也应以 `161c02c` 作为最近阶段实现基线。

### 已完成

- [x] 明确产品定位：AgentProxy 是薄代理和控制面，不重新实现 Agent runtime。
- [x] 明确 v1 范围：只接入 OpenCode，未来再扩展 Claude Code、Codex 等 provider。
- [x] 完成主开发方案：`docs/agentproxy-development-plan.md`。
- [x] 完成中文阶段进度追踪清单：`docs/development-progress-tracker.zh.md`。
- [x] 完成任务管理规则：阶段门禁、验收标准、Definition of Done、Review 模板。
- [x] 完成长期经验记录：`tasks/lessons.md`。
- [x] 建立工作习惯：每完成一个阶段任务后主动提交一次详细中文 commit。
- [x] 完成 Phase 0.2 实施前技术决策，记录于 `docs/adr/0001-implementation-tooling.md`。
- [x] 完成 Phase 1 TypeScript 工程骨架、基础脚本和 CLI help/version 占位入口。
- [x] 完成 Phase 2.1 核心领域类型和稳定错误码，包含 mock provider contract 测试。
- [x] 完成 Phase 2.2 Provider Registry，包含内存注册表、lookup/list、OpenCodeProvider 占位、capability probe 和 schema mismatch limited mode。
- [x] 完成 Phase 2.3 配置系统第一组，包含默认配置、全局/项目/显式配置读取、env/CLI 覆盖、schema 校验、路径规范化和 OpenCode 配置隔离。
- [x] 完成 Phase 2.4 日志与脱敏第一组，包含结构化 logger、correlationId、标准日志字段、secret redaction、stdout/stderr 分离和 debug 显式启用。

### 未完成

- [ ] Phase 2.5 SQLite 存储尚未实现：初始化、migration、providers/runtimes/sessions/session_events 表、CRUD、备份机制。
- [ ] Gate 2 尚未通过：核心类型、Provider Registry、配置系统和日志已完成，但存储基础仍未完成。
- [ ] Phase 3：OpenCode runtime 生命周期尚未实现。
- [ ] Phase 4：OpenCodeProvider 核心能力尚未实现。
- [ ] Phase 5：CLI MVP 尚未实现。
- [ ] Phase 6：TUI MVP 尚未实现。
- [ ] Phase 7：安全、信任与可观测性尚未实现。
- [ ] Phase 8：测试与 CI 尚未落地。
- [ ] Phase 9：文档、打包与发布流程尚未完成。

### 下一步建议

下次启动后，应按以下顺序继续：

1. 先阅读 `tasks/lessons.md`，确认项目规则和长期习惯。
2. 阅读本文档，定位第一个未完成任务。
3. 从 Phase 2.5 SQLite 存储开始，先实现初始化、migration 和基础 CRUD；不要提前进入 OpenCode runtime 生命周期。
4. 复用 Phase 2.1 已建立的 `AgentProvider`、capability schema、metadata escape hatch 和稳定错误码。
5. 暂不实现 OpenCode runtime 生命周期，直到 Phase 3。
6. 完成阶段后运行验证命令，更新本文档，创建详细中文 commit。
7. 重启会话后先核对 `git status --short` 和 `git log -1 --oneline`，再继续当前阶段。

### 下次启动提示词

```text
请先阅读 /Users/zq/Desktop/ai-projs/posp/template/AgentProxy/tasks/lessons.md，
再阅读 /Users/zq/Desktop/ai-projs/posp/template/AgentProxy/docs/development-progress-tracker.zh.md
和 /Users/zq/Desktop/ai-projs/posp/template/AgentProxy/docs/agentproxy-development-plan.md。

当前项目状态是：Phase 0.2 实施前技术决策、Phase 1 TypeScript 工程骨架、Phase 2.1 核心领域类型和稳定错误码、Phase 2.2 Provider Registry、Phase 2.3 配置系统第一组、Phase 2.4 日志与脱敏第一组已完成并验证；最新阶段实现提交是 `161c02c 阶段进展：完成 Phase 2.4 日志与脱敏第一组最小闭环`。如果 `git log -1 --oneline` 显示的是后续文档同步提交，请继续以 `161c02c` 作为最近阶段实现基线。下一步从 Phase 2.5 SQLite 存储开始。
请先运行 `git status --short` 和 `git log -1 --oneline` 核对最新提交与工作区状态。

请严格按照 docs/development-progress-tracker.zh.md 继续迭代，从第一个未完成项开始：
Phase 2.5 SQLite 存储。第一组只推进 SQLite 库接入、数据库初始化、migration 版本表、providers/runtimes/sessions/session_events 表、基础 repository CRUD 和重复运行 migration 安全性；不要提前进入 OpenCode runtime 生命周期。

要求：
1. 不要重新规划已完成的架构方案，除非发现真实设计缺口。
2. 每次只选择一个小范围任务组推进。
3. 实现前确认依赖、验收标准和风险。
4. 完成后更新 docs/development-progress-tracker.zh.md 的勾选状态和 Review。
5. 如果产生可复用经验或用户纠正，更新 tasks/lessons.md。
6. 每完成一个阶段任务后，运行适用验证命令，并使用详细中文 commit 信息提交一次。
7. AgentProxy 必须保持薄代理和控制面定位，v1 只接入 OpenCode，不重写 Agent runtime。
8. 重启会话后先复习 `tasks/lessons.md`，并自动延续阶段提交习惯，不需要用户再次提醒。
9. Phase 2.4 已完成，不要回退或扩展它；Phase 2.5 不要实现 OpenCode runtime 生命周期、OpenCodeProvider 核心能力、CLI MVP 或 TUI，只建立 SQLite 存储最小闭环。
```

## 1. 使用规则

### 1.1 状态标记

- `[ ]`：未开始
- `[x]`：已完成且已验证
- 进行中的任务不直接勾选，在 Review 区记录当前阻塞、验证命令和剩余工作

### 1.2 勾选规则

任何任务不得仅因“代码写完”而勾选。任务完成必须满足：

- 实现已合入当前工作树
- 相关测试已补充或明确说明不需要测试
- CLI/TUI 行为已符合文档契约
- 错误码、日志脱敏、安全边界已覆盖
- 至少运行了适用的验证命令
- Review 区记录了验证结果
- 阶段任务完成后已创建对应 commit

### 1.3 迭代协议

- 每次迭代只选择一个小范围任务组。
- 开始实现前确认依赖、验收标准和风险。
- 发现设计缺口时，先更新主方案，再继续实现。
- 用户纠正或新增约束后，更新 `tasks/lessons.md`。
- 每个阶段结束前必须通过对应阶段门禁。
- 每完成一个阶段任务，立即提交一次详细中文 commit 信息。

## 2. 阶段门禁

- [x] Gate 0：产品定位已明确，AgentProxy 是薄代理和控制面，不是新 Agent runtime。
- [x] Gate 0：v1 范围已明确，首个 provider 只接入 OpenCode。
- [x] Gate 0：主开发方案已写入 `docs/agentproxy-development-plan.md`。
- [x] Gate 0：中文阶段开发进度追踪清单已写入本文档。
- [x] Gate 1：TypeScript 工程骨架已初始化，基础校验通过。
- [ ] Gate 2：核心类型、provider 契约、配置、日志、存储基础可用。
- [ ] Gate 3：OpenCode runtime 可启动、连接、诊断、停止，且生命周期安全。
- [ ] Gate 4：OpenCodeProvider 支持核心 session 和 message 工作流。
- [ ] Gate 5：CLI MVP 支持真实 run/resume/session/provider/runtime 工作流。
- [ ] Gate 6：TUI MVP 支持控制面操作，并可打开 OpenCode native TUI。
- [ ] Gate 7：安全、可观测性、debug bundle 和兼容性测试矩阵落地。
- [ ] Gate 8：文档、打包、发布和回滚流程满足 v1 发布要求。

## 3. Phase 0：需求、方案与决策

目标：冻结 v1 的产品边界、架构边界和实施约束，避免实现阶段反复返工。

### 3.1 已完成设计工作

- [x] 明确 AgentProxy 是 Coding Agent runtime 的代理层和控制面。
- [x] 明确 v1 只接入 OpenCode。
- [x] 明确未来扩展方向：Claude Code、Codex、ACP。
- [x] 明确非目标：不自研 planner、不重写 MCP、不实现模型 provider 层。
- [x] 明确 provider capability 模型。
- [x] 明确 OpenCode 接入优先级：SDK、OpenAPI/server、CLI fallback、stdout 解析仅兜底。
- [x] 明确 CLI 命令矩阵。
- [x] 明确 TUI 只做控制面和 native TUI launcher。
- [x] 明确 session 双 ID 模型。
- [x] 明确 event envelope 和统一事件模型。
- [x] 明确 SQLite schema 草案。
- [x] 明确 runtime 状态机。
- [x] 明确 source of truth、tombstone 和同步冲突处理规则。
- [x] 明确安全边界：workspace trust、日志脱敏、env allowlist、export sanitize。
- [x] 明确可观测性和 debug bundle。
- [x] 明确兼容性测试矩阵。
- [x] 明确发布、升级和回滚策略。

### 3.2 实施前决策

- [x] 确认包管理器，默认建议 `pnpm`。
- [x] 确认 Node.js 最低支持版本。
- [x] 确认 npm package name。
- [x] 确认 CLI binary 名称为 `agentproxy`。
- [x] 确认 CLI 框架。
- [x] 确认 TUI 技术栈。
- [x] 确认 SQLite 库。
- [x] 确认测试框架。
- [x] 确认 lint/format 工具。
- [x] 确认 v1 是否只通过 npm 发布。

验收标准：

- [x] 决策写入主方案或 ADR。
- [x] README 中能看到基础开发命令。
- [x] 本文档 Review 区记录决策结果。

## 4. Phase 1：工程骨架

目标：建立可持续开发的 TypeScript 工程基础。

### 4.1 仓库结构

- [x] 创建 `package.json`。
- [x] 创建 `tsconfig.json`。
- [x] 创建 `src/` 目录。
- [x] 创建 `src/cli/`。
- [x] 创建 `src/core/`。
- [x] 创建 `src/config/`。
- [x] 创建 `src/providers/`。
- [x] 创建 `src/providers/opencode/`。
- [x] 创建 `src/sessions/`。
- [x] 创建 `src/storage/`。
- [x] 创建 `src/logging/`。
- [x] 创建 `src/tui/`。
- [x] 创建 `tests/` 或约定测试目录。
- [x] 创建 `.gitignore`。

验收标准：

- [x] 目录结构与主方案一致。
- [x] 无无关生成物进入版本控制。

### 4.2 构建与开发脚本

- [x] 添加 `build` 脚本。
- [x] 添加 `dev` 脚本。
- [x] 添加 `typecheck` 脚本。
- [x] 添加 `test` 脚本。
- [x] 添加 `lint` 脚本。
- [x] 添加 `format` 或 `format:check` 脚本。
- [x] 添加本地运行 CLI 的脚本。

验收标准：

- [x] `pnpm build` 或等价命令可运行。
- [x] `pnpm typecheck` 或等价命令通过。
- [x] `pnpm test` 或等价命令通过。
- [x] `pnpm lint` 或等价命令通过。

### 4.3 CLI 占位入口

- [x] 实现 `agentproxy --help` 占位输出。
- [x] 实现 `agentproxy --version` 占位输出。
- [x] 保证 binary entry 可通过本地 dev 命令运行。

验收标准：

- [x] 本地可执行 `agentproxy --help`。
- [x] help 输出中列出后续核心命令。

## 5. Phase 2：核心契约、配置、日志与存储

目标：先建立稳定边界，再实现具体 provider 功能。

### 5.1 核心领域类型

- [x] 实现 `AgentProvider` 接口。
- [x] 实现 `ProviderCapabilities`，包含 `schemaVersion`。
- [x] 实现 `ProviderHealth`。
- [x] 实现 `RuntimeHandle`。
- [x] 实现 `AgentProxySession`。
- [x] 实现 `ProviderSession`。
- [x] 实现 `AgentEventEnvelope`。
- [x] 实现核心事件 union。
- [x] 实现稳定错误码。
- [x] 实现 provider metadata escape hatch。

验收标准：

- [x] 类型编译通过。
- [x] capability 缺失字段默认视为 unsupported。
- [x] provider 未知字段不会丢失。

### 5.2 Provider Registry

- [x] 实现 provider 注册机制。
- [x] 实现 provider lookup。
- [x] 实现 provider list。
- [x] 注册 OpenCodeProvider 占位实现。
- [x] 实现 capability probe 占位流程。
- [x] 实现 capability schema 不兼容时的 limited mode。

验收标准：

- [x] 未知 provider 返回 `PROVIDER_NOT_FOUND`。
- [x] schema 不兼容时不崩溃。
- [x] provider list 支持 JSON 输出所需数据结构。

### 5.3 配置系统

- [x] 实现内置默认配置。
- [x] 读取全局配置 `~/.config/agentproxy/config.json`。
- [x] 读取项目配置 `.agentproxy/config.json`。
- [x] 支持环境变量覆盖。
- [x] 支持 CLI flag 覆盖。
- [x] 实现配置 schema 校验。
- [x] 实现 `~` 展开和 workspace path 规范化。
- [x] 保持 AgentProxy 配置和 OpenCode 配置分离。

验收标准：

- [x] 配置优先级测试通过。
- [x] 无效配置映射到 `CONFIG_INVALID`。
- [x] 错误输出不泄漏 secret。

### 5.4 日志与脱敏

- [x] 实现结构化 logger。
- [x] 为每次操作生成 `correlationId`。
- [x] 日志字段包含 `providerId`、`runtimeId`、`sessionId`、`operation`。
- [x] 实现 token、secret、password、api key、authorization 等脱敏。
- [x] 确保 `--json` 输出不混入日志。
- [x] debug 日志必须显式启用。

验收标准：

- [x] env、config、args、error 的脱敏测试通过。
- [x] human output 和 JSON output 分离正确。

### 5.5 SQLite 存储

- [ ] 选择 SQLite 库。
- [ ] 实现数据库初始化。
- [ ] 实现 migration 版本表。
- [ ] 实现 providers 表。
- [ ] 实现 runtimes 表。
- [ ] 实现 sessions 表，包含 tombstone 字段。
- [ ] 实现 session_events 表。
- [ ] 实现 repository CRUD。
- [ ] 对破坏性 migration 增加备份机制。

验收标准：

- [ ] 新数据库 migration 通过。
- [ ] 重复运行 migration 安全。
- [ ] `(provider_id, provider_session_id)` 唯一约束有效。
- [ ] tombstone 记录不会被同步误删。

## 6. Phase 3：OpenCode Runtime 生命周期

目标：安全管理 OpenCode runtime，严格区分 managed 与 attached。

### 6.1 OpenCode Binary 探测

- [ ] 从配置或 `PATH` 定位 `opencode`。
- [ ] 执行版本检查。
- [ ] 规范化版本号。
- [ ] 检测 binary 缺失。
- [ ] 检测低于最低支持版本。
- [ ] 输出可执行的安装或升级建议。

验收标准：

- [ ] 缺失 OpenCode 映射到 `PROVIDER_UNAVAILABLE`。
- [ ] fake binary 测试覆盖版本解析。

### 6.2 Runtime Registry

- [ ] 持久化 managed runtime 元数据。
- [ ] 持久化 attached runtime 元数据。
- [ ] 记录 runtime 状态机状态。
- [ ] 记录 base URL、host、port、PID、workspace、mode 和时间戳。
- [ ] 实现 stale runtime cleanup。
- [ ] 实现 runtime list 查询。

验收标准：

- [ ] managed 和 attached 可明确区分。
- [ ] attached runtime 不会被 AgentProxy kill。
- [ ] stale metadata 不阻塞新 run。

### 6.3 Managed Runtime

- [ ] 以子进程启动 `opencode serve`。
- [ ] 默认绑定 `127.0.0.1`。
- [ ] 默认端口被非 OpenCode 进程占用时选择空闲端口。
- [ ] 等待 `/global/health`。
- [ ] 捕获启动失败和超时。
- [ ] 仅停止 AgentProxy 启动的 managed 进程。
- [ ] 子进程退出时更新 runtime 状态。

验收标准：

- [ ] managed runtime 可进入 `healthy`。
- [ ] 启动超时进入 `failed`。
- [ ] 正常停止进入 `stopped`。
- [ ] 端口冲突有测试覆盖。

### 6.4 Attached Runtime

- [ ] 支持显式 `--server-url`。
- [ ] 支持连接 registry 中健康的 OpenCode server。
- [ ] 尽可能验证目标 server 是 OpenCode。
- [ ] 不允许停止 attached runtime。
- [ ] 连接非 localhost server 时给出 warning。

验收标准：

- [ ] attached runtime health check 通过。
- [ ] stop attached runtime 只断开本地记录。
- [ ] 非 localhost attachment 有明确提示。

### 6.5 Event Stream

- [ ] 连接 OpenCode event stream。
- [ ] 将 provider 事件映射为 AgentProxy event envelope。
- [ ] 保留未知 raw event。
- [ ] 检测 stream interruption。
- [ ] interruption 后进入 `degraded`。
- [ ] 实现有限重连。
- [ ] 重连后用 session status 补偿状态。

验收标准：

- [ ] event stream 断开不会立即把 session 标记为 failed。
- [ ] unknown event 不被丢弃。
- [ ] fake server 测试覆盖重连。

## 7. Phase 4：OpenCodeProvider 核心能力

目标：把 OpenCode runtime 能力以 provider contract 暴露给 AgentProxy。

### 7.1 Health 与 Capability

- [ ] 实现 `healthCheck`。
- [ ] 实现 `getCapabilities`。
- [ ] 探测 server API 可用性。
- [ ] 探测 SDK 可用性。
- [ ] 探测 native TUI 控制能力。
- [ ] 探测 session/export/share 能力。
- [ ] 返回 OpenCode version。

验收标准：

- [ ] `providers inspect opencode --json` 返回 health 与 capabilities。
- [ ] runtime probe 可以覆盖静态假设。

### 7.2 Model 与 Provider 列表

- [ ] 实现 `listModels`。
- [ ] 将 OpenCode provider/model 数据映射为 `ModelRef`。
- [ ] 保留 provider-specific metadata。
- [ ] 处理未认证或无模型状态。

验收标准：

- [ ] provider 健康时可以列出模型。
- [ ] 未认证状态给出可执行诊断，不崩溃。

### 7.3 Session 同步

- [ ] 实现 `listSessions`。
- [ ] provider 有、本地没有时导入索引。
- [ ] 本地有、provider 没有时标记 `missing_in_provider`。
- [ ] 保留 tombstone。
- [ ] 默认按更新时间倒序。
- [ ] 支持 workspace 过滤。

验收标准：

- [ ] 同步遵循 source-of-truth 规则。
- [ ] tombstone session 不会被误导入。

### 7.4 Session 创建与恢复

- [ ] 实现 `startSession`。
- [ ] 实现 `resumeSession`。
- [ ] 生成 `agentproxySessionId`。
- [ ] 保存 `providerSessionId` 映射。
- [ ] 保存 workspace path。
- [ ] 保存 model selection。
- [ ] 支持 session 创建后发送 prompt。

验收标准：

- [ ] `run` 可创建并持久化 session 映射。
- [ ] `resume` 使用原始 provider id。
- [ ] workspace path 稳定且规范化。

### 7.5 Message 发送与事件映射

- [ ] 实现 `sendMessage`。
- [ ] 支持 positional prompt。
- [ ] 支持 stdin prompt。
- [ ] 返回 async event stream。
- [ ] 映射 message delta。
- [ ] 映射 tool start/finish。
- [ ] 映射 permission request。
- [ ] 映射 file/diff update。
- [ ] 标记 session completed 或 failed。

验收标准：

- [ ] fake server 下 headless run 可完成。
- [ ] permission request 不会自动 approve。
- [ ] session 状态被持久化。

### 7.6 Session 操作

- [ ] 实现 abort。
- [ ] 实现 delete。
- [ ] 实现 export。
- [ ] 实现 import。
- [ ] 实现 share。
- [ ] 实现 unshare。
- [ ] export 结果标记 `sanitized`。
- [ ] raw export 需要二次确认。

验收标准：

- [ ] destructive action 没有 `--yes` 时需要确认。
- [ ] export 结果标明 sanitize 状态。
- [ ] delete 写入本地 tombstone。

### 7.7 Provider Passthrough

- [ ] 实现 `provider exec`。
- [ ] `--` 后参数原样传给 provider。
- [ ] 保留 provider 原始退出码。
- [ ] 只注入 allowlist 环境变量。
- [ ] 诊断信息脱敏。
- [ ] 支持 workspace override。

验收标准：

- [ ] `agentproxy provider exec opencode -- --version` 可运行。
- [ ] 退出码与 provider 原始退出码一致。
- [ ] passthrough 不修改 AgentProxy 状态，日志除外。

## 8. Phase 5：CLI MVP

目标：提供稳定、脚本友好、错误可诊断的 CLI。

### 8.1 CLI 框架

- [ ] 选择 CLI parser。
- [ ] 实现全局 flags。
- [ ] 实现 help 输出。
- [ ] 实现 command routing。
- [ ] 实现稳定退出码。
- [ ] 实现 `--json` 输出。
- [ ] 实现 stdout/stderr 分工。

验收标准：

- [ ] 每个命令都有 help。
- [ ] JSON 模式 stdout 只输出合法 JSON。
- [ ] 退出码符合主方案表格。

### 8.2 Doctor

- [ ] 检查 Node.js 版本。
- [ ] 检查 AgentProxy 配置。
- [ ] 检查 SQLite 读写。
- [ ] 检查 OpenCode binary。
- [ ] 检查 OpenCode version。
- [ ] 检查 server health。
- [ ] 检查 provider list。
- [ ] 检查 MCP status。
- [ ] 检查 workspace Git 状态。
- [ ] 支持 `--json`。

验收标准：

- [ ] 缺失依赖给出下一步建议。
- [ ] JSON 输出包含所有检查项状态。
- [ ] doctor 输出不泄漏 secret。

### 8.3 Run 与 Chat

- [ ] 实现 `run [prompt]`。
- [ ] 支持 stdin prompt。
- [ ] 支持 `--model`。
- [ ] 支持 `--workspace`。
- [ ] 支持 `--provider`。
- [ ] 输出 session id。
- [ ] human 模式渲染 event stream。
- [ ] 实现 `chat` 作为 TUI 入口。

验收标准：

- [ ] managed runtime 下 `run` 可用。
- [ ] attached runtime 下 `run` 可用。
- [ ] `run --json` 返回机器可读结果。

### 8.4 Sessions 命令

- [ ] 实现 `sessions list`。
- [ ] 实现 `sessions show`。
- [ ] 实现 `sessions resume`。
- [ ] 实现 `sessions abort`。
- [ ] 实现 `sessions delete`。
- [ ] 实现 `sessions export`。
- [ ] 实现 `sessions import`。
- [ ] 实现 `sessions share`。
- [ ] 实现 `sessions unshare`。
- [ ] 支持适用命令的 `--json`。
- [ ] destructive 命令支持 `--yes`。

验收标准：

- [ ] 缺失 session id 时错误清晰。
- [ ] JSON 输出稳定。
- [ ] delete/export/share 遵循 provider capability。

### 8.5 Providers、Runtime 与 Config 命令

- [ ] 实现 `providers list`。
- [ ] 实现 `providers inspect`。
- [ ] 实现 `provider exec`。
- [ ] 实现 `runtime list`。
- [ ] 实现 `runtime stop`。
- [ ] 实现 `config get`。
- [ ] 实现 `config set`。

验收标准：

- [ ] 不支持的能力返回 `CAPABILITY_UNSUPPORTED`。
- [ ] runtime stop 正确区分 managed 与 attached。

## 9. Phase 6：TUI MVP

目标：实现控制面 TUI，不复制 OpenCode chat engine。

### 9.1 TUI 基础

- [ ] 选择 TUI 技术栈。
- [ ] 实现 app shell。
- [ ] 实现键盘处理。
- [ ] 实现页面路由。
- [ ] 实现 loading state。
- [ ] 实现 error state。
- [ ] 实现 limited mode 展示。
- [ ] 实现基础主题。

验收标准：

- [ ] `agentproxy chat` 可打开 TUI。
- [ ] `q`、`Esc`、`?`、`/`、`r`、`d`、`n`、`Enter` 行为符合方案。
- [ ] 窄终端下布局不破碎。

### 9.2 Dashboard

- [ ] 显示当前 workspace。
- [ ] 显示当前 provider。
- [ ] 显示 provider health。
- [ ] 显示 runtime status。
- [ ] 显示最近 sessions。
- [ ] 提供 run、resume、native TUI、doctor 快捷操作。

验收标准：

- [ ] provider 不可用时 Dashboard 仍可显示。
- [ ] health 错误提供下一步建议。

### 9.3 Sessions UI

- [ ] 显示 session 列表。
- [ ] 支持搜索。
- [ ] 支持按 workspace/status/provider 过滤。
- [ ] 显示 session detail。
- [ ] 支持 resume。
- [ ] 支持 export/share/delete。
- [ ] dangerous action 二次确认。
- [ ] 支持为指定 session 打开 OpenCode native TUI。

验收标准：

- [ ] tombstone/missing session 状态可区分。
- [ ] dangerous action 不会误触发。

### 9.4 Providers 与 Runtime UI

- [ ] 显示 provider capabilities。
- [ ] 显示 provider version。
- [ ] 显示认证和模型状态。
- [ ] 显示 runtime mode、URL、PID、status、workspace。
- [ ] 支持启动 managed runtime。
- [ ] 支持停止 managed runtime。
- [ ] 支持 detach attached runtime。

验收标准：

- [ ] TUI 不能 kill attached runtime。
- [ ] unsupported action 被禁用并显示原因。

### 9.5 Logs 与 Settings UI

- [ ] 显示脱敏 recent logs。
- [ ] 显示 last error detail。
- [ ] 提供 debug bundle 入口。
- [ ] 显示 AgentProxy config 摘要。
- [ ] 明确不编辑 provider secret。

验收标准：

- [ ] 日志不泄漏 secret。
- [ ] settings 清楚区分 AgentProxy 配置和 provider 配置。

## 10. Phase 7：安全、信任与可观测性

目标：避免代理层破坏 provider 的安全边界，并让问题可诊断。

### 10.1 Workspace Trust

- [ ] 实现 workspace trust store。
- [ ] 记录 real path。
- [ ] 记录 Git root。
- [ ] 未信任 workspace 只允许只读诊断。
- [ ] `run/resume/provider exec` 前要求确认 trust。
- [ ] CLI 支持 trust prompt。
- [ ] TUI 支持 trust prompt。

验收标准：

- [ ] 未信任 workspace 不能直接执行写操作。
- [ ] symlink path 被规范化。

### 10.2 Permission Flow

- [ ] 展示 provider permission request。
- [ ] 默认不自动 approve。
- [ ] 将用户选择传回 provider。
- [ ] 记录 permission decision，但不记录敏感 payload。
- [ ] 保留 provider 原生权限语义。

验收标准：

- [ ] CLI 能展示并处理 permission request。
- [ ] TUI 能展示并处理 permission request。
- [ ] 拒绝权限映射到 `PERMISSION_DENIED`。

### 10.3 Secret 与 Env

- [ ] 实现 env allowlist。
- [ ] 支持显式额外 env 配置。
- [ ] 对 config/env/args/errors 统一脱敏。
- [ ] 禁止 full env dump。
- [ ] 禁止复制 provider credential。

验收标准：

- [ ] 常见 secret pattern 测试通过。
- [ ] AgentProxy store 中没有 provider credential 原文。

### 10.4 Export 与 Debug Bundle

- [ ] export 默认建议 sanitize。
- [ ] raw export 必须二次确认。
- [ ] export 结果标记 `sanitized: true | false`。
- [ ] 实现 `debug bundle`。
- [ ] debug bundle 排除 transcript。
- [ ] debug bundle 排除 raw export。
- [ ] debug bundle 排除 credential。
- [ ] debug bundle 排除 full env。

验收标准：

- [ ] debug bundle 可生成。
- [ ] debug bundle 不包含 raw prompt 或 secret。

### 10.5 Observability

- [ ] 日志包含 `correlationId`。
- [ ] 日志包含 `providerId`。
- [ ] 日志包含 `runtimeId`。
- [ ] 日志包含 `sessionId`。
- [ ] 日志包含 `operation`。
- [ ] 日志包含 `durationMs`。
- [ ] `doctor --json` 可机器读取。

验收标准：

- [ ] 单次 CLI 操作可通过 correlationId 追踪。
- [ ] 诊断输出可用于 issue/report。

## 11. Phase 8：测试与 CI

目标：用自动化测试保护代理层与 OpenCode runtime 的兼容性。

### 11.1 Unit Tests

- [ ] 配置优先级测试。
- [ ] 配置校验测试。
- [ ] 日志脱敏测试。
- [ ] 错误映射测试。
- [ ] capability 默认值测试。
- [ ] path 规范化测试。
- [ ] source-of-truth 冲突测试。
- [ ] tombstone 行为测试。

验收标准：

- [ ] Unit tests 在 CI 中运行。
- [ ] 新增核心逻辑必须补测试。

### 11.2 Provider Contract Tests

- [ ] mock provider 满足 `AgentProvider`。
- [ ] OpenCodeProvider 满足 contract。
- [ ] unsupported capability 行为被测试。
- [ ] unknown metadata preservation 被测试。
- [ ] capability schema mismatch 被测试。

验收标准：

- [ ] contract tests 不依赖真实模型调用。

### 11.3 Fake OpenCode Integration

- [ ] 实现 fake OpenCode server。
- [ ] 实现 fake health endpoint。
- [ ] 实现 fake event stream。
- [ ] 实现 fake session endpoints。
- [ ] 实现 fake provider/model endpoint。
- [ ] 实现 stream interruption 场景。

验收标准：

- [ ] runtime manager integration tests 不依赖真实 OpenCode。
- [ ] event reconnect 行为有覆盖。

### 11.4 Real OpenCode Smoke Tests

- [ ] 增加 optional real OpenCode test group。
- [ ] 测试 `doctor`。
- [ ] 测试 managed runtime startup。
- [ ] 测试 attached runtime。
- [ ] 测试 provider inspect。
- [ ] 测试 passthrough version command。

验收标准：

- [ ] 本地可跳过真实 OpenCode 测试。
- [ ] nightly CI 可运行真实 provider smoke tests。

### 11.5 E2E Tests

- [ ] 测试 `agentproxy run`。
- [ ] 测试 `sessions list --json`。
- [ ] 测试 `sessions resume`。
- [ ] 测试 `runtime list`。
- [ ] 测试 `runtime stop`。
- [ ] 测试 `provider exec`。
- [ ] 如工具允许，增加 TUI smoke test。

验收标准：

- [ ] E2E 覆盖主用户路径。
- [ ] CI 失败时上传日志或 artifacts。

### 11.6 Compatibility Matrix

- [ ] 测试最低支持 Node.js LTS。
- [ ] 测试当前 Node.js LTS。
- [ ] 测试 macOS。
- [ ] 测试 Linux。
- [ ] 测试最低支持 OpenCode 版本。
- [ ] 测试最新稳定 OpenCode 版本。
- [ ] 增加 nightly capability probe report。

验收标准：

- [ ] release 前矩阵 smoke 必须通过，或有明确例外记录。

## 12. Phase 9：文档、打包与发布

目标：让 v1 可安装、可使用、可诊断、可回滚。

### 12.1 用户文档

- [ ] 安装指南。
- [ ] Quickstart。
- [ ] CLI 参考。
- [ ] TUI 参考。
- [ ] 配置参考。
- [ ] OpenCode provider 指南。
- [ ] 故障排查指南。
- [ ] 安全模型说明。

验收标准：

- [ ] 新用户可以按文档完成 `doctor` 和第一次 `run`。
- [ ] 文档明确 AgentProxy 不是 OpenCode 替代品。

### 12.2 开发者文档

- [ ] 架构概览。
- [ ] Provider contract 指南。
- [ ] Storage/migration 指南。
- [ ] Testing 指南。
- [ ] Release 指南。
- [ ] ADR index。

验收标准：

- [ ] 贡献者可以按文档实现新 provider。

### 12.3 Packaging

- [ ] 配置 npm package metadata。
- [ ] 配置 binary entry。
- [ ] 配置 build output。
- [ ] 限制 package files。
- [ ] 本地验证 package install。
- [ ] 验证 `pnpm dlx` 或等价路径。

验收标准：

- [ ] 安装后暴露 `agentproxy`。
- [ ] package 不包含不必要本地 artifacts。

### 12.4 Release Process

- [ ] 定义 semver policy。
- [ ] 定义支持的 Node.js 版本。
- [ ] 定义支持的 OpenCode 版本范围。
- [ ] 定义 SQLite schema version。
- [ ] 定义 capability schema version。
- [ ] 增加 changelog。
- [ ] 增加 release checklist。
- [ ] 增加 rollback procedure。

验收标准：

- [ ] release 可按文档复现。
- [ ] migration 失败可从备份回滚。

## 13. Phase 10：Post-v1 延后事项

这些任务不进入 v1，但应保留为后续路线。

- [ ] 评估 ACP 作为 provider 抽象层。
- [ ] 设计 Claude Code provider。
- [ ] 设计 Codex provider。
- [ ] 设计多 provider session search。
- [ ] 设计 provider benchmark 命令。
- [ ] 设计跨 provider policy layer。
- [ ] 评估 standalone binary 发布。
- [ ] 评估 Homebrew 发布。
- [ ] 评估远程控制台或团队协作能力。

## 14. 每轮迭代记录模板

每次开发迭代结束后，在本节追加记录。

```markdown
### YYYY-MM-DD：迭代标题

- 范围：
- 完成任务：
- 修改文件：
- 验证命令：
- 验证结果：
- 未解决风险：
- 下一步：
```

## 15. Definition of Done

单个任务完成必须满足：

- [ ] 代码已实现。
- [ ] 测试覆盖了主要行为。
- [ ] CLI/TUI 公共行为有文档或 help。
- [ ] 错误映射到稳定 AgentProxy error code。
- [ ] 相关日志已脱敏。
- [ ] `doctor` 或其他验证路径可证明行为有效。
- [ ] 适用的 lint/typecheck/test 已通过。
- [ ] 本文档对应任务已勾选。
- [ ] Review 中记录了验证命令和结果。

阶段完成必须满足：

- [ ] 阶段内所有必须任务完成。
- [ ] 阶段验收标准全部满足。
- [ ] 阶段风险已记录。
- [ ] 下一阶段依赖明确。

## 16. Review

- 2026-05-19：创建中文阶段开发进度追踪清单，后续迭代以本文档为主要进度跟踪依据。
- 2026-05-19：补充阶段完成即提交的迭代规则，后续每完成一个阶段任务都应主动创建 commit。
- 2026-05-19：补充最新开发状态、已完成/未完成摘要、下一步建议和下次启动提示词；当前实现尚未开始，下一步从 Phase 0.2 和 Phase 1 继续。
- 2026-05-19：完成 Phase 0.2 实施前技术决策，记录在 `docs/adr/0001-implementation-tooling.md`；决策为 `pnpm`、Node.js `>=22.0.0`、npm package `agentproxy`、binary `agentproxy`、Commander、Ink + React、`better-sqlite3`、Vitest、Biome、npm-only v1 发布。
- 2026-05-19：完成 Phase 1 TypeScript 工程骨架；新增 `package.json`、`tsconfig.json`、`biome.json`、`vitest.config.ts`、`src/` 模块目录、`tests/cli-help.test.ts`、`.gitignore`、`pnpm-lock.yaml`，并在 README 写入基础开发命令。验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`pnpm run agentproxy -- --help`、`pnpm run agentproxy -- --version`，结果均通过。未解决风险：Phase 2 尚未实现 provider contract、配置、日志和 SQLite；TUI/SQLite 只记录选型，未进入实现。
- 2026-05-19：同步最新开发状态到 `ecfd1bf` 后；明确最新提交、Phase 0.2 / Phase 1 阶段提交、当前已完成项、未完成 Phase 2-9，以及下次启动应从 Phase 2.1 核心领域类型和稳定错误码继续。
- 2026-05-19：完成 Phase 2.1 核心领域类型和稳定错误码；新增 `src/core/errors.ts`、`src/core/events.ts`、`src/core/metadata.ts`、`src/core/types.ts`、`src/providers/types.ts`、`src/providers/metadata.ts`、`src/sessions/types.ts` 和 `tests/core-domain-types.test.ts`，并更新 core/providers/sessions barrel exports。验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Provider Registry、配置系统、日志脱敏和 SQLite 存储仍未实现，Gate 2 仍未通过；下一步只推进 Phase 2.2 Provider Registry。
- 2026-05-19：完成 Phase 2.2 Provider Registry 第一组最小闭环；新增 `src/providers/registry.ts` 和 `tests/provider-registry.test.ts`，将 `src/providers/opencode/index.ts` 扩展为满足 `AgentProvider` 契约的 OpenCodeProvider 占位实现，并更新 provider barrel exports。实现范围包含内存 provider 注册、重复注册保护、lookup、JSON-ready list、capability probe、capability schema mismatch limited mode、capability probe 失败降级、默认 registry 注册 OpenCodeProvider；审查后补充 list 中暴露 provider 原始 capability schema version，并对 list metadata 做 JSON-safe 规整。验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Phase 2.3 配置系统、Phase 2.4 日志脱敏、Phase 2.5 SQLite 存储仍未实现，Gate 2 仍未通过；OpenCodeProvider 仍是占位，不启动 runtime、不调用 SDK/API/CLI。
- 2026-05-19：同步 Phase 2.2 后续开发状态；明确最新阶段实现提交为 `a35c4ef Phase 2.2：完成 Provider Registry 最小闭环`，已完成项包含 Phase 0.2、Phase 1、Phase 2.1、Phase 2.2，未完成项从 Phase 2.3 配置系统开始；更新下次启动提示词，要求以 Phase 2.3 配置系统为第一个未完成任务继续。
- 2026-05-19：完成 Phase 2.3 配置系统第一组最小闭环；新增 `src/config/defaults.ts`、`src/config/paths.ts`、`src/config/resolver.ts`、`src/config/types.ts` 和 `tests/config-resolver.test.ts`，并扩展 config barrel exports。实现范围包含 AgentProxy 内置默认配置、全局配置 `~/.config/agentproxy/config.json`、项目配置 `.agentproxy/config.json`、显式 `--config` 文件、环境变量覆盖、CLI flag 覆盖、手写 schema 校验、`CONFIG_INVALID` 错误映射、`~` 展开、workspace path 规范化、OpenCode passthrough env 白名单和 AgentProxy/OpenCode 配置隔离；审查后补充 runtime port 1-65535 校验、显式配置优先级测试、嵌套 OpenCode 原生配置拒绝测试，并将默认数据库文件名与 storage 常量对齐。验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Phase 2.4 日志与脱敏、Phase 2.5 SQLite 存储仍未实现，Gate 2 仍未通过；配置解析层不启动 runtime、不读取或写入 OpenCode 原生配置。
- 2026-05-19：同步 Phase 2.3 后续开发状态；明确最新阶段实现提交为 `214afc1 Phase 2.3：完成配置系统最小闭环`，已完成项包含 Phase 0.2、Phase 1、Phase 2.1、Phase 2.2、Phase 2.3 配置系统第一组，未完成项从 Phase 2.4 日志与脱敏开始；更新下次启动提示词，要求以 Phase 2.4 日志与脱敏为第一个未完成任务继续。
- 2026-05-19：完成 Phase 2.4 日志与脱敏第一组最小闭环；新增 `src/logging/logger.ts`、`src/logging/redact.ts`、`src/logging/output.ts` 和 `tests/logging.test.ts`，扩展 `src/logging/index.ts`，并让 Commander 输出接入脱敏 stderr writer。实现范围包含结构化 NDJSON logger、每次操作 `correlationId`、`providerId` / `runtimeId` / `sessionId` / `providerSessionId` / `operation` 字段、token/secret/password/api key/authorization 脱敏、logger message 脱敏、Error/AgentProxyError 脱敏、命令参数脱敏、JSON 风格 inline secret 脱敏、env-var 风格 inline secret 脱敏、空格分隔 CLI secret flag 脱敏、stdout/stderr 分离和 debug 显式启用；审查后修复 logger message、diagnostic stderr、inline env secret、Commander parse error 和空格分隔 CLI secret flag 泄漏路径，并补回归测试。验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Phase 2.5 SQLite 存储仍未实现，Gate 2 仍未通过；本阶段未实现 SQLite 存储或 OpenCode runtime 生命周期。
