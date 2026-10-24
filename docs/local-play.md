# 本地入口修复

本地启动修复 READY: YES。Windows双击项目根目录“开始游戏.cmd”，或运行`npm run play`，访问固定的`http://localhost:8787/`。启动窗口保持打开。源码index.html需要Vite处理，构建版使用ES模块及Worker；file协议直接打开不能作为游戏运行方式，现在会显示启动说明。

架构保持React/Vite与现有Node服务。新增`scripts/play-local.mjs`复用现有服务工厂，仅监听127.0.0.1；已运行同一游戏时复用，不关闭其他程序；端口被无关服务占用时明确失败，不自动改端口。这样不会因启动器换来源让玩家误以为旧存档丢失。不读取或改写玩家存储。

新增Windows入口“开始游戏.cmd”、`npm run play`与`npm run test:launcher`。缺少构建时批处理执行现有build；缺少Node／依赖会提供安装／npm ci提示。现有生产npm start的监听、好友协议、棋规、UI排布、账号存档与数据库均不变。没有新依赖、公共HTTP API或DB变更。

验证：

- `npm run build`（含类型检查）、`npm run build:toy`、格式检查及`git diff --check`：PASS。
- `npm run test:launcher`：3/3，通过真实本机HTTP验证重复启动、外部端口保护，并在隔离自动化Chromium验证源码／构建HTML的file提示及HTTP下棋、真实AI Worker回应。没有使用真实玩家浏览器档案做测试。
- Windows CMD入口已实际执行；localhost:8787健康检查与页面HTTP 200，监听地址127.0.0.1。启动器调用默认浏览器，但未将默认浏览器的视觉状态作为测试证据。
- `npm run verify:toy`：子路径与SDK Mock回归PASS。真实Toy／B站App／云仍NOT TESTED；本轮未上传、发布或提交审核。
- Docker／Hosted CI：NOT TESTED，未改变部署架构。本轮未重跑未改动棋规的整套回归；原v12收据保持历史含义。

原v12 ZIP保留。新增带file打开说明的静态包为本机`.local/wizards-gambit-journey-v12-open-help-toy.zip`，仅静态资源，不含Windows启动器，不能把解压后双击HTML当作Toy平台运行验收。字节／哈希见本机`.local/v12-implementation/local-launch-package.json`；启动、浏览器及格式日志同目录。50MB门槛按新包实际测量，原doctor的SVG内部锚点误报没有被改写成通过。

分支`feat/wizard-chess`；base SHA、commit SHA与PR URL不存在（unborn仓库）。没有提交、推送、合并、标签或发布。既有intent-to-add和未跟踪用户文件保留。自审无阻断问题；边界：需要Node与首次依赖安装，源码改动后需重建；固定默认地址与其他来源的浏览器存档不自动互相迁移。
