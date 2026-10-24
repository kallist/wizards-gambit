# 巫师棋：与马尔福的甜蜜生活 · 像素星空 UI 交付

2026-10-18。**像素星空 UI 本地交付 READY: YES。Toy公开发布 READY: NO。** 本轮授权的实现、回归、两轮独立视觉评审与静态包已完成。历史 [v0.3报告](planning/delivery-report-v3.md) 保留，不作为本轮新增验证。

## 工程状态

| 项目 | 实际状态 |
| --- | --- |
| 分支 | feat/wizard-chess |
| base SHA | 无；仓库尚无HEAD，接手时已有大量未提交/未跟踪文件 |
| commit SHA / PR URL | 无；未提交、推送、PR、合并、打标签、发布或部署 |
| 实现 | 像素剖面小屋、进入放大、人物聊天、棋桌模式入口、独立太空棋盘、可动粒子星系、默认像素2D与3D切换、常驻高清人物 |
| 架构决策 | home/room/game呈现状态独立于棋局模式；银河为装饰Canvas，人物为SVG裁切的高清图集；Three.js只呈现棋盘和外围暗星 |
| 范围 | UI导航/呈现/素材修复与相关测试；原六章、24技能、AI、好友房间、收藏、番外和音频保留 |
| 非目标 | 运行时自由AI聊天、完整三维人物、改棋规/奖励概率/AI搜索、电影原声、公开部署、Toy上传 |
| API / DB | 公共HTTP/WebSocket协议和存档schema无变化，无数据库变更 |
| 安全 | 无新运行时服务/依赖或密钥；装饰随机源不进入棋局；验证使用隔离浏览器存档，未访问用户真实浏览器数据 |
| Docker | NOT TESTED；仓库无Docker配置 |
| Hosted CI | NOT TESTED；仓库无远端/CI工作流 |
| 本地入口 | npm start，http://localhost:8787；健康检查ok、最新标题及静态入口已核对 |

## 已实现体验

封面小屋为主角，进入后连续放大；点马尔福展开右侧全身立绘、预写对白与话题，点棋桌选择继续/剧情/人机/同机/好友，人机设置保留试炼。对局移到独立星空棋盘，返回小屋和刷新保留同一局。

背景有6800颗旋臂星尘、320颗远景星、22颗近景柔光星，偏置星核和不同距离的旋转/漂移/指针视差；进入对局降低亮度。减少动态效果时静止，页面隐藏时暂停调度。Canvas分辨率不超过约120万像素、DPR不超过1.5，调度目标约30/15帧；未实测真实手机或GPU帧率。

24套各8种表情仍为192幅、72个运行图集。修复10张源图粘连图集，新增小屋，共11对版本化PNG/WebP；98对旧素材均保留。全图主体轮廓包络恢复越过分格线的鞋尖、裙摆，排除邻帧碎片；按人物实际可见范围居中，姓名放在人物外。轮廓简化检查主体alpha行，不能丢失主体像素。

桌面/横屏完整右栏，竖屏常驻高清头像并可展开。390×844两热点标签分开；844×390的2D棋格约32.5px，三张手牌纵置在棋盘旁，卡牌完整收在视口内。聊天时收起背景热点，删除对局重复品牌行。

## 实际验证

| 验证 | 结果 |
| --- | --- |
| 类型检查 | PASS；独立typecheck及最终两种构建内检查 |
| 生产构建 | PASS；主脚本约1257KB、Three约603KB存在体积提示，未关闭警告 |
| 完整浏览器回归 | PASS，29项，5.9分钟；包含实际首章、AI Worker、同机、2D/3D/相机、本机WS房间、收藏失败与并发、番外、192帧与24CG解码、音频、手机和新增场景 |
| 新增5项关键路径 | 每项连续3次PASS，共15次；最终横屏标签调整后该项另连续3次PASS |
| 192帧实际渲染核查 | 隔离Chromium真实衣橱逐帧选择，4张联系表均实际查看；未见明显剩余邻帧残片、头脚裁缺、鞋尖/裙摆截断或外框遮挡 |
| 资产验证 | PASS，98对保留稿＋11对新增/修复稿＝109对；解码、alpha、尺寸、SHA256；运行图集72张、24CG |
| Toy构建与SDK Mock | PASS；嵌套静态资产、真实Worker走棋、Mock榜单/备份/恢复、一次合并云写入、未配置房间提示 |
| 静态ZIP | PASS，117文件、44016458字节；与dist-toy逐文件SHA256一致 |
| 格式 / whitespace | Prettier PASS；最终git diff --check PASS |
| 单元测试 | 本轮未重跑全量单元；规则/存储实现未改。旧93项结果仅见历史报告 |
| 原生环境 | 真实Toy、原生Chrome/Edge、真实手机触控/GPU、物理LAN、正常速度动效主观手感：NOT TESTED |

完整29项后仅调整横屏小屋热点标签间距，并为该位置增加断言；已重新构建、连续三次通过受影响回归，没有据此重复全量测试。

自动化浏览器为Playwright Chromium，3D用SwiftShader和CPU页面合成。本机GPU页面合成曾出现截图噪点，已有参数保留；不能外推真实GPU。完整衣柜检查用隔离已拥有fixture，实际正常解锁由另一真实章节路径验证。终局赢/输/和棋为合法领域终局fixture，不宣称真人完整下完三局。

## 视觉评审与证据

第一轮独立评分7/10：指出竖屏标签重叠、横屏手牌裁边及棋格偏小、聊天透出旧热点、重复品牌和星系层次不足。第二轮8/10，已确认上述可见问题解决，完整人物保持通过，星系空间层次成立。剩余提升为844×390聊天的完整人物尺度偏小、桌面对局闲置旁白与当前对白含义重复；未列为流程阻断或裁切错误。正常速度录屏主观手感不由静态截图推断。

动作：800ms小屋出场、450ms走近/场景让位、300ms聊天展开、250ms棋局菜单、按钮按压/聚焦；已有落子与击毁反馈保留。减少动态效果关闭相关运动。

本地证据均位于忽略目录，不作为源码提交：

- .local/ui-rework/current/：桌面、390×844、844×390共13张最终状态图。
- .local/ui-rework/current-2x/：相同视口2倍像素密度的13张图。
- .local/ui-rework/portrait-audit/final/：192帧记录与4张实际渲染联系表。
- .local/ui-rework/evidence/final-motion/：出场、走近、聊天、棋局4段MP4及动效报告。报告无控制台错误、横向溢出、图片加载失败或lint项；Canvas银河另经像素变化与舒适模式静止断言验证。
- .local/ui-rework/visual-review.md 与 visual-review-round2.md：独立评审。
- .local/ui-rework/e2e-final.txt、build-final.txt、build-toy-final.txt、format-final.txt、toy-package-final.json：验证输出。

shoot工具的page图片是封面，动作后状态见motion结束帧；聊天/棋局的2倍细节使用current-2x真实浏览器截图，不混称工具已截所有静态状态。旧失败取证目录保留供追溯，不作为最终通过证据。

## 文件与自审

主要文件：src/App.tsx、src/ui/TitleScreen.tsx、Starfield.tsx、MirrorCompanion.tsx、OutfitSprite.tsx、outfitBounds.ts、art.ts；src/renderers/Board2D.tsx、PixelPiece.tsx、Board3D.tsx、starRoom.ts；src/pixel-ui.css、src/styles.css；tests/e2e/pixel-hub.spec.ts、navigation.ts及原导航回归；scripts/measure-outfit-frames.py、verify-art.py；docs/assets-v4-manifest.json。

自审以本轮前快照比较App、渲染器和人物组件，确认棋局领域、AI Worker、协议和存储实现保持原架构。修复了SVG等比留白泄漏相邻帧、源图粘连、跨单元鞋尖裁切、移动标签重叠、卡牌长标题/边界与聊天旧控件透底。无未解决BLOCKING项；两处视觉提升与实机验证边界已明确保留。

## 交付包与限制

.local/wizards-gambit-pixel-ui-toy.zip，SHA256：
24800c7b465f015ac51e318841347293cc793f69de9980c6e82a097d1d7c7729

未上传Toy或公开部署。个人收藏仍为客户端可修改数据；无Web Locks浏览器的跨标签原子性、Toy跨设备事务/CAS、内存房间重启丢失等原有限制保留。高清生成稿表情间有轻微布纹/边缘差异，不宣称逐像素一致或逐根手指均独立审定。原生设备性能和主观动效手感留待实机观察。
