# 巫师棋 · 将你入心 v0.3 交付记录

2026-10-17。延续已确认的宿舍棋室、魔镜陪伴与衣装收集范围。

**巫师棋 v0.3 本地交付 READY: YES。Toy 公开发布 READY: NO。** 本轮授权的本地实现、完整回归、视觉自查与静态包均已完成。

## 工程状态

| 项目 | 实际状态 |
| --- | --- |
| 分支 | `feat/wizard-chess` |
| base SHA | 无；仓库尚无 HEAD，接手时已有大量未提交文件 |
| commit SHA / PR URL | 无；未提交、推送、创建 PR、合并、打标签或发布 |
| 实现摘要 | 24 套成年衣装、每套八差分、24 张专属 CG 和 24 页番外/两处选择；魔镜/心动/内心想法、独立收藏奖励、豪华宿舍家具、自由相机/复位、原创配乐 |
| 架构决策 | 陪伴模型与棋局分离；2D/3D 共用镜框；移除场内纸片人物与近景锁棋；保留领域引擎、AI Worker 和权威好友协议 |
| 持久化 | 本机单次写入衣装集合/心动/领取账本；稳定对局 ID 防刷新重复；Web Locks 协调受支持的同源标签；Toy 只同步紧凑集合/心动 |
| 范围 | 原六章/四模式/24 张技能/旧画廊保留；衣装番外同时解锁；PNG 源稿保留、运行加载 WebP |
| 非目标 | 返龄稿、完整 3D 人物、电影录音、公开匹配、竞技反作弊、部署和 Toy 上传审核 |
| API / 数据库 | HTTP/WebSocket 公共协议不变；无数据库变更；Toy 存档增加可选 companion 字段并兼容旧档 |
| 安全影响 | 无运行时 LLM/第三方密钥；收藏为用户可修改的客户端个人数据；未触碰真实凭据或外部账号 |
| Docker | NOT TESTED；仓库没有 Docker 配置 |
| Hosted CI | NOT TESTED；仓库没有远端与 CI 工作流 |
| 本地入口 | `npm start`，端口 8787；本轮已启动并核对健康检查/最新静态入口 |

## 实际资产与体验

每套八种真实绘制表情：傲娇、浅羞、明显害羞、眨眼、欢笑、气鼓鼓、担心、温柔。共 192 幅差分，以 72 张透明图集保存（每套 3＋3＋2 帧），另有 24 张专属双人 CG；不是 192 个独立文件。每套番外 24 页、两处二选一，共 576 页，选择影响当段回应，阅读位置保存在本机。

初始两套，另外 22 套从未拥有集合中均匀抽取。正常输赢/和棋及剧情目标完成可领取；同局一次，认输、退出和断线不领取，集齐后不抽重复项。收藏随机源独立于技能种子。存储失败保留重试状态，不宣称永久领取。

宿舍包括四柱床/床幔、木地板、壁炉、沙发/软垫、地毯、书柜/书桌、拱窗、箱子、茶具、烛台和画像。是融合参考的程序化家具场景，不声称电影原样复刻。自由旋转、缩放、翻转与战术复位不改变棋局；3D 有键盘棋格操作。检测到 SwiftShader/llvmpipe 等软件渲染时采用 40 万像素预算与 15 帧上限，普通 GPU 保留 100 万像素/30 帧上限，不声称实测达到该帧率。

原创 WebAudio 配乐与原有音效默认关闭，玩家主动开启；音量单独保存。没有打包电影原声。所有新增恋爱角色明确设为成年 23 岁；返龄稿按用户要求略过。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `npm test` | PASS，9 文件 / 93 项；规则、技能、AI、房间、存档、收藏并发/失败、Toy Mock |
| `npm run typecheck` / 生产构建内类型检查 | PASS |
| `npm run build` | PASS；Three.js 分块约 604 KB 有构建体积提示，未关闭警告 |
| `npm run test:e2e` | PASS，最终全量 24 项（5.7 分钟）；覆盖实际镜框/棋格像素、自由镜头/不误走棋、192 个表情选择与 24 CG、番外恢复、奖励/失败/并发/音频等 |
| `npm run build:toy` | PASS |
| `npm run verify:toy` | PASS，嵌套静态路径、真实 Worker 走棋、SDK Mock 榜单/备份/恢复、一次章节＋衣装云写入、未配置房间的明确提示 |
| `python scripts/verify-art.py` | PASS，98 对批准 PNG/WebP；完整解码、透明通道、尺寸、SHA-256；24×8＝192 帧 / 72 图集 / 24 CG |
| `npm run format:check` / `git diff --check` | PASS；Git 提示已有部分 CRLF 将归一化为 LF，无空白错误 |
| Toy ZIP | PASS，117 文件，44039250 字节，与最终 dist-toy 逐文件哈希完全一致；入口在根目录，仅含静态页面/图像/脚本 |

浏览器测试为隔离的 Playwright Chromium 与 SwiftShader，真实绘制/鼠标点棋、AI Worker 与本机 WebSocket；不等同于原生 Chrome/手机实机。完整衣柜可见性检查使用已拥有集合 fixture；实际解锁另经首章合法吃子验证，22 套不重复收集经单元测试验证。赢输和棋的结算检查使用领域引擎生成的合法终局恢复 fixture，不声称真人完整下完三局。缺失 UUID API 是能力模拟，不等同于物理 LAN 测试。

## 自审与修复

- 魔镜实心 SVG 覆盖人物：改为镂空雕花，并以截图像素检查人物真正可见。
- 手机首页点击后自动滚动裁切、棋格非正方形、回合条与手牌重叠：修复层叠/定位并覆盖 375、390 与 844 横屏视口。
- 导出中断产生空 WebP：重导出，改为临时文件完成后原子替换，添加完整解码/哈希验证。
- 图集边缘邻人残片：用逐帧显示裁切去除已发现残片，保留 PNG 原稿。
- 章节进度与奖励分开自动云写可能乱序覆盖：合并为一次章节＋衣柜备份，并经实际 UI 的 SDK Mock 回归验证。
- HTTP LAN 缺少 secure-context UUID：改用独立 128-bit 随机 ID 后备方案，并验证开局/刷新身份。
- 重复领取、并发读改写、云集合合并、损坏存档及写入失败：验证幂等与失败边界，损坏收藏不自动覆盖。
- DOM 可见但合成截图噪点：本机强制 SwiftShader 与 GPU 页面合成组合可复现；CPU 页面合成恢复正确。测试加 `--disable-gpu-compositing`，保留真实 WebGL，并增加棋格实际像素验证。等待、镜框改动或强制 context loss 未作为修复保留。

Playwright 区分 headless shell 与 Chromium 新 headless 模式，见 [官方浏览器说明](https://playwright.dev/docs/browsers#chromium-new-headless-mode)。本次合成异常结论来自本机对照，不推断所有 Chromium 或真实 GPU 同样受影响。

自审结果：无未解决的 BLOCKING 项。重要的平台、浏览器、存储和素材限制见下文。

## 交付包

本地文件 `.local/wizards-gambit-v0.3-toy.zip`，另保留通用包名 `.local/wizards-gambit-toy.zip`。SHA-256：`819a030219dcfac40dc72ea22cae9a81eb5379e7808891e286364701e370d0f1`。尚未上传 Toy 或公开部署。

## 重要文件

`src/App.tsx`；`src/story/companion.ts`、`outfitStories.ts`；`src/platform/companion.ts`、`toy.ts`；`src/ui/MirrorCompanion.tsx`、`Wardrobe.tsx`、`OutfitStory.tsx`、`OutfitSprite.tsx`、`outfitFrames.ts`、`audio.ts`；`src/renderers/Board3D.tsx`、`chessRoom.ts`；`src/styles.css`；`tests/companion.test.ts`、`tests/e2e/companion*.spec.ts`、`tests/e2e/game.spec.ts`；`scripts/export-art.py`、`verify-art.py`、`verify-toy.mjs`。域术语与 ADR 0004 同步，ADR 0003 已标为被替代。

## 限制与未测

- Real Toy / 登录 / 云端 / App 容器 / 审核 / 公网 WSS：NOT TESTED / NOT SUBMITTED。
- 原生 Chrome/Edge、真实手机 GPU/触摸、物理跨设备 LAN、主观音乐听感：NOT TESTED。
- 本机强制软件 WebGL＋GPU 页面合成存在已观察异常；本次视觉验收使用 CPU 页面合成，未验证真实 GPU 是否受影响。
- 不支持 Web Locks 的浏览器仅保证本标签串行，不提供跨标签原子保证。Toy 跨设备写入没有已核实的事务/CAS；番外阅读位置不上传云端。
- 房间仍为有界内存状态，服务器重启后不恢复，不支持多实例共享；原部署架构不变。
- 图像自查覆盖全部联系表及代表原图；差分的边缘/绘画细节存在轻微变化，不声称逐像素一致或每根手指都经独立人工审定。

历史结果保存在 [v0.2 报告](planning/delivery-report-v2.md)，旧测试数和旧 ZIP 哈希不代表 v0.3。
