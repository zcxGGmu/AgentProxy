# Lessons

- 优先把 AgentProxy 定位成薄代理和控制面，不要让文档滑向“自研 Agent runtime”。
- 设计方案时需要同时写清楚 provider capability、命令矩阵、数据模型、事件模型和验证策略，单写架构图不够。
- 多 provider 体系必须保留 passthrough，否则抽象层很容易阻塞后续能力演进。
- 对 OpenCode 这类 runtime，应优先对接官方 SDK / OpenAPI，而不是解析 TUI 或 stdout。
- 本地代理产品要先把 secret 边界、日志脱敏和 runtime 生命周期写清楚，再谈扩展功能。
- 架构方案进入实施前必须写清状态机、source of truth、版本协商和兼容性测试矩阵，否则实现阶段会反复返工。
- 后续开发追踪清单必须使用阶段门槛、验收标准和 Definition of Done，不能只维护没有验证条件的松散 TODO。
- 用户要求单独中文进度追踪清单时，应在 `docs/` 下维护独立文档，并作为后续迭代的主要执行清单。
- 每完成一个阶段任务后应主动创建一次 commit，并使用详细中文 commit 信息；重启 Codex 会话后也必须先复习 lessons 并自动延续该习惯，不需要等待用户再次提醒。
- 用 `pnpm run <script> -- ...` 启动 CLI 时，分隔符 `--` 可能会进入 `process.argv`；入口需要先规范化参数再交给 Commander，否则 `--help` / `--version` 会被误判为未知命令。
- Biome 默认可能会检查构建产物；启用 `vcs.useIgnoreFile` 或显式排除 `dist/`，避免 lint/format 结果被生成物污染。
- 核心契约实现时不要用 `unknown` 临时占位 provider 会话返回值；`AgentProvider` 应直接返回 `ProviderSession` 等稳定类型，让 mock provider 测试和 `tsc` 尽早暴露契约偏差。
