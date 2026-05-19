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
- Provider Registry 阶段只做内存注册、lookup、list 和 capability probe，不读取配置、不落 SQLite、不触发 runtime 生命周期；schema 不兼容时应降级为 limited mode，并把原始 provider 信息保留在 metadata。
- Provider list 的 JSON 输出要显式保留原始 capability schema version，并把 metadata 做 JSON-safe 规整；循环对象和循环数组都要覆盖，避免 limited mode 把真实版本号写丢或让非 JSON 值污染列表结果。
- 配置解析阶段要区分自动发现和用户显式输入：全局/项目配置缺失可以忽略，但显式 `--config` 指向的文件缺失必须映射为 `CONFIG_INVALID`。
- runtime 端口属于配置层可验证边界，必须在解析阶段校验为 1-65535 的整数，避免把非法端口延迟到 runtime 生命周期阶段才失败。
- 日志脱敏不能只处理结构化 `data` 字段；logger message、CLI diagnostic stderr 和 JSON 风格 inline secret 字符串也必须默认脱敏。
- 使用 Commander 等 CLI 框架时，框架自身的 parse error / unknown option / unknown command stderr 也要接入脱敏输出通道，不能只包自写错误输出。
