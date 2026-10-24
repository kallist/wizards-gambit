# 小屋左侧收藏栏修复

左侧收藏栏修复 READY: YES。衣橱、冬日手札、回忆画廊和魔法图鉴改为左侧竖排；桌面、手机竖屏及矮屏横屏分别留出主按钮与杯垫纪念物的位置。沿用已有边框、字体及图标，不改变游戏规则或收藏行为。

改动限于 `src/pixel-ui.css`、`src/journey/journey.css` 与新增回归 `tests/e2e/cottage-sidebar.spec.ts`。继续使用现有 React/Vite 与响应式 CSS，无新依赖、API、数据库或存档结构变更；测试只使用隔离浏览器中的虚构存档，没有读取或修改真实玩家数据。

验证结果：

- 新增收藏栏回归 7/7 PASS：1308×750、1440×900、1366×768、390×844、360×640、844×390、667×375。检查四按钮竖排、至少44px触控高度、不遮挡标题／邀请／继续游戏／杯垫，并实际点击棋旅和四个收藏入口。
- 现有横竖屏回归 3/3 PASS：360px竖屏完整魔镜与2D／3D切换、五种视口及放大文字、手机横屏棋格／手牌与实际走棋。
- `npm run build`、`npm run build:toy`（均含类型检查）、`npm run format:check`、`git diff --check`：PASS。
- `npm run verify:toy`：子路径资源、Worker、棋旅及SDK Mock存档回归 PASS。SDK Mock不构成真实Toy验收。
- 自动化环境为本机隔离Chromium及SwiftShader；已查看桌面与手机横竖屏截图。真实手机、B站App及本游戏真实Toy运行：NOT TESTED。Docker／Hosted CI：NOT TESTED，本轮未改动部署架构。

日志与截图位于本机忽略目录 `.local/v12-implementation/sidebar-*`。更新后的独立静态包为 `.local/wizards-gambit-journey-v12-sidebar-toy.zip`，压缩43,852,984字节，解压45,292,966字节，均小于50MB。SHA-256为 `72a27f807ff9ec3d0dd84a6521715c83240f5c9b44519b978a3cdad13adec262`；原有交付包保留。本轮未上传、发布或提交审核，既有官方doctor的SVG内部锚点误报也未改写成通过。

横屏证据边界：游戏已有横屏布局，上述自动化回归已通过。Toy上线作品[《我做了一个鸣潮玩家通关率仅0.0001%的iWanna》说明](https://www.bilibili.com/video/BV1fbun6jEaW/)提到新版B站App及翻转手机自适应横屏；这是该作品的运行说明，不是Toy SDK对所有系统和版本的承诺。本作仍需在真实Toy及手机上验证旋转、容器高度和触控。

分支 `feat/wizard-chess`；base SHA、commit SHA和PR URL均不存在（unborn仓库）。没有提交、推送、合并或发布。已有intent-to-add及未跟踪文件保留。自审未发现本轮范围内阻断问题；完整棋规、联机、真实平台与新增内容均不在本次布局修复范围。
