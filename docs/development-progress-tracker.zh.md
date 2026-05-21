# AgentProxy 中文阶段开发进度追踪清单

- 文档类型：阶段任务清单 / 迭代追踪表
- 依据方案：`docs/agentproxy-development-plan.md`
- 当前方案版本：Draft v3
- 创建日期：2026-05-19
- 首版目标：以 OpenCode 作为第一个完整 Coding Agent runtime provider
- 维护规则：后续迭代以本文档为主要开发进度追踪清单，完成项必须有实现、测试、文档或验证记录支撑；每完成一个阶段任务后立即提交一次 commit

## 最新开发状态（2026-05-22）

### 当前阶段

- 当前处于：Gate 4 汇总验证已通过；Phase 5.1 CLI Framework Foundation、Phase 5.2 `doctor` CLI 工作流、Phase 5.3 `run [prompt]` 最小工作流、Phase 5.3 CLI `chat` native OpenCode launcher 最小入口、Phase 5 `providers list/inspect` CLI 最小工作流、Phase 5 `runtime list` 只读 CLI 最小工作流、Phase 5 `runtime stop` CLI 最小工作流、Phase 5 `sessions list` 只读 CLI 最小工作流、Phase 5 `sessions show` 只读 CLI 最小工作流、Phase 5 `sessions resume` CLI 最小工作流、Phase 5 `sessions abort` CLI 最小工作流、Phase 5 `sessions delete` CLI 最小工作流和 Phase 5 `sessions export` CLI 最小工作流已完成并验证；Phase 5 CLI MVP 其余真实业务命令或子命令尚未实现，Gate 5 尚未通过，Phase 6 AgentProxy TUI 尚未开始。下一步应从 Phase 5 后续 CLI MVP 真实业务命令拆小推进，继续保持薄代理和控制面边界。
- 最新 Phase 5.2 实现提交：`c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5.2 实现提交。
- 最新 Phase 5.3 `run [prompt]` 实现提交：`f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`。
- 最新 Phase 5.3 CLI `chat` native OpenCode launcher 实现提交：`4e07797 阶段进展：完成 Phase 5.3 Chat Native TUI Launcher`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5.3 CLI `chat` launcher 实现提交。
- 最新 Phase 5 `providers list/inspect` CLI 实现提交：`c620a4c 阶段进展：完成 Phase 5 Providers List/Inspect CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 provider CLI 实现提交。
- 最新 Phase 5 `runtime list` CLI 实现提交：`3fc5b34 阶段进展：完成 Phase 5 Runtime List CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 runtime list CLI 实现提交。
- 最新 Phase 5 `runtime stop` CLI 实现提交：`fb827fe 阶段进展：完成 Phase 5 Runtime Stop CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 runtime stop CLI 实现提交。
- 最新 Phase 5 `sessions list` CLI 实现提交：`6626584 阶段进展：完成 Phase 5 Sessions List CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 sessions list CLI 实现提交。
- 最新 Phase 5 `sessions show` CLI 实现提交：`7849c56 阶段进展：完成 Phase 5 Sessions Show CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 sessions show CLI 实现提交。
- 最新 Phase 5 `sessions resume` CLI 实现提交：`fecc676 阶段进展：完成 Phase 5 Sessions Resume CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 sessions resume CLI 实现提交。
- 最新 Phase 5 `sessions abort` CLI 实现提交：`1b1a017 阶段进展：完成 Phase 5 Sessions Abort CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 sessions abort CLI 实现提交。
- 最新 Phase 5 `sessions delete` CLI 实现提交：`080e015 阶段进展：完成 Phase 5 Sessions Delete CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 sessions delete CLI 实现提交。
- 最新 Phase 5 `sessions export` CLI 实现提交：`479ed89 阶段进展：完成 Phase 5 Sessions Export CLI`；若最新提交是后续文档同步提交，Phase 5 最新实现基线仍为该 Phase 5 sessions export CLI 实现提交。
- 最近已记录 Gate 4 汇总验证提交：`549a979 阶段进展：完成 Gate 4 汇总验证`；若最新提交是后续文档同步提交，Gate 4 验证基线仍为 `549a979`，最新 Phase 4 实现基线仍为 `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`。
- 最新 Phase 4 阶段实现提交：`afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`。
- 当前启动基线：`479ed89 阶段进展：完成 Phase 5 Sessions Export CLI`；Gate 4 验证基线仍为 `549a979 阶段进展：完成 Gate 4 汇总验证`，最新 Phase 4 实现基线仍为 `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`。
- 最新阶段实现提交：`479ed89 阶段进展：完成 Phase 5 Sessions Export CLI`；最新阶段门禁验证提交：`549a979 阶段进展：完成 Gate 4 汇总验证`。
- 前一阶段实现基线：`a018f82 阶段进展：完成 Phase 4.6 Session 操作`。
- Phase 0.2 / Phase 1 阶段提交：`e5eb0ce 阶段进展：完成 Phase 0.2 技术决策与 Phase 1 工程骨架`
- 当前主要进度来源：本文档和 `docs/agentproxy-development-plan.md`
- 当前代码状态：已初始化 TypeScript 工程骨架，并完成核心 contract 层、provider registry 最小闭环、配置解析层最小闭环、日志/脱敏第一组、SQLite 存储、Phase 3.1 OpenCode Binary 探测、Phase 3.2 Runtime Registry、Phase 3.3 Managed Runtime、Phase 3.4 Attached Runtime、Phase 3.5 Event Stream、Phase 3 runtime 诊断/Gate 3 汇总验证、Phase 4.1 OpenCodeProvider Health/Capability provider-layer、Phase 4.2 Model/Provider 列表、Phase 4.3 Session 同步、Phase 4.4 Session 创建与恢复、Phase 4.5 Message 发送与事件映射、Phase 4.6 Session 操作、Phase 4.7 Provider Passthrough、Gate 4 汇总验证、Phase 5.1 CLI Framework Foundation、Phase 5.2 Doctor CLI 工作流、Phase 5.3 Run Prompt Minimal Workflow、Phase 5.3 CLI Chat Native OpenCode Launcher Minimal Entry、Phase 5 Providers List/Inspect CLI、Phase 5 Runtime List CLI、Phase 5 Runtime Stop CLI、Phase 5 Sessions List CLI、Phase 5 Sessions Show CLI、Phase 5 Sessions Resume CLI、Phase 5 Sessions Abort CLI、Phase 5 Sessions Delete CLI 和 Phase 5 Sessions Export CLI：稳定错误码、provider capability 默认化、metadata escape hatch、runtime/session/event 类型、`AgentProvider` 契约、provider 注册/lookup/list、capability probe、schema mismatch limited mode、AgentProxy 默认配置、全局/项目/显式配置读取、env/CLI 覆盖、schema 校验、路径规范化、OpenCode 配置隔离、结构化 NDJSON logger、correlationId、标准日志字段、redaction、stdout/stderr 分离、Commander parse error 脱敏、`better-sqlite3` 接入、数据库初始化、migration 版本表、providers/runtimes/sessions/session_events 表、基础 repository CRUD、重复 migration 安全性、session 唯一约束、tombstone 保留、破坏性 migration 备份/失败恢复、从配置或 `PATH` 定位 `opencode`、执行 `--version`、规范化 OpenCode 版本号、最低支持版本检查、缺失/不可执行 binary 和低版本的 `PROVIDER_UNAVAILABLE` 错误映射、Runtime Registry managed/attached 元数据持久化、状态机状态记录、runtime list 查询、metadata-only stale cleanup、managed `opencode serve` 子进程启动、默认 `127.0.0.1` 绑定、端口冲突选择空闲端口、`/global/health` 等待、启动失败/health 超时映射、仅停止当前 AgentProxy 拥有的 managed 子进程和子进程退出状态回写、显式 attached server URL 连接、registry attached runtime 重新健康检查、OpenCode-like health response 校验、非 localhost warning 元数据和 attached detach-only 停止保护、OpenCode `/event` SSE 连接、AgentProxy event envelope 转换、未知事件 `provider.raw_event` 保留、stream interruption 检测、runtime `degraded`/`reconnecting`/`healthy` 状态回写、有限 reconnect/backoff、重连后 session status 补偿 hook 和 `EVENT_STREAM_INTERRUPTED` 映射、runtime 层结构化诊断报告、binary/registry/health/event stream/managed smoke start-stop 检查、Gate 3 capability 汇总、诊断详情脱敏、OpenCodeProvider provider-layer `healthCheck` / `getCapabilities` 探测、server API/SSE/SDK 可达性探测、provider version 返回、capability metadata 中保留 endpoint 探测详情、`OpenCodeProvider.listModels()`、`OpenCodeProvider.listSessions()`、`OpenCodeProvider.getSession()`、`OpenCodeProvider.startSession()`、`OpenCodeProvider.resumeSession()`、`OpenCodeProvider.sendMessage()`、`OpenCodeProvider.abortSession()`、`deleteSession()`、`exportSession()`、`importSession()`、`shareSession()`、`unshareSession()`、`OpenCodeProvider.passthrough()`、`OpenCodeProvider.openNativeTui()`、provider-agnostic `syncProviderSessions()`、`startAgentProxySession()`、`resumeAgentProxySession()`、`sendAgentProxyMessage()`、`abortAgentProxySession()`、`deleteAgentProxySession()`、`exportAgentProxySession()`、session operation service、本地 session ID 生成、provider session 映射持久化、父 session 校验、初始 prompt 创建后异步发送保护、message event stream 映射、session_events 脱敏投影、delete tombstone、raw export 二次确认、share URL 不落库、import mapping 持久化、tombstone 保留、workspace 冲突记录、`agentproxy provider exec opencode -- <native args>` 窄 CLI 入口、provider stdout/stderr/exit code 保留、passthrough env allowlist、workspace override、共享 CLI parser/global flags/help/routing/stable exit code/`--json`/stdout-stderr 分工、`agentproxy doctor` Node/config/SQLite/OpenCode binary/version/runtime health/provider list/MCP/workspace Git 诊断、JSON doctor report、缺失依赖建议、doctor 输出脱敏和稳定退出码、`agentproxy run [prompt]` prompt/stdin 输入、runtime base URL 选择、managed one-shot runtime 启停、AgentProxy session 映射持久化、message event stream 渲染、JSON event summary 无 transcript 和终端安全 human 输出、`agentproxy chat` CLI 命令调起 OpenCode 原生交互界面、workspace-level provider-native launcher、interactive stdio handoff、provider exit-code preservation、native child env allowlist、`--session` 显式 unsupported、`agentproxy providers list/inspect` 只读 provider 可见性、health/capability/model 摘要和 JSON/human 安全输出、`agentproxy runtime list` 只读 registry 可见性、缺 DB 空列表降级、readonly SQLite 打开、稳定 runtime 字段摘要和 URL/metadata 脱敏、`agentproxy runtime stop` attached runtime 本地 detach-only、managed registry-only 稳定拒绝、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、provider/workspace 可见性过滤、JSON/human 安全输出、`agentproxy sessions list` 只读本地 session 索引可见性、`agentproxy sessions show` 只读本地 session 详情可见性、`agentproxy sessions resume` 现有本地 session 映射恢复、可选 prompt 发送、共享 runtime 选择/managed one-shot 生命周期、JSON transcript-free 事件摘要和 human 终端安全输出、`agentproxy sessions abort` 现有本地 session 映射中止、provider abort operation 调用、本地 failed/abort metadata 写回、`agentproxy sessions delete` 现有本地 session 映射删除、provider delete operation 调用、provider 成功后本地 provider_deleted tombstone 写回、`--yes` 显式确认、JSON transcript-free action 摘要和 human 终端安全输出、`agentproxy sessions export` 现有本地 session 映射导出、默认 sanitized provider-native OpenCode export、`--raw --yes` 二次确认、`--output` 文件写入、只读 SQLite mapping 查找、export payload 不落 SQLite、JSON 标记 sanitized 状态和 human summary 终端安全输出、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、非 tombstone/provider/workspace 匹配过滤、稳定 session 字段摘要和 transcript/metadata/raw event 脱敏。注意：这不是 Phase 6 AgentProxy TUI/Ink 控制面实现。
- 当前第一个未完成实现项：Phase 5 后续真实业务命令拆小；优先从 `sessions import/share/unshare` / `config` 等 CLI MVP 剩余命令中选择一个小范围任务组，不要直接进入完整 TUI。Gate 5 只有在这些 CLI MVP 真实业务命令补齐并通过汇总验证后才能勾选。
- 当前工作区预期：本文档同步提交后应保持干净；下次启动必须先运行 `git status --short` 和 `git log -1 --oneline` 复核最新提交。若最新提交是后续文档同步提交，应继续以 `479ed89 阶段进展：完成 Phase 5 Sessions Export CLI` 作为 Phase 5 最新实现基线，以 `549a979 阶段进展：完成 Gate 4 汇总验证` 作为阶段门禁基线，并从 Phase 5 后续真实业务命令拆小继续。

### 阶段总览

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Phase 0.2 | 已完成 | 实施前技术决策已记录到 ADR。 |
| Phase 1 | 已完成 | TypeScript 工程骨架、基础脚本、CLI help/version 占位入口已完成。 |
| Phase 2 | 已完成 | 核心类型、Provider Registry、配置、日志脱敏、SQLite 存储和 Gate 2 已完成。 |
| Phase 3 | 已完成 | OpenCode runtime binary、registry、managed/attached、event stream、diagnostics 和 Gate 3 已完成。 |
| Phase 4 | 已完成 | Phase 4.1 OpenCodeProvider Health/Capability、Phase 4.2 Model/Provider 列表、Phase 4.3 Session 同步、Phase 4.4 Session 创建与恢复、Phase 4.5 Message 发送与事件映射、Phase 4.6 Session 操作、Phase 4.7 Provider Passthrough 和 Gate 4 汇总验证已完成。 |
| Phase 5 | 进行中 | Phase 5.1 CLI Framework Foundation、Phase 5.2 `doctor` CLI 工作流、Phase 5.3 `run [prompt]` 最小工作流、Phase 5.3 CLI `chat` native OpenCode launcher 最小入口、Phase 5 `providers list/inspect` CLI 最小工作流、Phase 5 `runtime list` 只读 CLI 最小工作流、Phase 5 `runtime stop` CLI 最小工作流、Phase 5 `sessions list` 只读 CLI 最小工作流、Phase 5 `sessions show` 只读 CLI 最小工作流、Phase 5 `sessions resume` CLI 最小工作流、Phase 5 `sessions abort` CLI 最小工作流、Phase 5 `sessions delete` CLI 最小工作流和 Phase 5 `sessions export` CLI 最小工作流已完成并验证；CLI MVP 其余真实业务命令或子命令尚未实现，下一步是 Phase 5 后续命令拆小推进。 |
| Phase 6 | 未完成 | AgentProxy TUI MVP 尚未开始；不要把 Phase 5 的 provider-native launcher 视为 Phase 6 TUI 完成。 |
| Phase 7 | 未完成 | 安全、信任与可观测性尚未实现。 |
| Phase 8 | 未完成 | 测试与 CI 尚未落地。 |
| Phase 9 | 未完成 | 文档、打包与发布流程尚未完成。 |

### Phase 5 当前明细

| Phase 5 CLI MVP 项 | 状态 | 备注 |
| --- | --- | --- |
| CLI Framework Foundation | 已完成并验证 | 共享 Commander parser、global flags、help/routing、稳定退出码、`--json`、stdout/stderr 分工。 |
| `doctor` | 已完成并验证 | Node/config/SQLite/OpenCode/runtime/provider/workspace 诊断和 JSON report。 |
| `run [prompt]` | 已完成并验证 | headless prompt、runtime 选择/managed one-shot、session 映射、event summary、稳定退出码。 |
| `chat` native OpenCode launcher | 已完成并验证 | 仅为 Phase 5 provider-native launcher，不是 Phase 6 AgentProxy TUI。 |
| `providers list/inspect` | 已完成并验证 | provider health/capability/model 只读可见性。 |
| `runtime list` | 已完成并验证 | runtime registry 只读列表，缺 DB 空列表降级。 |
| `sessions list` | 已完成并验证 | 本地 session registry 只读列表。 |
| `sessions show` | 已完成并验证 | 本地 session registry 单条详情，只读且 transcript-free。 |
| `sessions resume` | 已完成并验证 | 恢复既有本地 session 映射，可选 `--prompt` 发送，JSON transcript-free，human 不输出 provider transcript。 |
| `sessions abort` | 已完成并验证 | 调用 provider abort operation，中止既有本地 session 映射，写回 failed/abort metadata，JSON/human 输出不含 transcript。 |
| `sessions delete` | 已完成并验证 | 删除既有本地 session 映射，要求 `--yes`，调用 provider delete operation，provider 成功后写入 provider_deleted tombstone，JSON/human 输出不含 transcript 或 metadata。 |
| `sessions export` | 已完成并验证 | 导出现有本地 session 映射，默认 sanitized，raw export 要求 `--raw --yes`，支持 `--output`，export payload 不落 SQLite。 |
| `sessions import/share/unshare` | 未完成 | 下一步可从这些子命令中选一个小范围任务组推进；不要一次性全做。 |
| `runtime stop` | 已完成并验证 | attached runtime 本地 detach-only，managed registry-only 稳定拒绝。 |
| `config` | 未完成 | 尚未实现 CLI get/set 或等价配置工作流。 |
| Gate 5 | 未通过 | CLI MVP 真实业务命令尚未补齐，不能勾选。 |

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
- [x] 完成 Phase 2.5 SQLite 存储第一组，包含 SQLite 库接入、数据库初始化、migration 版本表、providers/runtimes/sessions/session_events 表、基础 repository CRUD、重复 migration 安全性、session 唯一约束和 tombstone 保留验证。
- [x] 完成 Phase 2.5 破坏性 migration 备份机制，包含显式 migration descriptor、破坏性迁移前 SQLite 临时文件备份、WAL/SHM/journal sidecar 处理、失败恢复、临时备份清理和 `STORAGE_ERROR` 映射。
- [x] Gate 2 已通过：核心类型、Provider Registry、配置系统、日志与 SQLite 存储基础均已完成并验证。
- [x] 完成 Phase 3.1 OpenCode Binary 探测，包含配置或 `PATH` 定位 `opencode`、执行 `--version`、版本号规范化、最低支持版本 `1.0.0` 检查、缺失 binary 和低版本错误映射、安装/升级建议、fake binary 测试覆盖。
- [x] 完成 Phase 3.2 Runtime Registry，包含 storage-backed `RuntimeRegistry`、managed/attached runtime metadata、状态机状态、base URL/host/port/PID/workspace/mode/timestamp 记录、runtime list 查询和 metadata-only stale cleanup。
- [x] 完成 Phase 3.3 Managed Runtime，包含 managed `opencode serve` 子进程启动、默认绑定 `127.0.0.1`、端口冲突选择空闲端口、等待 `/global/health`、启动失败和 health 超时捕获、仅停止当前 AgentProxy 拥有的 managed 进程、子进程退出状态更新。
- [x] 完成 Phase 3.4 Attached Runtime，包含显式 server URL attached 连接、registry 中 attached runtime 健康重连、OpenCode-like health response 校验、非 localhost warning 和 attached detach-only 停止保护。
- [x] 完成 Phase 3.5 Event Stream，包含 OpenCode `/event` SSE 连接、AgentProxy event envelope 转换、未知事件保留、断线检测、runtime degraded/reconnecting/healthy 状态回写、有限 reconnect/backoff、重连后 session status 补偿 hook 和 `EVENT_STREAM_INTERRUPTED` 映射。
- [x] 完成 Phase 3 runtime 诊断和 Gate 3 汇总验证，包含 runtime 层结构化诊断报告、缺失 binary 非抛出式失败检查、registry 摘要、`/global/health`、`/event` reachability、managed smoke start/stop、诊断详情脱敏和 Gate 3 capability 汇总。
- [x] Gate 3 已通过：OpenCode runtime 可启动、连接、诊断、停止，且生命周期安全。
- [x] 完成 Phase 4.1 OpenCodeProvider Health 与 Capability provider-layer，包含 `healthCheck`、`getCapabilities`、binary/runtime server API/SSE/SDK 探测、OpenCode version 返回、endpoint metadata 保留和未实现操作 capability 保守关闭。
- [x] 完成 Phase 4.2 Model 与 Provider 列表，包含 `OpenCodeProvider.listModels()`、`GET /provider` 读取、OpenCode provider/model 到 `ModelRef` 的映射、provider-specific metadata 白名单保留、未认证和无模型状态处理。
- [x] 完成 Phase 4.3 Session 同步，包含 `OpenCodeProvider.listSessions()`、`GET /session` 和 `GET /session/status` 读取、OpenCode session 到 `ProviderSession` 的映射、session model 映射、provider-specific metadata 白名单保留、未认证和异常响应处理、provider-agnostic `syncProviderSessions()` 本地索引同步、tombstone 保留、workspace 冲突记录、完整列表下的 `missing_in_provider` 标记。
- [x] 完成 Phase 4.4 Session 创建与恢复，包含 `OpenCodeProvider.getSession()`、`startSession()`、`resumeSession()`、`POST /session`、`GET /session/:id`、`POST /session/:id/prompt_async`、session create/resume capability、`startAgentProxySession()`、`resumeAgentProxySession()`、AgentProxy session ID 生成、providerSessionId 映射持久化、workspace/runtime/requested model metadata 保存、parent session 校验、tombstone 不复活、provider session id mismatch 防护和初始 prompt 失败 orphan 防护。
- [x] 完成 Phase 4.5 Message 发送与事件映射，包含 `OpenCodeProvider.sendMessage()`、`POST /session/:id/message`、发送前订阅 `/event`、复用 Phase 3 SSE parser/envelope 映射、message delta/tool/permission/file/diff/raw/terminal event 映射、provider-agnostic `sendAgentProxyMessage()`、本地 session running/completed/failed 状态持久化、session_events 脱敏投影和 permission 不自动 approve 防护。
- [x] 完成 Phase 4.6 Session 操作，包含 `OpenCodeProvider.abortSession()`、`deleteSession()`、`exportSession()`、`importSession()`、`shareSession()`、`unshareSession()`、OpenCode server session 操作 API、export/import CLI 边界、provider capability 更新、provider-agnostic session operation service、delete tombstone、raw export 二次确认、share URL 不落 SQLite 和 import mapping 持久化。
- [x] 完成 Phase 4.7 Provider Passthrough，包含 `OpenCodeProvider.passthrough()`、`agentproxy provider exec opencode -- <native args>` 窄 CLI 入口、`--` 后参数原样传递、provider stdout/stderr/exit code 保留、workspace override、OpenCode env allowlist、diagnostic 脱敏、无状态持久化和无隐式 preflight/timeout/output cap。
- [x] Gate 4 已通过：OpenCodeProvider 核心 session、message、操作与 passthrough 工作流已完成汇总验证，Phase 4 provider-layer 闭环测试和完整项目质量门禁均通过。
- [x] 完成 Phase 5 CLI MVP 首个小范围任务组的实现前计划/check-in：确定下一步只做 Phase 5.1 CLI Framework Foundation，依赖、验收标准和风险已记录到 `tasks/todo.md`；本项不是 Phase 5.1 实现完成。
- [x] 完成 Phase 5.1 CLI Framework Foundation，包含共享 CLI parser/global flags/help/routing/stable exit code/`--json`/stdout-stderr 分工、JSON 错误脱敏、Commander parse error 退出码 `2` 和 `provider exec` 透传回归覆盖。
- [x] 完成 Phase 5.2 Doctor CLI 工作流，包含 `agentproxy doctor` 真实命令、Node/config/SQLite/OpenCode binary/version/runtime health/provider list/MCP/workspace Git 检查、JSON doctor report、缺失依赖建议、doctor 输出脱敏、稳定退出码和 `--managed-smoke` 显式诊断选项。
- [x] 完成 Phase 5.3 `run [prompt]` 最小工作流，包含 prompt/stdin 读取、runtime base URL 选择或 managed runtime 启动、AgentProxy session 映射持久化、message event stream 渲染、human/JSON 输出分流和稳定退出码。
- [x] 完成 Phase 5.3 CLI `chat` native OpenCode launcher 最小入口，包含 `agentproxy chat` 调起 OpenCode 原生交互界面、workspace 参数传递、interactive stdio handoff、provider exit code 保留、child env allowlist、provider disabled/missing binary/invalid provider 稳定错误和 `--session` 显式 unsupported；这仍属于 Phase 5 CLI，不是 Phase 6 AgentProxy TUI。
- [x] 完成 Phase 5 `providers list/inspect` CLI 最小工作流，包含只读 provider health/capability/model 摘要、配置或 registry runtime base URL 选择、JSON/human 输出、invalid/disabled provider 稳定错误、缺 runtime 降级和 model list 失败子状态。
- [x] 完成 Phase 5 `runtime list` CLI 最小工作流，包含只读 runtime registry 列表、缺 SQLite DB 空列表降级且不创建 DB/父目录、JSON/human 输出、provider/workspace 过滤、invalid/disabled provider 稳定错误、runtime URL/metadata/终端控制字符安全净化。
- [x] 完成 Phase 5 `runtime stop` CLI 最小工作流，包含 attached runtime 本地 detach-only、managed registry-only 稳定拒绝、缺 SQLite DB 不创建并映射 `SESSION_NOT_FOUND`、provider/workspace 可见性过滤、JSON/human 输出、runtime URL/metadata/终端控制字符安全净化。
- [x] 完成 Phase 5 `sessions list` CLI 最小工作流，包含只读本地 session registry 列表、缺 SQLite DB 空列表降级且不创建 DB/父目录、JSON/human 输出、provider/workspace 过滤、默认排除 tombstone、invalid/disabled provider 稳定错误、session metadata/transcript/终端控制字符安全净化。
- [x] 完成 Phase 5 `sessions show` CLI 最小工作流，包含只读本地 session registry 单条详情、缺 SQLite DB 映射 `SESSION_NOT_FOUND` 且不创建 DB/父目录、JSON/human 输出、provider/workspace/tombstone 过滤、invalid/disabled provider 稳定错误、session metadata/transcript/raw event/终端控制字符安全净化。
- [x] 完成 Phase 5 `sessions resume` CLI 最小工作流，包含现有本地 session 映射恢复、可选 `--prompt` 发送、复用 OpenCode runtime 选择和 managed one-shot 生命周期、JSON transcript-free 事件摘要、human 终端安全输出、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、provider/workspace/tombstone 过滤、invalid/disabled provider 稳定错误。
- [x] 完成 Phase 5 `sessions abort` CLI 最小工作流，包含现有本地 session 映射中止、provider abort operation 调用、本地 failed/abort metadata 写回、复用 OpenCode runtime 选择和 managed one-shot 生命周期、JSON transcript-free action 摘要、human 终端安全输出、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、provider/workspace/tombstone 过滤、invalid/disabled provider 稳定错误。
- [x] 完成 Phase 5 `sessions delete` CLI 最小工作流，包含现有本地 session 映射删除、`--yes` 显式确认、provider delete operation 调用、provider 成功后本地 provider_deleted tombstone 写回、provider 失败不写 tombstone、复用 OpenCode runtime 选择和 managed one-shot 生命周期、JSON transcript-free action 摘要、human 终端安全输出、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、provider/workspace/tombstone 过滤、invalid/disabled provider 稳定错误。
- [x] 完成 Phase 5 `sessions export` CLI 最小工作流，包含现有本地 session 映射导出、默认 sanitized provider-native OpenCode export、raw export `--raw --yes` 二次确认、`--output` 文件写入、只读 SQLite mapping 查找、export payload 不落 SQLite、JSON 标记 sanitized 状态、human summary 终端安全输出、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、provider/workspace/tombstone 过滤、invalid/disabled provider 和 missing binary 稳定错误。

### 未完成

- [ ] Phase 5：除 Phase 5.1/5.2/5.3 的 `run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list`、`runtime stop`、`sessions list`、`sessions show`、`sessions resume`、`sessions abort`、`sessions delete` 和 `sessions export` 外，`sessions import/share/unshare`、`config` 等 CLI MVP 工作流尚未实现；Gate 5 尚未通过。
- [ ] Phase 6：AgentProxy TUI MVP 尚未开始，未实现 Dashboard、Sessions、Providers、Runtime、Logs、Settings 等 Ink 控制面页面。
- [ ] Phase 7：安全、信任与可观测性尚未实现。
- [ ] Phase 8：测试与 CI 尚未落地。
- [ ] Phase 9：文档、打包与发布流程尚未完成。

### 下一步建议

下次启动后，应按以下顺序继续：

1. 先阅读 `tasks/lessons.md`，确认项目规则和长期习惯。
2. 阅读本文档，定位第一个未完成任务。
3. 从 Phase 5 后续真实业务命令拆小继续；优先选择一个小范围 CLI MVP 剩余命令任务组，不要提前扩展到完整 TUI，也不要同时实现 `sessions import/share/unshare`、`config` 等多个后续真实业务命令。
4. 复用 Phase 2.1 已建立的 `AgentProvider`、capability schema、metadata escape hatch 和稳定错误码。
5. 继续保持 AgentProxy 的薄代理和控制面定位，不复制 OpenCode agent runtime 内部逻辑。
6. 完成阶段后运行验证命令，更新本文档，创建详细中文 commit。
7. 重启会话后先核对 `git status --short` 和 `git log -1 --oneline`，再继续当前阶段。

### 下次启动提示词

```text
请先阅读 /Users/zq/Desktop/ai-projs/posp/AgentProxy/tasks/lessons.md，
再阅读 /Users/zq/Desktop/ai-projs/posp/AgentProxy/docs/development-progress-tracker.zh.md
和 /Users/zq/Desktop/ai-projs/posp/AgentProxy/docs/agentproxy-development-plan.md。

当前项目状态是：Phase 0.2 实施前技术决策、Phase 1 TypeScript 工程骨架、Phase 2.1 核心领域类型和稳定错误码、Phase 2.2 Provider Registry、Phase 2.3 配置系统第一组、Phase 2.4 日志与脱敏第一组、Phase 2.5 SQLite 存储含破坏性 migration 备份机制、Phase 3.1 OpenCode Binary 探测、Phase 3.2 Runtime Registry、Phase 3.3 Managed Runtime、Phase 3.4 Attached Runtime、Phase 3.5 Event Stream、Phase 3 runtime 诊断和 Gate 3 汇总验证、Phase 4.1 OpenCodeProvider Health 与 Capability provider-layer、Phase 4.2 Model 与 Provider 列表、Phase 4.3 Session 同步、Phase 4.4 Session 创建与恢复、Phase 4.5 Message 发送与事件映射、Phase 4.6 Session 操作、Phase 4.7 Provider Passthrough、Gate 4 汇总验证、Phase 5.1 CLI Framework Foundation、Phase 5.2 Doctor CLI 工作流、Phase 5.3 Run Prompt Minimal Workflow、Phase 5.3 CLI Chat Native OpenCode Launcher Minimal Entry、Phase 5 Providers List/Inspect CLI 最小工作流、Phase 5 Runtime List CLI 最小工作流、Phase 5 Runtime Stop CLI 最小工作流、Phase 5 Sessions List CLI 最小工作流、Phase 5 Sessions Show CLI 最小工作流、Phase 5 Sessions Resume CLI 最小工作流、Phase 5 Sessions Abort CLI 最小工作流、Phase 5 Sessions Delete CLI 最小工作流和 Phase 5 Sessions Export CLI 最小工作流已完成并验证；Gate 2、Gate 3 和 Gate 4 已通过，Gate 5 尚未通过。最新 Phase 5.3 `run [prompt]` 实现提交是 `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`；最新 Phase 5.3 CLI `chat` native OpenCode launcher 实现提交是 `4e07797 阶段进展：完成 Phase 5.3 Chat Native TUI Launcher`；最新 Phase 5 `providers list/inspect` CLI 实现提交是 `c620a4c 阶段进展：完成 Phase 5 Providers List/Inspect CLI`；最新 Phase 5 `runtime list` CLI 实现提交是 `3fc5b34 阶段进展：完成 Phase 5 Runtime List CLI`；最新 Phase 5 `runtime stop` CLI 实现提交是 `fb827fe 阶段进展：完成 Phase 5 Runtime Stop CLI`；最新 Phase 5 `sessions list` CLI 实现提交是 `6626584 阶段进展：完成 Phase 5 Sessions List CLI`；最新 Phase 5 `sessions show` CLI 实现提交是 `7849c56 阶段进展：完成 Phase 5 Sessions Show CLI`；最新 Phase 5 `sessions resume` CLI 实现提交是 `fecc676 阶段进展：完成 Phase 5 Sessions Resume CLI`；最新 Phase 5 `sessions abort` CLI 实现提交是 `1b1a017 阶段进展：完成 Phase 5 Sessions Abort CLI`；最新 Phase 5 `sessions delete` CLI 实现提交是 `080e015 阶段进展：完成 Phase 5 Sessions Delete CLI`；最新 Phase 5 `sessions export` CLI 实现提交是 `479ed89 阶段进展：完成 Phase 5 Sessions Export CLI`；最新 Gate 4 汇总验证提交是 `549a979 阶段进展：完成 Gate 4 汇总验证`；最新 Phase 4 阶段实现提交是 `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`。如果 `git log -1 --oneline` 显示的是后续文档同步提交，请继续以 `479ed89 阶段进展：完成 Phase 5 Sessions Export CLI` 作为 Phase 5 最新实现基线，以 `549a979` 作为阶段门禁基线。Phase 5 CLI MVP 其余真实业务命令或子命令 `sessions import/share/unshare` 和 `config` 尚未实现，Phase 6 AgentProxy TUI 尚未开始；下一步从 Phase 5 后续 CLI MVP 真实业务命令拆小继续，不要一次性实现多个真实业务，也不要进入完整 TUI。
请先运行 `git status --short` 和 `git log -1 --oneline` 核对最新提交与工作区状态。

请严格按照 docs/development-progress-tracker.zh.md 继续迭代，从第一个未完成项开始：
Phase 5 后续真实业务命令拆小。Phase 3 已完成 OpenCode runtime binary 探测、registry、managed/attached runtime、event stream、runtime 诊断和 Gate 3 汇总验证；Phase 4.1 已完成 provider-layer health/capability 探测；Phase 4.2 已完成 Model 与 Provider 列表；Phase 4.3 已完成 Session 同步；Phase 4.4 已完成 Session 创建与恢复；Phase 4.5 已完成 Message 发送与事件映射；Phase 4.6 已完成 Session 操作；Phase 4.7 已完成 Provider Passthrough；Gate 4 汇总验证已通过；Phase 5.1 已完成 CLI parser/global flags/help/routing/stable exit code/`--json`/stdout-stderr 分工的共享框架与测试；Phase 5.2 已完成 `doctor` CLI 工作流；Phase 5.3 已完成 `run [prompt]` 最小工作流和 CLI `chat` native OpenCode launcher 最小入口；Phase 5 `providers list/inspect`、`runtime list`、`runtime stop`、`sessions list`、`sessions show`、`sessions resume`、`sessions abort`、`sessions delete` 和 `sessions export` CLI 最小工作流已完成。下一步只选择一个 Phase 5 剩余 CLI MVP 小范围任务组推进，不要一次性实现 `sessions import/share/unshare`、`config` 等后续业务命令，不进入完整 TUI。注意：`agentproxy chat` 只是 CLI launcher，不能当作 Phase 6 AgentProxy TUI 已开始。

要求：
1. 不要重新规划已完成的架构方案，除非发现真实设计缺口。
2. 每次只选择一个小范围任务组推进。
3. 实现前先在 `tasks/todo.md` 顶部新增或更新当前迭代计划，确认依赖、验收标准和风险。
4. 完成后更新 docs/development-progress-tracker.zh.md 的勾选状态和 Review。
5. 如果产生可复用经验或用户纠正，更新 tasks/lessons.md。
6. 每完成一个阶段任务后，运行适用验证命令，并使用详细中文 commit 信息提交一次。
7. AgentProxy 必须保持薄代理和控制面定位，v1 只接入 OpenCode，不重写 Agent runtime。
8. 重启会话后先复习 `tasks/lessons.md`，并自动延续阶段提交习惯，不需要用户再次提醒。
9. Phase 2.4、Phase 2.5、Phase 3.1、Phase 3.2、Phase 3.3、Phase 3.4、Phase 3.5、Phase 3 runtime 诊断/Gate 3、Phase 4.1 provider-layer health/capability、Phase 4.2 Model/Provider 列表、Phase 4.3 Session 同步、Phase 4.4 Session 创建与恢复、Phase 4.5 Message 发送与事件映射、Phase 4.6 Session 操作、Phase 4.7 Provider Passthrough、Gate 4 汇总验证、Phase 5.1 CLI Framework Foundation、Phase 5.2 Doctor CLI 工作流、Phase 5.3 `run [prompt]` 最小工作流、Phase 5.3 CLI `chat` native OpenCode launcher 最小入口、Phase 5 `providers list/inspect` CLI 最小工作流、Phase 5 `runtime list` CLI 最小工作流、Phase 5 `runtime stop` CLI 最小工作流、Phase 5 `sessions list` CLI 最小工作流、Phase 5 `sessions show` CLI 最小工作流、Phase 5 `sessions resume` CLI 最小工作流、Phase 5 `sessions abort` CLI 最小工作流、Phase 5 `sessions delete` CLI 最小工作流和 Phase 5 `sessions export` CLI 最小工作流已完成，不要回退或扩展它们；下一步只处理一个 Phase 5 剩余 CLI MVP 小范围任务组，不要实现完整 TUI。
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
- [x] Gate 2：核心类型、provider 契约、配置、日志、存储基础可用。
- [x] Gate 3：OpenCode runtime 可启动、连接、诊断、停止，且生命周期安全。
- [x] Gate 4：OpenCodeProvider 支持核心 session、message、操作与 passthrough 工作流，并通过汇总验证。
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

- [x] 选择 SQLite 库。
- [x] 实现数据库初始化。
- [x] 实现 migration 版本表。
- [x] 实现 providers 表。
- [x] 实现 runtimes 表。
- [x] 实现 sessions 表，包含 tombstone 字段。
- [x] 实现 session_events 表。
- [x] 实现 repository CRUD。
- [x] 对破坏性 migration 增加备份机制。

验收标准：

- [x] 新数据库 migration 通过。
- [x] 重复运行 migration 安全。
- [x] `(provider_id, provider_session_id)` 唯一约束有效。
- [x] tombstone 记录不会被同步误删。
- [x] 破坏性 migration 运行前会创建 SQLite 文件备份。
- [x] 破坏性 migration 失败会恢复备份并返回 `STORAGE_ERROR`。

## 6. Phase 3：OpenCode Runtime 生命周期

目标：安全管理 OpenCode runtime，严格区分 managed 与 attached。

### 6.1 OpenCode Binary 探测

- [x] 从配置或 `PATH` 定位 `opencode`。
- [x] 执行版本检查。
- [x] 规范化版本号。
- [x] 检测 binary 缺失。
- [x] 检测低于最低支持版本。
- [x] 输出可执行的安装或升级建议。

验收标准：

- [x] 缺失 OpenCode 映射到 `PROVIDER_UNAVAILABLE`。
- [x] fake binary 测试覆盖版本解析。

### 6.2 Runtime Registry

- [x] 持久化 managed runtime 元数据。
- [x] 持久化 attached runtime 元数据。
- [x] 记录 runtime 状态机状态。
- [x] 记录 base URL、host、port、PID、workspace、mode 和时间戳。
- [x] 实现 stale runtime cleanup。
- [x] 实现 runtime list 查询。

验收标准：

- [x] managed 和 attached 可明确区分。
- [x] attached runtime 不会被 AgentProxy kill。
- [x] stale metadata 不阻塞新 run。

### 6.3 Managed Runtime

- [x] 以子进程启动 `opencode serve`。
- [x] 默认绑定 `127.0.0.1`。
- [x] 默认端口被非 OpenCode 进程占用时选择空闲端口。
- [x] 等待 `/global/health`。
- [x] 捕获启动失败和超时。
- [x] 仅停止 AgentProxy 启动的 managed 进程。
- [x] 子进程退出时更新 runtime 状态。

验收标准：

- [x] managed runtime 可进入 `healthy`。
- [x] 启动超时进入 `failed`。
- [x] 正常停止进入 `stopped`。
- [x] 端口冲突有测试覆盖。

### 6.4 Attached Runtime

- [x] 支持显式 `--server-url`。
- [x] 支持连接 registry 中健康的 OpenCode server。
- [x] 尽可能验证目标 server 是 OpenCode。
- [x] 不允许停止 attached runtime。
- [x] 连接非 localhost server 时给出 warning。

验收标准：

- [x] attached runtime health check 通过。
- [x] stop attached runtime 只断开本地记录。
- [x] 非 localhost attachment 有明确提示。

### 6.5 Event Stream

- [x] 连接 OpenCode event stream。
- [x] 将 provider 事件映射为 AgentProxy event envelope。
- [x] 保留未知 raw event。
- [x] 检测 stream interruption。
- [x] interruption 后进入 `degraded`。
- [x] 实现有限重连。
- [x] 重连后用 session status 补偿状态。

验收标准：

- [x] event stream 断开不会立即把 session 标记为 failed。
- [x] unknown event 不被丢弃。
- [x] fake server 测试覆盖重连。

### 6.6 Runtime 诊断与 Gate 3 汇总验证

- [x] 实现 runtime 层结构化诊断报告。
- [x] 检查 OpenCode binary 和版本。
- [x] 汇总 Runtime Registry 记录、状态和模式。
- [x] 检查已注册 runtime 的 `/global/health`。
- [x] 检查已注册 runtime 的 `/event` reachability。
- [x] 支持显式 managed smoke：启动 fake `opencode serve`、检查 health、检查 event stream、停止 owned runtime。
- [x] 汇总 Gate 3 capability：binary、registry、runtime start、runtime connect、event stream、runtime stop。
- [x] 诊断输出脱敏 URL credentials、query secret 和敏感字段。

验收标准：

- [x] 缺失或无效 OpenCode binary 作为 failed check 返回，不向调用方抛出。
- [x] 健康 registry runtime 的 health 和 event stream 检查通过。
- [x] managed smoke 可证明 runtime start/health/event/stop 闭环。
- [x] Gate 3 summary 只有在必须 capability 全部通过时才通过。
- [x] 诊断实现不启用 `agentproxy doctor` CLI，不进入 OpenCodeProvider 核心能力、CLI MVP 或 TUI。

## 7. Phase 4：OpenCodeProvider 核心能力

目标：把 OpenCode runtime 能力以 provider contract 暴露给 AgentProxy。

### 7.1 Health 与 Capability

- [x] 实现 `healthCheck`。
- [x] 实现 `getCapabilities`。
- [x] 探测 server API 可用性。
- [x] 探测 SDK 可用性。
- [x] 探测 native TUI 控制 endpoint 可用性，并保守保留在 metadata 中。
- [x] 探测 session/share 等 server endpoint 可用性，并保守保留在 metadata 中；export/import 顶层能力已在 Phase 4.6 操作实现时通过 binary 边界验证。
- [x] 返回 OpenCode version。

验收标准：

- [x] Provider-layer health/capability 数据可供未来 `providers inspect opencode --json` 复用；CLI wrapper 仍按 Phase 5 `providers inspect` 实现。
- [x] runtime probe 可以覆盖静态假设。
- [x] 未实现的 session/message/TUI `AgentProvider` 操作不会提前声明为顶层 capability。

### 7.2 Model 与 Provider 列表

- [x] 实现 `listModels`。
- [x] 将 OpenCode provider/model 数据映射为 `ModelRef`。
- [x] 保留 provider-specific metadata。
- [x] 处理未认证或无模型状态。

验收标准：

- [x] provider 健康时可以列出模型。
- [x] 未认证状态给出可执行诊断，不崩溃。

### 7.3 Session 同步

- [x] 实现 `listSessions`。
- [x] provider 有、本地没有时导入索引。
- [x] 本地有、provider 没有时在完整 provider 列表同步下标记 `missing_in_provider`。
- [x] 保留 tombstone。
- [x] 默认按更新时间倒序。
- [x] 支持 workspace 过滤。

验收标准：

- [x] 同步遵循 source-of-truth 规则。
- [x] tombstone session 不会被误导入。

### 7.4 Session 创建与恢复

- [x] 实现 `startSession`。
- [x] 实现 `resumeSession`。
- [x] 生成 `agentproxySessionId`。
- [x] 保存 `providerSessionId` 映射。
- [x] 保存 workspace path。
- [x] 保存 model selection。
- [x] 支持 session 创建后发送 prompt。

验收标准：

- [x] `run` 可创建并持久化 session 映射。
- [x] `resume` 使用原始 provider id。
- [x] workspace path 稳定且规范化。

### 7.5 Message 发送与事件映射

- [x] 实现 `sendMessage`。
- [x] 支持 positional prompt。
- [x] 支持 stdin prompt。
- [x] 返回 async event stream。
- [x] 映射 message delta。
- [x] 映射 tool start/finish。
- [x] 映射 permission request。
- [x] 映射 file/diff update。
- [x] 标记 session completed 或 failed。

验收标准：

- [x] fake server 下 headless run 可完成。
- [x] permission request 不会自动 approve。
- [x] session 状态被持久化。

### 7.6 Session 操作

- [x] 实现 abort。
- [x] 实现 delete。
- [x] 实现 export。
- [x] 实现 import。
- [x] 实现 share。
- [x] 实现 unshare。
- [x] export 结果标记 `sanitized`。
- [x] raw export 需要二次确认。

验收标准：

- [x] destructive action 没有 `--yes` 时需要确认。
- [x] export 结果标明 sanitize 状态。
- [x] delete 写入本地 tombstone。

### 7.7 Provider Passthrough

- [x] 实现 `provider exec`。
- [x] `--` 后参数原样传给 provider。
- [x] 保留 provider 原始退出码。
- [x] 只注入 allowlist 环境变量。
- [x] 诊断信息脱敏。
- [x] 支持 workspace override。

验收标准：

- [x] `agentproxy provider exec opencode -- --version` 可运行。
- [x] 退出码与 provider 原始退出码一致。
- [x] passthrough 不修改 AgentProxy 状态，日志除外。

### 7.8 Gate 4 汇总验证

- [x] 汇总验证 Health/Capability、Model/Provider 列表、Session 同步、Session 创建与恢复、Message 发送与事件映射、Session 操作和 Provider Passthrough 的 provider-layer 闭环。
- [x] 汇总验证 provider registry、OpenCode event stream 复用路径和 Phase 4.7 窄 `provider exec` 透传 CLI 边界。
- [x] 运行完整项目质量门禁。
- [x] 记录验证命令、结果和剩余风险。

验收标准：

- [x] Phase 4 聚焦测试矩阵通过。
- [x] 完整 `pnpm run test`、`typecheck`、`lint`、`format:check`、`build` 和 `git diff --check` 通过。
- [x] 不实现 Phase 5 CLI MVP、TUI 或新的 provider/runtime 行为。

## 8. Phase 5：CLI MVP

目标：提供稳定、脚本友好、错误可诊断的 CLI。

### 8.1 CLI 框架

当前状态：Phase 5.1 的共享 CLI 框架与输出契约、Phase 5.2 `doctor` CLI 工作流、Phase 5.3 `run [prompt]` 最小工作流、Phase 5.3 CLI `chat` native OpenCode launcher 最小入口、Phase 5 `providers list/inspect` CLI 最小工作流、Phase 5 `runtime list` CLI 最小工作流、Phase 5 `runtime stop` CLI 最小工作流、Phase 5 `sessions list` CLI 最小工作流、Phase 5 `sessions show` CLI 最小工作流、Phase 5 `sessions resume` CLI 最小工作流、Phase 5 `sessions abort` CLI 最小工作流、Phase 5 `sessions delete` CLI 最小工作流和 Phase 5 `sessions export` CLI 最小工作流已完成并验证。Commander 作为 CLI parser 继续保留；全局 flags、help、command routing、稳定退出码、`--json` 错误输出和 stdout/stderr 分工已收口；未实现 `sessions import/share/unshare` 和 `config` 真实业务命令或 Phase 6 AgentProxy TUI。

- [x] 选择 CLI parser。
- [x] 实现全局 flags。
- [x] 实现 help 输出。
- [x] 实现 command routing。
- [x] 实现稳定退出码。
- [x] 实现 `--json` 输出。
- [x] 实现 stdout/stderr 分工。

验收标准：

- [x] 每个命令都有 help。
- [x] JSON 模式 stdout 只输出合法 JSON。
- [x] 退出码符合主方案表格。

### 8.2 Doctor

- [x] 检查 Node.js 版本。
- [x] 检查 AgentProxy 配置。
- [x] 检查 SQLite 读写。
- [x] 检查 OpenCode binary。
- [x] 检查 OpenCode version。
- [x] 检查 server health。
- [x] 检查 provider list。
- [x] 检查 MCP status。
- [x] 检查 workspace Git 状态。
- [x] 支持 `--json`。

验收标准：

- [x] 缺失依赖给出下一步建议。
- [x] JSON 输出包含所有检查项状态。
- [x] doctor 输出不泄漏 secret。

### 8.3 Run 与 Chat

- [x] 实现 `run [prompt]`。
- [x] 支持 stdin prompt。
- [x] 支持 `--model`。
- [x] 支持 `--workspace`。
- [x] 支持 `--provider`。
- [x] 输出 session id。
- [x] human 模式渲染 event stream。
- [x] 实现 `chat` 作为 Phase 5 CLI native OpenCode launcher 最小入口。
- [ ] 实现 session-aware `chat --session` native launcher 或 Phase 6 AgentProxy TUI 入口。

验收标准：

- [x] managed runtime 下 `run` 可用。
- [x] attached runtime 下 `run` 可用。
- [x] `run --json` 返回机器可读结果。
- [x] `chat` 保留 provider-native OpenCode UI 行为，不复制 OpenCode chat engine。
- [x] `chat --session` 显式 unsupported，不假装恢复 session。

### 8.4 Sessions 命令

- [x] 实现 `sessions list`。
- [x] 实现 `sessions show`。
- [x] 实现 `sessions resume`。
- [x] 实现 `sessions abort`。
- [x] 实现 `sessions delete`。
- [x] 实现 `sessions export`。
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

- [x] 实现 `providers list`。
- [x] 实现 `providers inspect`。
- [x] 实现 `provider exec`。
- [x] 实现 `runtime list`。
- [x] 实现 `runtime stop`。
- [ ] 实现 `config get`。
- [ ] 实现 `config set`。

验收标准：

- [x] 不支持的能力返回 `CAPABILITY_UNSUPPORTED`。
- [x] runtime stop 正确区分 managed 与 attached。

## 9. Phase 6：TUI MVP

目标：实现 AgentProxy 控制面 TUI，不复制 OpenCode chat engine。注意：Phase 5 已完成的 `agentproxy chat` 只是 CLI native OpenCode launcher，不满足本阶段的 AgentProxy TUI 验收。

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

- [ ] `agentproxy chat` 或后续明确入口可打开 AgentProxy 控制面 TUI。
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

- [x] export 默认建议 sanitize。
- [x] raw export 必须二次确认。
- [x] export 结果标记 `sanitized: true | false`。
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

- 2026-05-22：文档同步 Phase 5 Sessions Export 后的最新开发状态；确认当前最新实现提交为 `479ed89 阶段进展：完成 Phase 5 Sessions Export CLI`，将顶部最新 Phase 5 sessions export 实现提交、当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词全部校准为具体提交 `479ed89`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list/stop` 和 `sessions list/show/resume/abort/delete/export`，剩余真实业务命令或子命令只有 `sessions import/share/unshare` 和 `config`；Gate 5 尚未通过，Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -1 --oneline`、`pnpm run format:check`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `sessions export` CLI 最小工作流；扩展 `src/cli/sessions.ts` 和 `src/cli/index.ts`，将 `agentproxy sessions export <id>` 从 planned placeholder 切换为真实命令。实现范围包含按 AgentProxy local session id 定位现有可见 session mapping、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、missing/tombstoned/wrong-provider/wrong-workspace 可见性过滤、只读 SQLite mapping 查找、复用既有 provider-backed `exportAgentProxySession()`、默认 sanitized OpenCode provider-native export、raw export 必须 `--raw --yes` 且确认先于 provider invocation、`--output` 先以 `wx`/`0600` 预留 artifact 文件、JSON file-target report 不携带 payload `data` 且仍统一结构化脱敏、human summary 终端安全输出、export payload 不落 SQLite、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`、missing OpenCode binary 稳定 provider unavailable，以及后续 `sessions import/share/unshare`、`config`、`chat --session` 和 Phase 6 TUI placeholder 边界保持。新增和调整 `tests/cli-sessions.test.ts`、`tests/cli-help.test.ts`、`tests/cli-chat.test.ts`、`tests/cli-run.test.ts`、`tests/cli-runtime.test.ts`、`tests/cli-providers.test.ts` 和 `tests/opencode-provider-session-actions.test.ts`；同时收紧 OpenCode provider-native export 的受限 env/binary probe 和 native command env，既避免继承完整 parent env，也保留最低版本检查。代码审查发现 raw `--output --json` 会把 payload 同时写入文件和 stdout 的阻断问题，已修复为 file-target JSON 只输出控制面摘要，并补充 raw output JSON、no-overwrite provider-before-invocation、provider 失败清理预留输出文件、`0600` 权限和 empty native export 稳定错误回归。验证命令：`pnpm exec vitest run tests/cli-sessions.test.ts tests/cli-help.test.ts tests/cli-chat.test.ts tests/cli-run.test.ts tests/cli-runtime.test.ts tests/cli-providers.test.ts --testTimeout=10000`（6 个测试文件、85 个用例）、`pnpm exec vitest run tests/session-actions.test.ts tests/opencode-provider-session-actions.test.ts --testTimeout=10000`、`pnpm exec vitest run tests/opencode-provider-session-actions.test.ts tests/cli-sessions.test.ts --testTimeout=15000`（2 个测试文件、48 个用例）、`pnpm run typecheck`、`pnpm run test`（29 个测试文件、262 个用例）、`pnpm run lint`、`pnpm run format:check`、`pnpm run build` 和 `git diff --check`，结果均通过。残余风险：真实 OpenCode export stdout 形态仍需后续 smoke 校准；`sessions import/share/unshare`、`config`、`chat --session`、Gate 5 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Sessions Delete 后的最新开发状态；确认最新 Phase 5 sessions delete 实现提交为 `080e015 阶段进展：完成 Phase 5 Sessions Delete CLI`，将顶部最新实现提交、当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词全部校准为具体提交 `080e015`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list/stop` 和 `sessions list/show/resume/abort/delete`，剩余真实业务命令或子命令只有 `sessions export/import/share/unshare` 和 `config`；Gate 5 尚未通过，Phase 6 AgentProxy TUI 尚未开始。下次启动提示词已改为当前 `/Users/zq/Desktop/ai-projs/posp/AgentProxy` 工作区路径，避免误指向 template 树。同步更新 `tasks/todo.md` 顶部当前迭代计划和历史 CLI checklist，使已完成的 `sessions`、`providers`、`runtime` 项不再显示为待办。验证命令：`git status --short`、`git log -1 --oneline`、`pnpm run format:check`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `sessions delete` CLI 最小工作流；扩展 `src/cli/sessions.ts` 和 `src/cli/index.ts`，将 `agentproxy sessions delete <id> --yes` 从 planned placeholder 切换为真实命令。实现范围包含按 AgentProxy local session id 定位现有可见 session mapping、`--yes` 显式确认、确认发生在任何 writable storage/runtime/provider work 之前、缺 DB 不创建并在已确认时映射 `SESSION_NOT_FOUND`、missing/tombstoned/wrong-provider/wrong-workspace 可见性过滤、复用 OpenCode runtime 选择和 managed one-shot lifecycle、调用既有 provider-backed `deleteAgentProxySession()`、provider 成功后写入本地 `provider_deleted` tombstone、provider 失败不写 tombstone、JSON transcript-free action 摘要、human 终端安全输出、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`、attached 无 runtime URL 稳定 runtime error，以及后续 `sessions export/import/share/unshare`、`config`、`chat --session` 和 Phase 6 TUI placeholder 边界保持。新增和调整 `tests/cli-sessions.test.ts`、`tests/cli-help.test.ts`、`tests/cli-chat.test.ts`、`tests/cli-run.test.ts`、`tests/cli-runtime.test.ts` 和 `tests/cli-providers.test.ts`；为避免默认测试脚本在既有 fake binary/server/process 生命周期用例中因 5s 超时不稳定，`vitest.config.ts` 设置项目默认 `testTimeout: 10000`。代码审查发现无确认时可先打开 writable SQLite 的阻断问题，已修复并补 `tasks/lessons.md` 经验。验证命令：`pnpm exec vitest run tests/cli-sessions.test.ts --testTimeout=10000`（31 个用例）、`pnpm exec vitest run tests/cli-sessions.test.ts tests/cli-help.test.ts tests/cli-chat.test.ts tests/cli-run.test.ts tests/cli-runtime.test.ts tests/cli-providers.test.ts tests/session-actions.test.ts tests/opencode-provider-session-actions.test.ts --testTimeout=10000`（8 个测试文件、87 个用例）、`pnpm exec vitest run --maxWorkers=1 --testTimeout=10000`（29 个测试文件、249 个用例）、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`（29 个测试文件、249 个用例）、`pnpm run build` 和 `git diff --check`，结果均通过。残余风险：真实 OpenCode delete smoke 校准留作后续兼容性任务；`sessions export/import/share/unshare`、`config`、`chat --session` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Sessions Abort 后的最新开发状态；确认最新 Phase 5 sessions abort 实现提交为 `1b1a017 阶段进展：完成 Phase 5 Sessions Abort CLI`，将顶部最新实现提交、当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词全部校准为具体提交 `1b1a017`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list/stop` 和 `sessions list/show/resume/abort`，剩余真实业务命令或子命令为 `sessions delete/export/import/share/unshare` 和 `config`；Gate 5 尚未通过，Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -3 --oneline`、`pnpm run format:check`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `sessions abort` CLI 最小工作流；扩展 `src/cli/sessions.ts` 和 `src/cli/index.ts`，将 `agentproxy sessions abort <id>` 从 planned placeholder 切换为真实命令。实现范围包含按 AgentProxy local session id 定位现有可见 session mapping、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、missing/tombstoned/wrong-provider/wrong-workspace 可见性过滤、复用 OpenCode runtime 选择和 managed one-shot lifecycle、调用既有 provider-backed `abortAgentProxySession()`、本地 session 写回 `failed` 和 abort metadata、JSON transcript-free action 摘要、human 终端安全输出、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`、attached 无 runtime URL 稳定 runtime error，以及后续 `sessions delete/export/import/share/unshare`、`config`、`chat --session` 和 Phase 6 TUI placeholder 边界保持。新增和调整 `tests/cli-sessions.test.ts`、`tests/session-actions.test.ts`、`tests/cli-help.test.ts`、`tests/cli-chat.test.ts`、`tests/cli-run.test.ts`、`tests/cli-runtime.test.ts` 和 `tests/cli-providers.test.ts`。验证命令：`pnpm exec vitest run tests/session-actions.test.ts tests/cli-sessions.test.ts tests/cli-help.test.ts tests/cli-chat.test.ts tests/cli-run.test.ts tests/cli-runtime.test.ts tests/cli-providers.test.ts`（7 个测试文件、75 个用例）、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm exec vitest run --maxWorkers=1 --testTimeout=10000`（29 个测试文件、241 个用例）、`pnpm run test`（29 个测试文件、241 个用例）、`pnpm run build` 和 `git diff --check`，结果均通过。残余风险：真实 OpenCode abort smoke 校准留作后续兼容性任务；`sessions delete/export/import/share/unshare`、`config`、`chat --session` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Runtime Stop 后的最新开发状态；确认最新 Phase 5 runtime stop 实现提交为 `fb827fe 阶段进展：完成 Phase 5 Runtime Stop CLI`，将顶部最新实现提交、当前启动基线、已完成/未完成摘要和下次启动提示词全部校准为具体提交 `fb827fe`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list/stop` 和 `sessions list/show/resume`，剩余真实业务命令或子命令为 `sessions abort/delete/export/import/share/unshare` 和 `config`；Gate 5 尚未通过，Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -1 --oneline`、`pnpm run format:check`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `runtime stop` CLI 最小工作流；扩展 `src/cli/runtime.ts` 和 `src/cli/index.ts`，将 `agentproxy runtime stop <runtime-id>` 从 planned placeholder 切换为真实命令。实现范围包含 provider/workspace 过滤、existing runtime registry 的定位与 detached 状态写回、attached runtime 通过 `OpenCodeAttachedRuntimeManager.stopAttachedRuntime()` 进入本地 `detached`、managed registry-only 通过 `CAPABILITY_UNSUPPORTED` 稳定拒绝且不按历史 PID kill、JSON/human 输出安全净化、缺失 DB 不创建 storage、以及后续 `sessions abort/delete/export/import/share/unshare`、`config`、`chat --session` 和 Phase 6 TUI placeholder 边界保持。新增和调整 `tests/cli-runtime.test.ts`、`tests/cli-providers.test.ts`、`tests/cli-chat.test.ts` 和 `tests/cli-sessions.test.ts`，并保持已完成 CLI/TUI 边界测试同步。代码审查通过，无阻断问题。验证命令：`pnpm exec vitest run tests/cli-runtime.test.ts`、`pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts tests/cli-chat.test.ts tests/cli-sessions.test.ts tests/cli-run.test.ts tests/cli-help.test.ts tests/opencode-managed-runtime.test.ts tests/opencode-attached-runtime.test.ts`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`（29 个测试文件、235 个用例）和 `pnpm run build`，全部通过；`git diff --check` 也通过。残余风险：独立 CLI 无法停止不由当前进程拥有的 managed child，managed stop 仍需当前进程 ownership 或未来长生命周期控制面支持。
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
- 2026-05-19：完成 Phase 2.5 SQLite 存储第一组最小闭环；新增 `better-sqlite3` 与 `@types/better-sqlite3` 依赖、`pnpm-workspace.yaml` native build approval、`src/storage/constants.ts`、`src/storage/types.ts`、`src/storage/sqlite-types.ts`、`src/storage/sqlite.ts` 和 `tests/storage-sqlite.test.ts`，并扩展 storage barrel exports。实现范围包含数据库目录创建、SQLite 打开、migration 版本表 `agentproxy_schema_migrations`、初始 schema migration、providers/runtimes/sessions/session_events 表、基础 repository CRUD、JSON metadata/payload 存取、`STORAGE_ERROR` 错误映射、重复 migration 安全性、`(provider_id, provider_session_id)` 唯一约束和 tombstone 保留验证；审查后修复普通 `sessions.upsert()` 可能清空既有 tombstone 的阻塞问题，并补回归测试。验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：破坏性 migration 备份机制仍未实现，Gate 2 尚未通过；本阶段未实现 OpenCode runtime 生命周期、OpenCodeProvider 核心能力、CLI MVP 或 TUI。
- 2026-05-19：同步 Phase 2.5 完成后的最新开发状态与下次启动提示词，明确当前已完成项、未完成项、最新阶段实现提交 `accfc66`，以及下一步应从破坏性 migration 备份机制或 Gate 2 验收继续。
- 2026-05-20：完成 Phase 2.5 破坏性 migration 备份机制；新增 `src/storage/migrations.ts`，将 SQLite migration 抽为显式 descriptor 列表，支持 pending destructive migration 前临时备份 SQLite 主文件及 WAL/SHM/journal sidecar，失败时关闭连接、恢复备份并以 `STORAGE_ERROR` 退出，成功迁移或成功恢复后清理临时备份；更新 `src/storage/sqlite.ts` 和 `src/storage/index.ts` 复用 migration runner，并在 `tests/storage-sqlite.test.ts` 覆盖 destructive migration 成功清理、两段式 destructive migration 失败回滚、迁移记录不落库和升级前 provider 数据保留。验证命令：`pnpm exec vitest run tests/storage-sqlite.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。Gate 2 已通过；本阶段未实现 OpenCode runtime 生命周期、OpenCodeProvider 核心能力、CLI MVP 或 TUI。
- 2026-05-20：同步最新开发状态与下次启动提示词；明确最新阶段实现提交为 `be38473 阶段进展：完成 Phase 2.5 破坏性 migration 备份机制`，Gate 2 已通过，第一个未完成项为 Phase 3.1 OpenCode Binary 探测；若后续最新提交是文档同步提交，应继续以 `be38473` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 3.1 OpenCode Binary 探测；新增 `src/providers/opencode/binary.ts` 和 `src/providers/opencode/constants.ts`，实现从配置或 `PATH` 定位 `opencode`、执行 `--version`、规范化版本号、最低支持版本 `1.0.0` 检查、缺失/不可执行 binary、`--version` 失败、不可解析版本输出和低版本的 `PROVIDER_UNAVAILABLE` 映射，并给出安装或升级建议；新增 `tests/opencode-binary.test.ts`，使用 fake binary 覆盖默认 PATH、显式绝对路径、显式命令名、显式相对路径优先、普通/v 前缀/带预发布版本输出、缺失、不可执行、非零退出、不可解析输出和低版本。代码审查发现显式 `./opencode` 曾可能被 `PATH` 劫持，已修复为相对路径按 `cwd` 解析为绝对路径，并让 PATH 查找和执行共用 effective env、兼容 `PATH`/`Path`。验证命令：`pnpm exec vitest run tests/opencode-binary.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Gate 3 尚未通过；本阶段未实现 Runtime Registry、managed/attached runtime 启停、OpenCodeProvider 核心能力、CLI MVP 或 TUI。
- 2026-05-20：同步 Phase 3.1 完成后的最新开发状态与下次启动提示词；明确最新阶段实现提交为 `a001f95 阶段进展：完成 Phase 3.1 OpenCode Binary 探测`，Gate 3 尚未通过，第一个未完成项为 Phase 3.2 Runtime Registry；若后续最新提交是文档同步提交，应继续以 `a001f95` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 3.2 Runtime Registry；新增 `src/runtimes/registry.ts` 和 `src/runtimes/index.ts`，在现有 SQLite runtime repository 之上实现 storage-backed `RuntimeRegistry`，支持持久化 managed/attached runtime 元数据、记录状态机状态、保留 base URL/host/port/PID/workspace/mode/startedAt/stoppedAt，并在 metadata 中记录 `registeredAt`、`updatedAt`、stale 标记和 metadata-only stale action。新增 `tests/runtime-registry.test.ts` 覆盖 managed 与 attached 可区分、状态更新保留注册时间和既有 metadata、provider/workspace/status/mode list 查询、stale cleanup 将 managed active metadata 标记为 `failed`、attached active metadata 标记为 `detached` 且不删除记录/不 kill 或 stop attached runtime、runtime 从 stopped 重新 active 时清除旧 `stoppedAt`、非法 stale TTL 映射为 `CONFIG_INVALID`。代码审查指出旧 `stoppedAt` 继承和 0/负数/Infinity stale TTL 会导致后续启动协调误判，已修复并更新 `tasks/lessons.md`。验证命令：`pnpm exec vitest run tests/runtime-registry.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Gate 3 尚未通过；本阶段未实现 `opencode serve` managed 启动、attached health check、runtime stop、OpenCodeProvider 核心能力、CLI MVP 或 TUI；stale cleanup 仅基于 registry timestamp 和 mode 更新本地 metadata，不检查或回收真实进程。
- 2026-05-20：同步 Phase 3.2 完成后的最新开发状态与下次启动提示词；明确最新阶段实现提交为 `88a3c9e 阶段进展：完成 Phase 3.2 Runtime Registry`，Gate 3 尚未通过，第一个未完成项为 Phase 3.3 Managed Runtime；若后续最新提交是文档同步提交，应继续以 `88a3c9e` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 3.3 Managed Runtime；新增 `src/runtimes/managed.ts` 并扩展 `src/runtimes/index.ts`，实现 OpenCode managed runtime manager：复用 Phase 3.1 binary probe，启动 `opencode serve --hostname 127.0.0.1 --port <port>`，默认绑定 `127.0.0.1`，默认端口被占用时选择空闲端口，轮询 `GET /global/health`，将启动前退出映射为 `RUNTIME_START_FAILED`，将 health 超时映射为 `RUNTIME_HEALTH_FAILED`，只停止当前 manager 拥有的 managed child process，并在正常停止、启动失败、health 超时和健康后异常退出时回写 registry 状态与 exit metadata。新增 `tests/opencode-managed-runtime.test.ts`，使用 fake OpenCode binary 和真实 HTTP health endpoint 覆盖启动到 `healthy`、端口冲突不 kill 占用方、启动前退出进入 `failed`、health 超时进入 `failed` 并终止 child、owned managed stop 进入 `stopped`、attached runtime stop 被拒绝且不变更记录、健康 child 异常退出后状态更新为 `failed`；代码审查后补充 active runtimeId 冲突保护、attached ID 碰撞保护、并发同 ID 启动 reservation 和 health 成功后短稳定窗口，防止重复 ID 覆盖 child ownership 或已退出进程被写回 `healthy`。验证命令：`pnpm exec vitest run tests/opencode-managed-runtime.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Gate 3 尚未通过；本阶段未实现 Phase 3.4 attached runtime、event stream、OpenCodeProvider 核心 session/model/message 能力、CLI MVP 或 TUI；空闲端口选择仍存在常见的探测后绑定竞态，失败时由启动/health 错误路径处理。
- 2026-05-20：同步 Phase 3.3 完成后的最新开发状态与下次启动提示词；明确最新阶段实现提交为 `23e79ca 阶段进展：完成 Phase 3.3 Managed Runtime`，Gate 3 尚未通过，第一个未完成项为 Phase 3.4 Attached Runtime；若后续最新提交是文档同步提交，应继续以 `23e79ca` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 3.4 Attached Runtime；新增 `src/runtimes/attached.ts` 并扩展 `src/runtimes/index.ts`，实现 OpenCode attached runtime manager：支持显式 `serverUrl` 输入并规范化为不含 query/hash/credentials 的 base URL，拒绝带 username/password 的 server URL，连接 `/global/health` 并对 `{ healthy: true, version }` 形态做 best-effort OpenCode-like 校验，连接成功后以 `attached` mode 和 `healthy` status 写入 `RuntimeRegistry`。支持从 registry 中重新发现已有 attached runtime 并做 health revalidation；非 localhost attached URL 会通过 `onWarning` 和 runtime metadata 暴露 `NON_LOCALHOST_ATTACHED_RUNTIME` warning；`stopAttachedRuntime` 只把本地 OpenCode attached runtime 记录转为 `detached` 并记录 `detach_only`，不启动、不 kill、不回收外部进程。新增 `tests/opencode-attached-runtime.test.ts`，使用真实本地 HTTP fake OpenCode health endpoint 覆盖显式 server URL、registry 重新 attach、active managed runtimeId 碰撞保护、并发 attached runtimeId reservation、pre-aborted signal、非 OpenCode-looking health 拒绝、非 localhost warning 脱敏、attached detach-only stop、非 OpenCode provider detach 拒绝、URL credentials 拒绝脱敏和 invalid URL 不保留原始 cause。代码和安全复审未发现阻断问题。验证命令：`pnpm exec vitest run tests/opencode-attached-runtime.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Gate 3 尚未通过；本阶段未实现 event stream、runtime 诊断、OpenCodeProvider 核心 session/model/message 能力、CLI MVP 或 TUI；OpenCode health body 形态仍需后续 real OpenCode smoke test 校准；远程 attached URL 是显式信任边界，本地 CLI 之外的调用方后续需要 opt-in 或 allowlist；runtimeId reservation 仍是进程内保护，多进程共享 SQLite 时需要 DB 级协调。
- 2026-05-20：同步 Phase 3.4 完成后的最新开发状态与下次启动提示词；明确最新阶段实现提交为 `90b71f0 阶段进展：完成 Phase 3.4 Attached Runtime`，Gate 3 尚未通过，第一个未完成项为 Phase 3.5 Event Stream；若后续最新提交是文档同步提交，应继续以 `90b71f0` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 3.5 Event Stream；新增 `src/runtimes/events.ts` 并扩展 `src/runtimes/index.ts`，实现 runtime 层 `OpenCodeEventStreamClient`：按 OpenCode 官方 `/event` SSE 路由建立事件流连接，使用内置 `fetch` 和 Web Stream 解析 SSE，不新增依赖；将保守识别的 `message.part.delta`、`session.next.text.delta`、`session.status`、`permission.*`、`file.edited` 和 session error 事件转换为稳定 `AgentEventEnvelope`，未知事件保留为 `provider.raw_event` 并保留 `raw`；断线时写回 runtime `degraded`，有限 backoff 重连时写回 `reconnecting`，重连成功恢复 `healthy`，并提供 session status 补偿 hook；重试耗尽映射为 `EVENT_STREAM_INTERRUPTED` 且错误详情不包含 URL query secret。新增 `tests/opencode-event-stream.test.ts`，使用真实本地 HTTP fake SSE server 覆盖 `/event` 连接、envelope 包装、未知事件保留、断线不把 session 标记为 failed、有限重连、状态补偿 hook、重试耗尽错误映射、stopped/detached/replaced runtime 不被事件流复活、提前取消会关闭 SSE 连接、current/legacy permission 字段兼容和非法 retry/timeout 选项拒绝。代码审查后修复 runtime generation guard、reader cancellation、permission 字段兼容和数值选项校验。验证命令：`pnpm exec vitest run tests/opencode-event-stream.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。未解决风险：Gate 3 尚未通过；本阶段未实现 runtime 诊断、OpenCodeProvider 核心 session/model/message 能力、CLI MVP 或 TUI；后续仍需 real OpenCode smoke test 校准生产事件 payload 和 session status 补偿语义。
- 2026-05-20：同步 Phase 3.5 完成后的最新开发状态与下次启动提示词；明确最新阶段实现提交为 `a9edb4a 阶段进展：完成 Phase 3.5 Event Stream`，Gate 3 尚未通过，第一个未完成项为 Phase 3 runtime 诊断和 Gate 3 汇总验证；若后续最新提交是文档同步提交，应继续以 `a9edb4a` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 3 runtime 诊断和 Gate 3 汇总验证；新增 `src/runtimes/diagnostics.ts` 并扩展 `src/runtimes/index.ts`，实现 runtime 层 `OpenCodeRuntimeDiagnostics`：复用 binary probe、Runtime Registry、managed runtime manager、`/global/health` 和 `/event`，输出结构化 per-check 诊断、summary counts、Gate 3 capability 汇总和脱敏详情，供后续 `agentproxy doctor` 复用但本阶段不实现 CLI doctor。新增 `tests/opencode-runtime-diagnostics.test.ts`，覆盖缺失 binary 作为 failed check 返回且不抛出、健康 registry runtime 的 health/event stream 检查、managed smoke start/health/event/stop 通过 Gate 3、URL credentials/query secret 脱敏、显式 runtime 缺 base URL 失败、health body 超时、SSE media type 精确匹配和 fetch 错误信息脱敏。代码审查后修复 health response body 不受 timeout 覆盖、managed smoke 子进程清理防线不足、显式 runtime 无 base URL 被 skip、SSE content-type 过宽、response body cancel 错误覆盖稳定错误码和 diagnostic message 脱敏不足。验证命令：`pnpm exec vitest run tests/opencode-runtime-diagnostics.test.ts`、`pnpm exec vitest run tests/opencode-binary.test.ts tests/runtime-registry.test.ts tests/opencode-managed-runtime.test.ts tests/opencode-attached-runtime.test.ts tests/opencode-event-stream.test.ts tests/opencode-runtime-diagnostics.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`，结果均通过。Gate 3 已通过；本阶段未实现 OpenCodeProvider 核心 session/model/message 能力、CLI MVP、真实 `agentproxy doctor` 或 TUI。未解决风险：后续仍需 real OpenCode smoke test 校准生产 `/global/health` 和 `/event` 行为；runtime 诊断目前是可复用服务层，不是最终用户 CLI。
- 2026-05-20：同步 Phase 3 runtime 诊断和 Gate 3 完成后的最新开发状态与下次启动提示词；明确最新阶段实现提交为 `31e5b34 阶段进展：完成 Phase 3 runtime 诊断与 Gate 3 验证`，Gate 3 已通过，第一个未完成项为 Phase 4 OpenCodeProvider 核心能力；若后续最新提交是文档同步提交，应继续以 `31e5b34` 作为最近阶段实现基线。
- 2026-05-20：补强最新开发状态摘要；新增阶段总览表，明确 Phase 0.2、Phase 1、Phase 2、Phase 3 已完成，Phase 4 至 Phase 9 未完成，并在下次启动提示词中同时记录最新阶段实现提交 `31e5b34` 和最新文档同步提交 `8120023`，便于后续会话继续跟踪。
- 2026-05-20：完成 Phase 4.1 OpenCodeProvider Health 与 Capability provider-layer；新增 `src/providers/opencode/probe.ts` 并扩展 `src/providers/opencode/index.ts`，让 `OpenCodeProvider.healthCheck()` 和 `getCapabilities()` 通过 provider-layer probe 复用 Phase 3 binary、`/global/health` 和 `/event` 边界，返回 healthy/degraded/unhealthy、provider version、runtime openApi/sse/sdk capability 和 provider-specific endpoint metadata。新增 `tests/opencode-provider-health.test.ts`，覆盖 fake healthy server、无 runtime base URL 降级、缺失 binary unhealthy、URL query 脱敏、health body timeout、OpenAPI/method capability 不误报、provider-controlled header 规范化、raw health payload 不落 metadata、未实现的 session/message/TUI 操作不提前声明为顶层 capability；更新默认 provider registry 测试适配 Phase 4 probe metadata。代码审查后修复 health body timeout 覆盖不足、health 成功误推 OpenAPI、缺少 `Allow` 时误报 mutating endpoint、binary-only 提前声明 headlessRun 和 raw header 回传问题，并将可复用规则写入 `tasks/lessons.md`。验证命令：`pnpm exec vitest run tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过。Gate 4 尚未通过；本阶段未实现 `providers inspect` CLI、model list、session sync、message sending、passthrough 或 TUI。未解决风险：真实 OpenCode API endpoint 形态仍需后续 smoke 校准；CLI wrapper 由 Phase 5 `providers inspect` 实现。
- 2026-05-20：同步 Phase 4.1 完成后的最新开发状态；明确当前启动基线和最新阶段实现提交为 `9b33178 阶段进展：完成 Phase 4.1 OpenCodeProvider Health 与 Capability`，最新文档同步提交为 `f81c4fc 文档：同步 Phase 4.1 完成状态与下次启动提示`，Gate 4 尚未通过，第一个未完成项为 Phase 4.2 Model 与 Provider 列表；若后续最新提交是文档同步提交，应继续以 `9b33178` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 4.2 Model 与 Provider 列表；新增 `src/providers/opencode/models.ts` 并扩展 `src/providers/opencode/index.ts`，实现 `OpenCodeProvider.listModels()`：通过只读 `GET /provider` 获取 OpenCode provider/model 数据，映射为稳定 `ModelRef`，使用 `provider/model` 形式保留模型 ID，设置 displayName、family、contextWindowTokens，并在 `metadata.opencode` 中白名单保留 provider API/npm/env 名称、connected/default 状态、模型 release/status/capability/cost/limit/modalities/provider 信息。新增 `tests/opencode-provider-models.test.ts`，覆盖健康 fake `/provider` 映射、从 context metadata 读取 runtime base URL、空模型返回空数组、缺 runtime base URL、带 credentials/query 的 runtime URL 拒绝且不泄漏、401 未认证映射 `PERMISSION_DENIED`、畸形响应映射 `PROVIDER_UNAVAILABLE` 且不泄漏 raw payload、hanging body timeout。代码审查后修复 OpenCode 当前 schema 中 provider 字段为 `api` 而非 `source`、`limit.context/output` 未收窄可能携带异常 secret 对象的问题，并明确丢弃 `options`/`headers` 原始字段。验证命令：`pnpm exec vitest run tests/opencode-provider-models.test.ts tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过。Gate 4 尚未通过；本阶段未实现 session sync、session create/resume、message sending、passthrough、CLI provider list/doctor 或 TUI。未解决风险：真实 OpenCode `/provider` 响应仍需后续 smoke 校准；当前实现只做 provider-layer 模型列表，不保存 model selection。
- 2026-05-20：同步 Phase 4.2 完成后的最新开发状态和下次启动提示词；明确最新阶段实现提交为 `4473dbd 阶段进展：完成 Phase 4.2 Model 与 Provider 列表`，Gate 4 尚未通过，第一个未完成项为 Phase 4.3 Session 同步；若后续最新提交是文档同步提交，应继续以 `4473dbd` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 4.3 Session 同步；新增 `src/providers/opencode/sessions.ts` 并扩展 `src/providers/opencode/index.ts`，实现 `OpenCodeProvider.listSessions()`：通过只读 `GET /session` 获取 OpenCode session 列表，best-effort 读取 `GET /session/status`，映射为稳定 `ProviderSession`，保留 provider session id、workspace、title、status、createdAt/updatedAt/lastRunAt、parentProviderSessionId 和 `provider/model` 形式 model selection，并在 `metadata.opencode` 中白名单保留 projectId、directory、version、model、shared、compactingAt 和 status type；新增 `src/sessions/sync.ts`，实现 provider-agnostic `syncProviderSessions()`，支持导入本地没有的 provider session、按全局 `(providerId, providerSessionId)` 更新既有索引、保留本地 workspace 与 tombstone、记录 provider workspace 冲突、默认跳过 partial list 的 missing pass，并在 `missingDetection: "completeProviderList"` 显式开启时标记 `missing_in_provider`。新增 `tests/opencode-provider-sessions.test.ts` 和 `tests/session-sync.test.ts`，并扩展 provider health 测试，覆盖 session 映射、状态映射、workspace query、认证/缺 runtime/异常响应错误码、transcript/summary/secret 不持久化、tombstone 不复活、workspace 过滤、跨 workspace 唯一键匹配、GET `/session` 405 不误报 capability。代码审查后修复 partial provider list 误标 missing、跨 workspace 唯一约束冲突、405 capability 误报、session model 未映射和 summary 持久化问题，并将规则写入 `tasks/lessons.md`。验证命令：`pnpm exec vitest run tests/opencode-provider-sessions.test.ts tests/session-sync.test.ts tests/opencode-provider-health.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过。Gate 4 尚未通过；本阶段未实现 session create/resume、message sending、session operations、passthrough、CLI provider list/doctor 或 TUI。未解决风险：真实 OpenCode `/session` 响应仍需后续 smoke 校准；同步写入目前不是单事务批量写入，后续大列表或失败恢复可再增强。
- 2026-05-20：同步 Phase 4.3 完成后的最新开发状态和下次启动提示词；明确最新阶段实现提交为 `38cf241 阶段进展：完成 Phase 4.3 Session 同步`，Gate 4 尚未通过，第一个未完成项为 Phase 4.4 Session 创建与恢复；若后续最新提交是文档同步提交，应继续以 `38cf241` 作为最近阶段实现基线。
- 2026-05-20：完成 Phase 4.4 Session 创建与恢复；扩展 `src/providers/opencode/sessions.ts` 和 `src/providers/opencode/index.ts`，实现 `OpenCodeProvider.getSession()`、`startSession()`、`resumeSession()`：使用 OpenCode `POST /session` 创建 session、`GET /session/:id` 恢复 provider session metadata、`POST /session/:id/prompt_async` 做创建/恢复后的异步 prompt 接受，不实现 Phase 4.5 的完整 `sendMessage` 事件流。新增 `src/sessions/lifecycle.ts` 并扩展 `src/sessions/index.ts`，实现 `startAgentProxySession()` 和 `resumeAgentProxySession()`：生成 AgentProxy session id，持久化 providerSessionId 映射、workspace path、runtimeId、source-of-truth metadata、requested model metadata 和 parentSessionId；创建后初始 prompt 采用 create -> persist -> resume prompt 流程，prompt 失败时保留本地 mapping 并只写脱敏 `lastError`，避免 provider orphan session。扩展 `src/providers/opencode/probe.ts`，只在 method probe 为 2xx/405 且 Allow 匹配时声明 session create/resume capability。新增 `tests/session-lifecycle.test.ts`，扩展 `tests/opencode-provider-sessions.test.ts` 和 `tests/opencode-provider-health.test.ts`，覆盖 create/resume/get、prompt_async 成功与失败、provider session id mismatch 防护、父 session 存在/未 tombstone/provider 匹配、provider-returned tombstone parent 防护、tombstone 不复活、workspace 冲突记录、prompt/secret 不持久化和 Allow probe 正反路径。代码和安全审查后修复 resume/get mismatch 可能把 prompt 发到错误 session、初始 prompt 失败可能留下本地未知 provider session、父 session 校验不足、provider-returned tombstone parent、requested model 与 provider-confirmed model 混淆、Allow header 过度信任等问题，并将规则写入 `tasks/lessons.md`。验证命令：`pnpm exec vitest run tests/opencode-provider-sessions.test.ts tests/session-lifecycle.test.ts tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过。Gate 4 尚未通过；本阶段未实现完整 message event stream、session operations、passthrough、CLI MVP 或 TUI。未解决风险：真实 OpenCode `prompt_async` 和 session get 响应仍需后续 smoke 校准；`session.model` 仅保存 provider-confirmed model，用户请求模型保留在 `metadata.lifecycle.requestedModel`。
- 2026-05-20：文档同步 Phase 4.4 后的最新开发状态；将顶部最新阶段实现提交、当前启动基线和下次启动提示词校准为 `aaa3dee 阶段进展：完成 Phase 4.4 Session 创建与恢复`，明确第一个未完成项仍为 Phase 4.5 Message 发送与事件映射，Gate 4 尚未通过。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现 Phase 4.5、CLI MVP 或 TUI。
- 2026-05-20：完成 Phase 4.5 Message 发送与事件映射；扩展 `src/providers/opencode/sessions.ts`、`src/providers/opencode/index.ts` 和 `src/providers/types.ts`，实现 `OpenCodeProvider.sendMessage()`：发送前先订阅 OpenCode `/event`，通过 `POST /session/:id/message` 发送 text prompt，可选 `provider/model` model 解析，返回 `AsyncIterable<AgentEvent>`，并将缺 runtime、认证失败、session missing、pre-abort 和异常响应映射为稳定错误码。扩展 `src/runtimes/events.ts`，导出可复用 SSE response -> AgentProxy envelope 映射，补充 OpenCode sync 事件、tool start/finish、`session.diff` 和未知事件 `provider.raw_event` 映射；`session.next.step.ended.1` 不作为 terminal，严格 message stream 只处理显式匹配目标 `sessionID` 的 provider 事件。新增 `src/sessions/messages.ts` 并扩展 `src/sessions/index.ts`，实现 provider-agnostic `sendAgentProxyMessage()`：要求本地 mapping 存在且未 tombstone，发送期间标记 session `running`，终态或消费者提前取消时持久化为 `completed`/`failed`，并向 `session_events` 写入脱敏事件投影。新增 `tests/opencode-provider-messages.test.ts` 和 `tests/session-messages.test.ts`，扩展 `tests/opencode-provider-health.test.ts`，覆盖 fake server headless message、permission 不自动 approve、事件映射、错误脱敏、本地状态持久化、tombstone 防护、无 session raw event 过滤、early return 状态回写、headlessRun capability 负矩阵和不持久化 prompt/transcript/tool/diff/raw payload。验证命令：`pnpm exec vitest run tests/opencode-provider-messages.test.ts tests/session-messages.test.ts`、`pnpm exec vitest run tests/opencode-event-stream.test.ts tests/opencode-provider-health.test.ts tests/opencode-provider-sessions.test.ts tests/session-lifecycle.test.ts tests/session-messages.test.ts tests/opencode-provider-messages.test.ts`、`pnpm exec vitest run tests/opencode-provider-messages.test.ts tests/session-messages.test.ts tests/opencode-provider-health.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过。Gate 4 尚未通过；本阶段未实现 Phase 4.6 session abort/delete/export/import/share/unshare、Phase 4.7 passthrough、CLI MVP 或 TUI。未解决风险：真实 OpenCode `/session/:id/message` 与 `/event` 的时序仍需后续 smoke 校准；positional/stdin prompt 在本层表示为已组合的 `SendMessageRequest.prompt`，真实 CLI 参数与 stdin 拼接留到 Phase 5。
- 2026-05-20：文档同步 Phase 4.5 后的最新开发状态；将顶部最新阶段实现提交、当前启动基线和下次启动提示词校准为 `76a976f 阶段进展：完成 Phase 4.5 Message 发送与事件映射`，明确第一个未完成项为 Phase 4.6 Session 操作，Gate 4 仍未通过。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现 Phase 4.6、Provider Passthrough、CLI MVP 或 TUI。
- 2026-05-20：完成 Phase 4.6 Session 操作；扩展 `src/providers/types.ts`、`src/providers/opencode/probe.ts`、`src/providers/opencode/sessions.ts` 和 `src/providers/opencode/index.ts`，实现 `OpenCodeProvider.abortSession()`、`deleteSession()`、`exportSession()`、`importSession()`、`shareSession()`、`unshareSession()`：abort/delete/share/unshare 使用 OpenCode server API，export/import 使用 OpenCode 原生命令边界并复用 binary 探测，raw export 必须显式确认，export result 标记 `sanitized`。新增 `src/sessions/actions.ts` 并扩展 `src/sessions/index.ts`，实现 provider-agnostic session operation service：delete 要求确认并写本地 tombstone，import 持久化 provider-to-local mapping，share/unshare 只存储 `shared` 状态和时间，不把 share URL 写入 SQLite，export 不持久化 payload。新增 `tests/opencode-provider-session-actions.test.ts` 和 `tests/session-actions.test.ts`，扩展 `tests/opencode-provider-health.test.ts`，覆盖 fake server 操作、CLI export/import、稳定错误码、raw export confirmation、本地 tombstone、tombstone 防护、share URL 不落库、import source 不落库和 capability 矩阵。验证命令：`pnpm exec vitest run tests/opencode-provider-session-actions.test.ts tests/session-actions.test.ts tests/opencode-provider-health.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过。Gate 4 尚未通过；本阶段未实现 Phase 4.7 provider passthrough、CLI MVP、TUI、permission approval、diff/revert/todo 或 generic passthrough。未解决风险：真实 OpenCode import/export stdout 形态仍需后续 smoke 校准；export/import 当前是窄 OpenCode provider operation，不等同于 Phase 4.7 passthrough。
- 2026-05-20：文档同步 Phase 4.6 后的最新开发状态；将顶部最新阶段实现提交、当前启动基线和下次启动提示词校准为 `a018f82 阶段进展：完成 Phase 4.6 Session 操作`，明确第一个未完成项为 Phase 4.7 Provider Passthrough，Gate 4 仍未通过。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现 Phase 4.7、CLI MVP 或 TUI。
- 2026-05-20：完成 Phase 4.7 Provider Passthrough；新增 `src/providers/opencode/passthrough.ts`，扩展 `src/providers/opencode/binary.ts`、`src/providers/opencode/probe.ts`、`src/providers/opencode/index.ts` 和 `src/cli/index.ts`，实现 `OpenCodeProvider.passthrough()` 和窄范围 `agentproxy provider exec opencode -- <native args>`：复用 OpenCode binary 定位但不预执行 `--version`，`--` 后原生命令参数原样传递，provider stdout/stderr 原样返回并由 CLI 转发，provider 原始退出码写入 `process.exitCode`，signal 退出映射为常见 shell code，workspace path 控制 child cwd，child env 只包含执行所需基础 env 和显式 allowlist `OPENCODE_*` passthrough env。新增 `tests/opencode-provider-passthrough.test.ts` 和 `tests/cli-provider-exec.test.ts`，覆盖 native args、stdout/stderr、非零 exit code、signal exit code、workspace override、相对 binary 按 workspace 解析、missing binary 稳定错误、parent secret 不进入 binary 定位或 native child、无 preflight `--version`、AgentProxy diagnostic 脱敏、默认无 timeout 慢命令和 17MiB provider 输出不被隐式 buffer cap 截断。代码审查后修复 binary probe 绕过 env allowlist 和隐式 timeout/output cap 改写 native 行为两个阻断问题，并将规则写入 `tasks/lessons.md`；二次审查无阻断问题。验证命令：`pnpm exec vitest run tests/opencode-provider-passthrough.test.ts tests/cli-provider-exec.test.ts`、`pnpm exec vitest run tests/opencode-provider-passthrough.test.ts tests/cli-provider-exec.test.ts tests/cli-help.test.ts tests/config-resolver.test.ts tests/opencode-binary.test.ts`、`pnpm exec vitest run tests/opencode-provider-session-actions.test.ts tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 23 个测试文件、166 个用例通过。Gate 4 尚未通过；下一步只做 Gate 4 汇总验证，不进入 CLI MVP 或 TUI。未解决风险：真实 OpenCode passthrough 行为仍需后续 smoke 校准；当前 provider result 仍按 `PassthroughResult` 契约缓冲返回 stdout/stderr，CLI 层未实现 streaming。
- 2026-05-20：文档同步 Phase 4.7 后的最新开发状态；将顶部最新阶段实现提交、当前启动基线和下次启动提示词校准为 `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`，明确第一个未完成项为 Gate 4 汇总验证，Gate 4 仍未通过。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档，不实现 Gate 4、CLI MVP 或 TUI。
- 2026-05-21：完成 Gate 4 汇总验证；未新增 provider/runtime/CLI MVP/TUI 行为，仅验证并记录 Phase 4.1-4.7 provider-layer 闭环。聚焦验证命令：`pnpm exec vitest run tests/opencode-provider-health.test.ts tests/opencode-provider-models.test.ts tests/opencode-provider-sessions.test.ts tests/session-sync.test.ts tests/session-lifecycle.test.ts tests/opencode-provider-messages.test.ts tests/session-messages.test.ts tests/opencode-provider-session-actions.test.ts tests/session-actions.test.ts tests/opencode-provider-passthrough.test.ts tests/cli-provider-exec.test.ts tests/provider-registry.test.ts tests/opencode-event-stream.test.ts`，结果为 13 个测试文件、80 个用例通过。完整验证命令：`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 23 个测试文件、166 个用例通过。Gate 4 已通过；下一步第一个未完成项为 Phase 5 CLI MVP，不进入 TUI。未解决风险：当前验证使用 fake OpenCode server/binary，真实 OpenCode smoke 校准仍作为后续兼容性任务。
- 2026-05-21：文档同步 Gate 4 后的最新开发状态；将顶部当前启动基线和下次启动提示词校准为具体提交 `549a979 阶段进展：完成 Gate 4 汇总验证`，明确已完成项包含 Gate 4，未完成项从 Phase 5 CLI MVP 开始，且下次启动不要进入 TUI。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现 Phase 5 CLI MVP 或 TUI。
- 2026-05-21：同步 Phase 5 启动前最新开发状态；确认当前最新提交为文档同步提交 `5669a57 文档：同步 Phase 5.1 启动前状态与计划`，Gate 4 阶段门禁基线仍为 `549a979 阶段进展：完成 Gate 4 汇总验证`，最新 Phase 4 实现基线仍为 `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`。已将已完成/未完成摘要校准为：Phase 5 CLI MVP 尚未实现，TUI 尚未进入，Phase 5.1 CLI Framework Foundation 只完成实现前计划/check-in，计划保存在 `tasks/todo.md`；下一次启动应从 Phase 5.1 共享 CLI 框架与输出契约开始。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新文档和任务跟踪，不实现 Phase 5.1、Phase 5.2+ 或 TUI。
- 2026-05-21：完成 Phase 5.1 CLI Framework Foundation；在 `src/cli/index.ts` 收口共享 CLI 全局选项、嵌套命令 flag 解析、help/routing、human/JSON 错误格式、稳定退出码和 `main()` parse error 处理，保留 `agentproxy provider exec opencode -- <native args>` 的 provider stdout/stderr/原始 exit code 透传，不实现真实 `doctor`、`run`、`sessions`、`runtime`、`config` 业务命令或 TUI。新增/扩展 `tests/cli-help.test.ts` 和 `tests/cli-provider-exec.test.ts`，覆盖每个命令 help、嵌套全局 flags、JSON 错误 stdout、human 诊断 stderr、Commander parse error 脱敏和参数错误退出码 `2`、稳定退出码映射、JSON provider lookup 错误脱敏，以及 passthrough 回归。验证命令：`pnpm exec vitest run tests/cli-help.test.ts tests/cli-provider-exec.test.ts`、`pnpm exec vitest run tests/cli-help.test.ts tests/cli-provider-exec.test.ts tests/config-resolver.test.ts tests/logging.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 23 个测试文件、172 个用例通过。代码审查未发现阻断问题。未解决风险：Phase 5 CLI MVP 其余真实业务命令仍未实现，下一步从 Phase 5.2 `doctor` CLI 工作流继续；真实 OpenCode smoke 校准仍留作后续兼容性任务。
- 2026-05-21：文档同步 Phase 5.1 后的最新开发状态；将顶部当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词校准为 `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation`，明确第一个未完成项为 Phase 5.2 `doctor` CLI 工作流，TUI 尚未进入。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现 Phase 5.2、后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5.2 Doctor CLI 工作流；新增 `src/cli/doctor.ts` 并扩展 `src/cli/index.ts`，将 `agentproxy doctor` 从 planned placeholder 切换为真实诊断命令。实现范围包含 Node.js 版本、AgentProxy config、SQLite 读写、OpenCode config、OpenCode binary/version、runtime registry/health/event stream、OpenCode server health、provider list capability、MCP status 和 workspace Git 状态检查；复用 Phase 3 runtime diagnostics 与 Phase 4 provider health/capability probe；支持 `--json` 单对象报告、human report、缺失依赖建议、secret/URL 脱敏、稳定退出码和显式 `--managed-smoke` 诊断选项。新增 `tests/cli-doctor.test.ts`，扩展 `tests/cli-help.test.ts` 和 `tests/opencode-runtime-diagnostics.test.ts`，覆盖成功 JSON doctor report、missing binary、config failure、storage failure、storage probe 不覆盖真实 provider 记录、terminal runtime 默认跳过、Node 版本失败退出码、Git status 失败 warning、secret redaction 和 doctor 不再返回 `CAPABILITY_UNSUPPORTED` placeholder。代码审查后修复固定 storage probe id、terminal runtime 误探测、Node 失败无稳定错误码、Git status 失败误报 clean、help planned 文案等问题。验证命令：`pnpm exec vitest run tests/cli-doctor.test.ts tests/cli-help.test.ts`、`pnpm exec vitest run tests/cli-doctor.test.ts tests/cli-help.test.ts tests/cli-provider-exec.test.ts tests/opencode-runtime-diagnostics.test.ts tests/opencode-provider-health.test.ts`、`pnpm exec vitest run tests/cli-doctor.test.ts tests/opencode-runtime-diagnostics.test.ts tests/cli-help.test.ts tests/cli-provider-exec.test.ts`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 24 个测试文件、182 个用例通过。未解决风险：真实 OpenCode doctor smoke 校准仍留作后续兼容性任务；`run`、`sessions`、`providers inspect/list`、`runtime`、`config` 和完整 TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5.2 后的最新开发状态；将顶部当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词校准为 `c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`，明确第一个未完成项为 Phase 5.3 Run 与 Chat 中的 `run [prompt]` 最小工作流，TUI 尚未进入。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现 Phase 5.3、后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5.3 `run [prompt]` 最小工作流；新增 `src/cli/run.ts` 和 `tests/cli-run.test.ts`，扩展 `src/cli/index.ts`、`src/runtimes/selection.ts`、`src/runtimes/managed.ts` 与 OpenCode provider/runtime exports。实现范围包含 positional/stdin prompt 读取、provider/model/workspace/config 覆盖校验、配置或 registry runtime base URL 选择、managed one-shot runtime 启停、AgentProxy session 映射持久化、`sendAgentProxyMessage()` 事件流消费、human 输出终端安全净化、`--json` 单对象 redacted event summary，以及 missing prompt/runtime/provider/model 的稳定错误路径；`chat`、`sessions`、`runtime`、`config`、`providers list/inspect` 和完整 TUI 仍保持 planned placeholder。安全审查后修复 JSON transcript 泄漏、human 输出控制字符、managed run 继承完整 parent env、prompt/event 无界积累；代码审查后修复 session 创建前 `--model` 校验、registry runtime 实际 mode 回报、prompt trim 后发送、provider failed session 仍 exit 0、timeout abort 被收成 completed 等问题，并将终态规则写入 `tasks/lessons.md`。验证命令：`pnpm exec vitest run tests/cli-run.test.ts`、`pnpm exec vitest run tests/cli-run.test.ts tests/cli-help.test.ts tests/cli-doctor.test.ts tests/cli-provider-exec.test.ts tests/opencode-runtime-diagnostics.test.ts`、`pnpm run test`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 25 个测试文件、194 个用例通过。未解决风险：真实 OpenCode run smoke 校准留作后续兼容性任务；Phase 5 CLI MVP 其余真实业务命令和 TUI 仍未实现，下一步从 Phase 5.3 Chat / native TUI launcher 最小入口拆小继续。
- 2026-05-21：文档同步 Phase 5.3 后的最新开发状态；将顶部当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词校准为 `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`，明确第一个未完成项为 Phase 5.3 Chat / native TUI launcher 最小入口，`sessions`、`runtime`、`config`、`providers list/inspect` 和完整 TUI 仍未实现。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5.3 `chat` / native TUI launcher 最小入口；新增 `src/cli/chat.ts`、`src/providers/opencode/native-tui.ts` 和 `tests/cli-chat.test.ts`，扩展 `src/cli/index.ts` 与 OpenCode provider contract。实现范围包含 `agentproxy chat` 调起配置解析后的 OpenCode 原生 TUI、以 selected workspace 作为 provider-native TUI 目标、interactive stdio handoff、provider process exit code 保留、native TUI child env allowlist、OpenCode passthrough env 显式注入、`interaction.nativeTui` capability 基于 binary availability 声明、invalid provider/disabled provider/missing binary/`--json`/`--session` 稳定错误和脱敏；`sessions`、`providers inspect/list`、`runtime`、`config`、`/tui` prompt prefill、session-aware native resume 和完整 Ink TUI 仍未实现。代码审查未发现阻断问题，P2 测试缺口已补。验证命令：`pnpm exec vitest run tests/cli-chat.test.ts tests/cli-help.test.ts tests/cli-run.test.ts tests/opencode-provider-health.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 26 个测试文件、202 个用例通过。未解决风险：真实 OpenCode native TUI smoke 校准留作后续兼容性任务；Phase 5 CLI MVP 其余真实业务命令和完整 TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5.3 Chat 边界说明后最新开发状态；将顶部当前启动基线、最新阶段实现提交、已完成/未完成摘要和下次启动提示词校准为 `4e07797 阶段进展：完成 Phase 5.3 Chat Native TUI Launcher`，明确 `agentproxy chat` 只是 Phase 5 CLI native OpenCode launcher，不是 Phase 6 AgentProxy TUI。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现 Phase 5 后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `providers list/inspect` CLI 最小工作流；新增 `src/cli/providers.ts` 和 `tests/cli-providers.test.ts`，扩展 `src/cli/index.ts`，将 `agentproxy providers list` 与 `agentproxy providers inspect <id>` 从 planned placeholder 切换为真实只读命令。实现范围包含配置解析、配置或 registry runtime base URL 选择但不启动/停止 runtime、OpenCode provider health/capability probe、inspect 下可选模型列表、human/JSON 安全输出、invalid provider `PROVIDER_NOT_FOUND`、disabled provider list 可诊断状态和 inspect `PROVIDER_UNAVAILABLE`、缺 runtime base URL 降级且不创建 storage、model list 失败子状态、Commander parse error 终端控制字符净化，以及后续 `sessions`/`runtime`/`config` placeholder 边界保持。验证命令：`pnpm exec vitest run tests/cli-providers.test.ts`、`pnpm exec vitest run tests/cli-help.test.ts tests/cli-providers.test.ts`、`pnpm exec vitest run tests/cli-providers.test.ts tests/cli-help.test.ts tests/cli-doctor.test.ts tests/provider-registry.test.ts tests/opencode-provider-health.test.ts tests/opencode-provider-models.test.ts tests/storage-sqlite.test.ts`、`pnpm run typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 27 个测试文件、209 个用例通过。未解决风险：真实 OpenCode `/provider` smoke 校准留作后续兼容性任务，`sessions`、`runtime`、`config` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Providers 后的最新开发状态；将顶部当前启动基线、最新阶段实现提交和下次启动提示词校准为 `c620a4c 阶段进展：完成 Phase 5 Providers List/Inspect CLI`，明确 Phase 5 仍在进行中，剩余真实业务命令只有 `sessions`、`runtime`、`config`，Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `runtime list` CLI 最小工作流；新增 `src/cli/runtime.ts` 和 `tests/cli-runtime.test.ts`，扩展 `src/cli/index.ts`，将 `agentproxy runtime list` 从 planned placeholder 切换为真实只读命令。实现范围包含配置解析、existing SQLite registry 的 readonly/migrate:false/fileMustExist 打开、缺 DB 空列表降级且不创建 DB 或父 data 目录、provider/workspace 过滤、managed/attached/stopped 等 stored runtime 字段摘要、JSON/human 安全输出、runtime URL credentials/query/hash 剥离、metadata 不外泄、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`，以及后续 `runtime stop`/`sessions`/`config` placeholder 边界保持。代码审查发现旧 `cli-chat` placeholder 测试仍断言 `runtime list` 未实现，已改为 `runtime stop` 并补充缺 DB 父目录不创建断言；可复用经验已写入 `tasks/lessons.md`。验证命令：`pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts`、`pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts tests/cli-help.test.ts tests/runtime-registry.test.ts tests/opencode-managed-runtime.test.ts tests/opencode-attached-runtime.test.ts`、`pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts tests/cli-chat.test.ts`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`、`pnpm run build`，结果均通过，其中完整 `pnpm run test` 为 28 个测试文件、214 个用例通过。未解决风险：真实旧库/损坏库仍依赖 storage 层 `STORAGE_ERROR` 路径；`runtime stop`、`sessions`、`config` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Runtime List 后的最新开发状态；确认当前最新实现提交为 `3fc5b34 阶段进展：完成 Phase 5 Runtime List CLI`，将顶部最新 Phase 5 runtime list 实现提交、当前启动基线、最新阶段实现提交和下次启动提示词全部校准为具体提交 `3fc5b34`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect` 和 `runtime list`，剩余真实业务命令只有 `sessions`、`runtime stop`、`config`；Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `sessions list` CLI 最小工作流；新增 `src/cli/sessions.ts` 和 `tests/cli-sessions.test.ts`，扩展 `src/cli/index.ts`，将 `agentproxy sessions list` 从 planned placeholder 切换为真实只读命令。实现范围包含配置解析、existing SQLite session registry 的 readonly/migrate:false/fileMustExist 打开、缺 DB 空列表降级且不创建 DB 或父 data 目录、provider/workspace 过滤、默认排除 tombstone、按 storage 的 `updatedAt DESC, id ASC` 排序、本地 session id/provider session id/title/status/model/runtime/parent/时间/lastError 稳定字段摘要、JSON/human 安全输出、metadata/transcript/raw event 不外泄、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`，以及后续 `sessions show/resume/abort/delete/export/import/share/unshare`、`runtime stop`、`config` 和 Phase 6 TUI placeholder 边界保持。验证命令：`pnpm exec vitest run tests/cli-sessions.test.ts tests/cli-help.test.ts tests/cli-runtime.test.ts tests/cli-run.test.ts`、`pnpm exec vitest run tests/cli-sessions.test.ts tests/cli-help.test.ts tests/cli-runtime.test.ts tests/cli-run.test.ts tests/cli-chat.test.ts tests/cli-providers.test.ts tests/session-sync.test.ts tests/session-actions.test.ts tests/storage-sqlite.test.ts`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`、`pnpm run build`、`git diff --check`，结果均通过。未解决风险：该命令只展示本地 AgentProxy session 索引，不主动同步 provider live session；`sessions show/resume/abort/delete/export/import/share/unshare`、`runtime stop`、`config`、`chat --session` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Sessions List 后的最新开发状态；确认当前最新实现提交为 `6626584 阶段进展：完成 Phase 5 Sessions List CLI`，将顶部最新 Phase 5 sessions list 实现提交、当前启动基线、最新阶段实现提交和下次启动提示词全部校准为具体提交 `6626584`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list` 和 `sessions list`，剩余真实业务命令或子命令为 `sessions show/resume/abort/delete/export/import/share/unshare`、`runtime stop`、`config`；Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `sessions show` CLI 最小工作流；扩展 `src/cli/sessions.ts`、`src/cli/index.ts` 和 `tests/cli-sessions.test.ts`，将 `agentproxy sessions show <id>` 从 planned placeholder 切换为真实只读命令。实现范围包含配置解析、existing SQLite session registry 的 readonly/migrate:false/fileMustExist 打开、缺 DB 映射 `SESSION_NOT_FOUND` 且不创建 DB 或父 data 目录、local session id 查询、provider/workspace/tombstone 可见性过滤、稳定 session detail 字段摘要、JSON/human 安全输出、metadata/transcript/raw event 不外泄、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`，以及后续 `sessions resume/abort/delete/export/import/share/unshare`、`runtime stop`、`config` 和 Phase 6 TUI placeholder 边界保持。验证命令：`pnpm exec vitest run tests/cli-sessions.test.ts tests/cli-help.test.ts tests/cli-run.test.ts tests/cli-runtime.test.ts`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 29 个测试文件、223 个用例通过。代码审查发现文档/todo 状态记录 warning，已在提交前修正。未解决风险：该命令只展示本地 AgentProxy session 索引，不主动同步 provider live session 或读取 provider transcript；`sessions resume/abort/delete/export/import/share/unshare`、`runtime stop`、`config`、`chat --session` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Sessions Show 后的最新开发状态；确认当前最新实现提交为 `7849c56 阶段进展：完成 Phase 5 Sessions Show CLI`，将顶部最新 Phase 5 sessions show 实现提交、当前启动基线、最新阶段实现提交和下次启动提示词全部校准为具体提交 `7849c56`。明确 Phase 5 仍在进行中，已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list`、`sessions list` 和 `sessions show`，剩余真实业务命令或子命令为 `sessions resume/abort/delete/export/import/share/unshare`、`runtime stop`、`config`；Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -1 --oneline`、`git diff --check`、`pnpm run format:check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
- 2026-05-21：完成 Phase 5 `sessions resume` CLI 最小工作流；新增 `src/cli/opencode-runtime.ts`，复用并抽出 `run` 的 OpenCode runtime 选择、managed one-shot lifecycle、OpenCodeProvider 构造、managed env allowlist 和 base URL 校验，扩展 `src/cli/sessions.ts`、`src/cli/index.ts` 和 `tests/cli-sessions.test.ts`，将 `agentproxy sessions resume <id>` 从 planned placeholder 切换为真实命令。实现范围包含按 AgentProxy local session id 恢复现有 provider session mapping、缺 DB 不创建并映射 `SESSION_NOT_FOUND`、missing/tombstoned/wrong-provider/wrong-workspace 可见性过滤、resume-only sync、可选 `--prompt` 发送到同一 providerSessionId、message event stream 消费与脱敏持久化、JSON transcript-free 事件摘要、human 终端安全输出、invalid provider `PROVIDER_NOT_FOUND`、disabled provider `PROVIDER_UNAVAILABLE`、attached 无 runtime URL 稳定 runtime error，以及后续 `sessions abort/delete/export/import/share/unshare`、`runtime stop`、`config`、`chat --session` 和 Phase 6 TUI placeholder 边界保持。代码/安全审查发现 resume human transcript 泄漏阻断项，已修复为只输出控制面摘要，不打印 assistant delta；同时补充 provider resume 超时本地 mapping 失败回写、provider 派生 title/event 字段落库脱敏和 standalone token redaction。验证命令：`pnpm exec vitest run tests/cli-sessions.test.ts tests/session-messages.test.ts tests/cli-run.test.ts tests/cli-help.test.ts tests/cli-runtime.test.ts tests/session-lifecycle.test.ts tests/opencode-provider-sessions.test.ts tests/opencode-provider-messages.test.ts`，结果为 8 个测试文件、71 个用例通过；完整验证命令：`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test`、`pnpm run build`、`git diff --check`，结果均通过，其中完整 `pnpm run test` 为 29 个测试文件、232 个用例通过。未解决风险：真实 OpenCode resume smoke 校准留作后续兼容性任务；`sessions abort/delete/export/import/share/unshare`、`runtime stop`、`config`、`chat --session` 和 Phase 6 AgentProxy TUI 仍未实现。
- 2026-05-21：文档同步 Phase 5 Sessions Resume 后的可继续开发状态；确认当前最新提交为 `bbed697 文档：同步 Phase 5 Sessions Resume 后续开发状态`，最新 Phase 5 实现基线仍为 `fecc676 阶段进展：完成 Phase 5 Sessions Resume CLI`。新增 Phase 5 当前明细表，明确已完成 `doctor`、`run`、CLI `chat` native OpenCode launcher、`providers list/inspect`、`runtime list`、`sessions list/show/resume`，未完成 `sessions abort/delete/export/import/share/unshare`、`runtime stop` 和 `config`；Gate 5 尚未通过，Phase 6 AgentProxy TUI 尚未开始。验证命令：`git status --short`、`git log -3 --oneline`、`pnpm run format:check`、`git diff --check`。本次仅更新进度文档和任务跟踪，不实现后续 CLI 业务命令、provider/runtime 行为或 TUI。
