# Lessons

- 优先把 AgentProxy 定位成薄代理和控制面，不要让文档滑向“自研 Agent runtime”。
- 设计方案时需要同时写清楚 provider capability、命令矩阵、数据模型、事件模型和验证策略，单写架构图不够。
- 多 provider 体系必须保留 passthrough，否则抽象层很容易阻塞后续能力演进。
- 对 OpenCode 这类 runtime，应优先对接官方 SDK / OpenAPI，而不是解析 TUI 或 stdout。
- 本地代理产品要先把 secret 边界、日志脱敏和 runtime 生命周期写清楚，再谈扩展功能。
- 架构方案进入实施前必须写清状态机、source of truth、版本协商和兼容性测试矩阵，否则实现阶段会反复返工。
- 后续开发追踪清单必须使用阶段门槛、验收标准和 Definition of Done，不能只维护没有验证条件的松散 TODO。
- 用户要求单独中文进度追踪清单时，应在 `docs/` 下维护独立文档，并作为后续迭代的主要执行清单。
- 每完成一个阶段任务后应主动创建一次 commit，并使用详细中文 commit 信息；重启 Codex 会话后也应先复习 lessons 并延续该习惯。
