# Toy 接入与击毁反馈

当前存档以[玩家存档v8](player-save-v8.md)为准。下文2026-10-17段落保留为v7接入记录；v8契约补充在文末，真实Toy本轮由用户明确跳过。

2026-10-17。适配代码和构建产物已实现；真实 Toy 容器、登录、云榜、云存档、外连与审核发布均 **NOT TESTED / NOT SUBMITTED**。

## 公开契约

已核查 [官方文档入口](https://www.bilibili.com/toy/publish/sdk/skill)、[当前官网文档代码](https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-BbevWpLe.js) 及 [官方 SDK](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)。SDK 自动提供 `window.toy`，无额外 init；父容器 RPC 才能完成云端操作，载入脚本或 `isSupport` 返回支持不证明已登录或握手成功。

| 接口 | 已核实契约 | 本版使用 |
| --- | --- | --- |
| `submitScore` | `{board?, score}`，榜位 1–5；整数 -16777216…16777215；只保留最高分 | board 1，非负整数，试炼结算提交 |
| `getRankList` | `{board?,period?,limit?}`；all/month/week/day；limit≤100；返回名次、分数、昵称、头像 | 总榜前 30，手动刷新 |
| `getMyRank` | 返回 ranked/rank/score，需要登录 | 未在界面使用 |
| `getCloudStorage` | 可选字符串 keys；返回字符串字典 | 读取 `progress_v1` |
| `setCloudStorage` | 字符串字典；key 为字母数字下划线连字符 1–128；`__` 保留；单 value≤1024 UTF-8 字节，最多 128 keys | 小型章节、互动、最高分和紧凑衣柜/心动进度 |
| `getUserProfile` | nickname/avatar，可选 toyOpenId | 不作为房间身份凭证 |

访客可读榜；提交成绩和个人排名需要登录。第一次数据操作可能需要平台授权。处理未登录、限流 307044、超时和不支持错误；没有自动刷榜或自动高频重试。SDK 错误提示不无条件声称本机保存成功。

云存档采用平台字符串键值写入，没有已核实的事务或 CAS 保证；并发设备写入可能覆盖。恢复时合并已解锁章数、最高分、互动次数、衣装并集与最高心动，本机领取账本保留；番外阅读位置仅保存在本机。章节目标与成功领取的衣装合并成一次备份，避免本客户端同一事件产生新旧两个云写入，不宣传强一致跨设备同步。排行榜是客户端分数接口，未查到服务端验分能力，本版不能称竞技防作弊系统。

## 构建与外连

- `npm run build`：普通浏览器构建，`dist/` 可由本项目 Node 服务直接运行。
- `npm run build:toy`：Toy 静态构建至 `dist-toy/`，相对资源路径、独立 Worker 文件、按需 3D；需在真实 Toy 预览中验证。
- Toy 构建显式开启 SDK 候选环境，不猜测内容域名。未成功调用时界面保持错误态，不展示“云端已连接”。
- 官方外部服务权限名为 `external_service_access`。第三方服务/资源域名需按平台要求声明与审核；账号资格及实际 HTTPS/WSS 行为未验证。
- 好友服务独立部署。构建前设置公开的 `VITE_ROOM_SERVER=wss://<你的服务域名>/socket`，服务端 `ALLOWED_ORIGINS` 设为真实 Toy 内容 origin。未配置的 Toy 包会明确提示好友棋室尚未开放。
- 只上传静态目录的内容，入口 `index.html` 位于 ZIP 根。不要把 Node 源码、node_modules、环境文件或本机存档放入 Toy 包。

本版没有上传或审核操作；普通浏览器使用明确标记的本机最佳纪录。SDK 适配测试是 **Mock 契约测试**，不升级为真实云端验证。

## 已实现击毁反馈

3D 棋子约 280–320ms 移动，目标棋子在接触时消失，产生 68 个石材/金色碎片、冲击环、短促暖光和克制震屏。2D 保留碎片、残影和冲击环。WebAudio 生成低频重击、石材噪声与清脆尾音；声音需玩家开启。

满手取舍延后约 650ms，剧情结局约 1250ms 后出现，让击毁先被看到。舒适模式缩短动画、减少粒子、关闭震屏与自动动态，仍允许主动旋转；随时切换 2D，不改变棋局或技能。

选子与技能目标可视化；2D 状态提示中文名称与剩余步数，3D 用金色/蓝色状态环提示增益与控制。角色对白跟随施法、击毁、将军和结果。点击立绘逐级害羞，保留傲娇和直球回应，不改变棋力。

已通过自动化 Chromium 的真实 3D 点击、吃子、2D/3D 切换与手机宽度布局。音色的主观听感、手机 GPU 性能、B站 App 内 Worker/音频/WebGL 与真实跨网络连接仍需实机体验。初始提案见 [planning/toy-and-game-feel-v1.md](planning/toy-and-game-feel-v1.md)。

## 当前v8契约补充（2026-10-18）

当前存档行为以[玩家存档v8](player-save-v8.md)和[运行与存档核对](toy-save-readiness.md)为准。上文存档范围/单键写入描述为v7历史。新App读取旧progress_v1，使用按账号/设备的不可变完整快照；getCloudStorage不传keys读取当前账号全部键，removeCloudStorage只清理本设备旧提交。

getUserProfile()不接收参数，直接返回nickname/avatar及可选toyOpenId；OpenID需要发布者开启模式。首次授权由玩家点击，拒绝或缺失身份时可使用本机访客。单值1024 UTF-8字节、最多128键，键名字符规则不变；未发现公开事务或CAS。核对来源：[官方SDK](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)、[当前官方文档代码](https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-DHFqSagZ.js)、[官方CLI流程](https://github.com/bilibili/toy/blob/main/skills/toy/SKILL.md)。

自动上传合并连续变化、有单次在途限制与失败退避。按Toy共享的实际频率额度仍可能限流，阈值未公开；客户端间隔不是平台额度保证。真实容器验证本轮由用户选择暂时跳过；无上传、预览创建或审核提交。
