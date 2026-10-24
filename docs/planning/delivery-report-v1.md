# 巫师棋 · 将你入心交付记录

2026-10-16。

**本地可玩版 READY: YES。Toy 公开发布 READY: NO。** 后者需要真实容器、账号权限、外部好友服务和平台审核；本轮没有执行发布。

## 工程状态

| 项目 | 实际状态 |
| --- | --- |
| 分支 | `feat/wizard-chess` |
| base SHA | 无，初始为空目录，后初始化 Git，尚无 HEAD |
| commit SHA / PR | 无；本轮未提交、推送或创建 PR |
| 实现 | React/TypeScript/Vite 前端、Three.js 3D、共享棋规、AI Worker、剧情、Node 权威好友服务、Toy 适配 |
| 当前范围 | 四模式，24 技能，2D/3D，角色递增害羞，六章与 120 组对白，试炼和榜单适配 |
| 非目标 | 公开匹配、竞技段位、语音配音、换装菜单、多实例房间、发布审核 |
| API | 新增静态 HTTP、`GET /api/health`、`/socket`；协议含 create/join/ready/action/sync/rematch |
| DB | 无；房间为有界内存，浏览器棋局/进度为本地存储，Toy 进度通过独立适配层 |
| 安全 | 服务端座位凭证、请求编号去重、局面版本/对局标识校验、来源/消息体/频率限制、对手手牌裁剪；无前端服务端密钥、无运行时模型接口 |
| Docker | NOT TESTED；本机 Docker Linux daemon 管道不可用，未为本任务启动 Docker |
| Hosted CI | NOT RUN；未配置远程或执行推送，不把本地测试称为 Hosted CI |

## 已执行验证

| 验证 | 结果与范围 |
| --- | --- |
| `npm run typecheck` | PASS，严格 TypeScript |
| `npm test` | PASS，8 文件、81 项 |
| 标准棋 | 初始 perft 20/400/8902；综合易位局面 48/2039；12 盘最多 960 局面逐步对照 chess.js，实际断言超过 700 步 |
| 魔法棋 | 24 种技能均有实际效果用例；王安全、解将、护盾、到期、消耗、补牌、四留三、一次身份奖励等 |
| 真实本机 WebSocket | 6 项：隐藏信息、重复请求/过期版本、越权/非法技能、凭证恢复、旧对局隔离、来源限制 |
| 连接 Mock | 1 项迟到旧连接消息隔离；不替代真实网络测试 |
| Toy SDK Mock | 7 项契约、范围、错误、存档和失败边界；REAL TOY: NOT TESTED |
| `npm run test:e2e` | PASS，10 项，自动化无头 Chromium/SwiftShader；非原生 Chrome 或手机实机 |
| 浏览器流程 | 素材载入、15 次立绘点击及刷新、真实首章吃子/剧情推进/次章施法、同机交接、3D 实际鼠标落子/击毁、损坏存档、人机 Worker、双独立浏览器房间与恢复、390px 手机布局、图鉴与本机榜 |
| `npm run build` / `npm run build:toy` | PASS，普通与 Toy 两套相对资源构建；入口 HTML 689 字节 |
| `npm run verify:toy` | PASS，本机 `/toy/preview/` 嵌套路径加载、Worker 回应、SDK Mock 榜单/备份/恢复、未配置好友服务明确提示；不是真实 Toy 容器 |
| `npm run format:check` | PASS |
| `git diff --check` | PASS；新增文件以 intent-to-add 纳入差异审阅，未提交 |
| `npm audit --omit=dev --audit-level=high` | PASS，当前 registry 报告 0 个已知漏洞；不等同于完整安全审计 |
| 实际图像检查 | 桌面主页、害羞表情、剧情 CG、2D/3D、击毁、同机遮罩、好友房间、手机主页与棋盘截图已检查 |

浏览器 QA 图片保留于忽略目录 `.local/qa/`，不提交测试报告或临时日志。主观击毁快感、音色、审美和长期平衡仍需要玩家实际体验；通过断言不等于已经获得真人评价。

## 自查与修正

已修复：失去易位权后的重复局面签名、损坏嵌套存档校验、联网未知牌造成情报魔法不可用、揭露牌的 UI 显示、迟到旧 WebSocket 消息覆盖新房间、同机交接的一帧手牌暴露、取舍/剧情弹窗遮住击毁、重复身份计分和非将死试炼得分。添加或扩展相应行为验证。当前本地验收没有遗留 BLOCKING/IMPORTANT 项。

架构决策见 [ADR 1](adr/0001-shared-magic-rules.md) 与 [ADR 2](adr/0002-authoritative-private-rooms.md)。规则见 [rules.md](rules.md)，角色来源、完整实际提示词和文件哈希见 [assets-manifest.json](assets-manifest.json)。

重要文件：`src/domain/engine.ts`（棋规与结算）、`src/domain/spells.ts`（24 技能）、`src/story/chapters.ts`（剧情及试炼）、`src/story/interaction.ts`（点击阶段）、`src/renderers/Board2D.tsx` / `Board3D.tsx`（棋盘）、`src/App.tsx`（模式与 UI）、`src/platform/toy.ts` / `room.ts`（平台边界）、`server/index.ts`（房间服务）。

## 交付产物与限制

- 普通运行：`npm start`，默认 `http://localhost:8787`。本轮已启动并读取 `/api/health` 成功。
- Toy 包：`.local/wizards-gambit-toy.zip`，9 个静态文件，入口在根目录、ZIP 内路径为 `/`、CRC 和每个文件内容已对照 `dist-toy/` 验证。无后端、环境文件或 node_modules。
- 最终包 6645505 字节；SHA-256 `28b0565ba2b5744877f1b89bd4af74d6ff80272e26bd1f25df168305b9585326`。
- Toy 包未配置外部好友服务器，网络入口会提示尚未开放。普通 Node 服务的好友房间已实现并本机实测；公网 HTTPS/WSS、跨物理设备和真实 Toy 外连 **NOT TESTED**。
- 真正 Toy 登录、云端成绩/榜单/存档、B站 App、平台审核与公开链接 **NOT TESTED / NOT SUBMITTED**。
- 排行榜通过客户端提交最高分，不能保证竞技反作弊。云存档跨设备写入没有事务/CAS 保证。
- AI 是有限搜索；技能精确强度、手机 GPU 性能、音频主观体验、原生 Chrome/Safari **NOT TESTED**。标准和魔法规则测试不证明所有组合都已经穷尽。
- 初始美术提案的三套服装并未实现为换装功能；实际是主角色稿、8 表情精灵表和 6 CG 图集。
- Three.js 延迟加载块约 594KB，构建有大于 500KB 的大小提示；已保留提示，没有声称达到特定帧率。图片图集约 6.45MB，真实移动网络首屏耗时未测。
- 战报有 256 条事件上限；极长试炼的效率和击毁历史计分可能受截断影响。
- 临时报告清理被工具自动审批策略拦截（只返回 `blocked by policy`），包括改为明确文件后的清理；45 字节的 `test-results/.last-run.json` 保留在已忽略目录，未提交或打入上传包。

这些限制不改变本机可玩验收结论，也不能将本机通过升级为 Toy 发布通过。
