# 专属番外画面与结束动作修复

2026-10-18。用户报告双人CG与独立立绘重叠，并要求24页读完后关闭。

## 当前架构与实施计划

OutfitStory是独立Modal，读取每衣装的本机阅读位置和两处选择，用同一张专属双人CG呈现24页故事。App的onClose负责返回衣橱，阅读进度独立于棋局和收藏。

1. 删除番外额外OutfitSprite和仅用于该层的date-actor样式，保留原CG、遮罩、对白、选择与翻页。
2. 最后一页继续展示结尾；主按钮“读完了”调用现有onClose关闭番外并返回衣橱，次操作保留“从头阅读”。不新增定时关闭，不清除已保存的选择/阅读位置；再次打开可停在结尾并主动重读。
3. 三比例真实走完24页，验证CG只有一幅展示图、两个选择不跳过、结束返回衣橱、重开/重读与收藏/棋局隔离；复跑原番外与衣橱回归、类型/构建/格式，并检查实际截图。

文件：OutfitStory.tsx、styles.css、companion.spec.ts和相关说明。风险是漏读末页、完成时误清选择、手机多按钮溢出。范围不含CG重绘、衣装八差分、棋规、奖励或存档schema。可逆展示修复不新增ADR。

## 实施与验证

**专属番外修复 READY: YES（本地）。** 分支feat/wizard-chess；仓库无HEAD/base SHA，未提交/推送/创建PR，commit SHA及PR URL均无。

- IMPLEMENTED：番外只展示专属双人CG，删除额外立绘；末页保留结尾，“读完了”关闭并返回衣橱；重读仍主动重置，完成关闭不清除页码/选择。衣橱/聊天/对局立绘与八表情不改。
- TESTED：生产和Toy构建内类型检查、Prettier、git diff --check通过；相关单元11项通过。未重跑全部93项单元或全部其他模式E2E。
- TESTED IN AUTOMATED CHROMIUM：原4项衣橱/番外回归通过（正常领奖/192帧与24CG解码/两次选择与刷新恢复/手机展开）；新增4项通过，其中1392×750、390×844、844×390分别完整读24页、两处选择、单幅CG、结尾返回衣橱、重开末页与从头阅读，另有存储不可写仍能正常关闭。收藏、心动与棋局存档隔离断言保留。
- 首轮新增测试重开时未重新选择“书页与星”，实际打开了衣橱默认已装备衣装；修正测试步骤后4项通过，没有降低断言或变更衣橱默认行为。原5项通过与后续4项通过覆盖全部8个相关用例，不冒称单次8项全绿运行。
- TESTED WITH MOCK：Toy嵌套静态资产、实际Worker走棋、SDK Mock榜单/备份/恢复通过。REAL TOY / 原生手机 / GPU / Docker / Hosted CI：NOT TESTED；仓库无Docker或远端CI配置。
- 自审：比较本次前快照，修改仅限OutfitStory、date专属样式、行为测试与说明；无API、DB、schema、规则、奖励或新依赖/密钥变化，无未解决BLOCKING/IMPORTANT项。

实际查看三比例第6页与末页截图，额外人物不再遮住CG，三个末页操作保持在视口内。竖屏仍沿用原CG cover裁切，短横屏长选项沿用原滚动区域；本轮未重做CG构图或素材。验证浏览器为隔离Chromium/SwiftShader，不能外推真实手机。

证据在忽略目录.local/story-fix/：e2e.txt保留首轮输出，e2e-regression.txt为最终4项；三比例choice/ending截图；build.txt、toy-build.txt、toy-mock.txt、format-final.txt、toy-package.json。单元11项结果见本轮工具执行输出，旧v6报告不作为新增测试证据。

最新Toy本地包：.local/wizards-gambit-story-fix-toy.zip，119文件、43057335字节，与最终dist-toy逐文件SHA256一致，根入口有效。SHA256：d4d3f4910e893abc99711d0b21b51e77c6da70717ee3feec335754ad84c596d5。旧v6包保留，未上传或发布；生产预览8787提供新构建。
