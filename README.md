# 汉字百词斩移动端

React + TypeScript + Capacitor 8 独立移动端工程，代码与资源均在本目录。
本仓库仅包含移动端代码，不包含 Qt/C++ 桌面端，不自动读取或覆盖电脑端数据库。

## 启动

需要 Node.js 22.12+。本项目已用 Node.js 22.19 验证。

```powershell
git clone https://github.com/liujungit/Hanzi100.git
cd Hanzi100
npm ci
npm run dev
```

默认预览地址为 `http://localhost:5173/`。端口已占用时可用
`npm run dev -- --port 5174`。手机可访问同一局域网下电脑 IP 的相应端口，
需在 Windows 防火墙中允许本地开发服务。开发服务不要暴露到公网。

浏览器预览使用 IndexedDB；原生 APP 使用 SQLite。网页预览不代表 APK/IPA 已构建。
生产原生包内置界面和教材文件，不依赖开发服务器。

## 已迁移功能

- 四个页面：学习汉字、今日复习、汉字字库、学习设置。
- 手机底部导航，平板侧栏；横竖屏、自适应布局、安全区域。
- 汉字、带声调拼音、符号笔顺、部首、释义、汉字例句、对应词义与词语例句。
- 词语、词义、例句按 `;`、`；`、顿号、换行、竖线拆分，同索引一对一显示。
- 预览阶段支持上一字/下一字；预览完毕再练习，可返回预览。
- 新字全局随机训练。四种基础题型，以及按词语选字、选词填空、按词义选词。
- 多个词语分别出题；缺少词语或例句的附加题型不生成，不编造内容。
- 每题四个非空且不重复选项；优先从字库获取干扰项，字库太小时使用明确的通用干扰项。
- 答错标红并留在当前题；答对标绿后自动跳题。答错后改对只算纠正，重入随机队列。
- 每字全部指定题过关才记为已学；每日固定一批字，完成后不追加。
- 复习同样包含预览和练习，每字随机三种不同题型；间隔 1/2/4/7/15/30 天。
- 设置每日学习/复习数量及教材范围；版本、年级从已导入字库获取。
- 今日待复习、明日待复习、已学统计；每条教材记录的历史错误和通关标记，可排序、筛选、搜索。
- 原生系统中文 TTS、换字自动朗读、答对/答错语音；两种语音均可关闭。
- 原生文件选择器导入 CSV；解析在 Worker 中运行，显示等待提示，事务保存。
- 字库原位更新，保留原有学习进度、错误数和当天题目状态。
- SQLite/IndexedDB 保存学习、复习会话和当前标签页，同日重启继续原计划。
- JSON 备份导出、校验与恢复。原生端通过系统分享面板导出。
- 田字格描红/自由书写、显示/隐藏参考字、撤销、清空；支持触摸和笔输入。
- 使用原项目 `Hanzi.png` 作为应用图标与启动资源。

## 数据与边界

首次运行字库为空，在“学习设置”手动选择导入基础或扩展字库，也可自行选择 CSV。
扩展文件保留项目原有 4,407 条教材记录，基础文件为 120 条。不同教材的同字分别保存。
匹配键为 `汉字 + 年级 + 版本 + 教材 + 册次`；相同键更新内容，绝不重置进度。
修改年级或版本会生成另一条教材记录，不按汉字跨教材合并。

CSV 使用 UTF-8，支持 BOM、引号、逗号及引号内换行，最多 25 MB；任一记录错误则整批不写入。
推荐表头：

```csv
hanzi,pinyin,meaning,example,words,word_meanings,word_examples,grade,edition,book,volume,stroke_order,radical,note
```

也接受桌面旧格式 7 到 11 列（必须使用对应英文表头）。数字声调在导入时转为调号。
教材归属与完整性仍需核实；本次只复制既有项目资料，不代表取得教材授权。
校对记录及原数据许可保留于 `public/data/`，新增内容请使用有授权的资料。

每日计划按设备本地日期划分。当天已经开始的计划不会因修改设置或重新导入而重建。
跨日开始新计划；未完成的字未记为已学，仍可进入之后的计划。
正在练习的题目是生成时的快照，更新字库不破坏已答题状态，新计划使用新内容。

移动端与电脑端数据库独立。当前 JSON 备份用于移动端/浏览器之间迁移，
不能直接导入桌面版 `.db` 文件。卸载、清除应用数据或清除浏览器站点数据会删除本地记录，
请先导出备份。无登录、云同步、广告、统计 SDK 或后台上传接口。

## 语音与书写差异

Windows SAPI5 不可在手机上使用。原生端改用 Android TTS / iOS AVSpeechSynthesizer，
需设备安装中文语音。浏览器语音可能要求用户先点击播放按钮。
移动端目前朗读汉字及释义、例句等，不把原始拼音字母交给系统英文拼读，
不支持 SAPI 专属音素拆读；多音字具体读音由系统语音判断，不能保证与字库拼音完全一致。
笔顺用符号逐笔高亮，书写是描红画布，不包含自动笔顺动画或手写识别评分。

## Android 构建

工程：`android/`。配置 Android 7.0+（API 24），要求可更新的 Android System WebView 108+。
请在 Android Studio SDK Manager 安装 Android SDK Platform 36、对应 Build Tools、Platform Tools，
使用 JDK 21 和支持 Android Gradle Plugin 8.13 的 Android Studio。
本工程 Gradle Wrapper 为 8.14.3，首次构建需要访问 Google Maven、Maven Central 和 Gradle 下载服务。

```powershell
# 编译前端并同步原生资源/插件
npm run sync
# 打开 Android Studio
npx cap open android
# 或直接使用本项目脚本生成调试 APK
powershell -ExecutionPolicy Bypass -File .\build-android.ps1
```

如果 SDK 不在默认位置，修改本机 `android/local.properties` 的 `sdk.dir`，
或设置 `ANDROID_HOME`。不要提交本机 SDK 路径和签名密钥。

调试 APK 成功时输出：`android/app/build/outputs/apk/debug/app-debug.apk`。
发布版本用 Android Studio 的 Generate Signed Bundle / APK 配置自己的签名，
或脚本 `-Release` 生成未签名 Release APK 后再签名；不要分发未签名包。
应用 ID 暂定 `com.hanzi100.mobile`，正式发布前按自己组织修改并重新同步。

Android 禁用系统自动备份，避免 SQLite 文件部分恢复；请使用 APP 内导出备份。
文件导入走系统文档选择器，不申请通讯录、定位、麦克风或全盘存储权限。

## iPhone / iPad 构建

工程：`ios/App/App.xcodeproj`，Swift Package Manager 集成插件。
Deployment Target 为 iOS/iPadOS 16.0，Targeted Device Family 同时包含 iPhone 和 iPad。
需 macOS、与 Capacitor 8 兼容的 Xcode（建议 Xcode 26+）、Apple 开发签名账号。
Windows 不能编译/签名 IPA。

在 Mac 上复制整个 `web` 目录（无需 `node_modules` 和 `dist`），执行：

```sh
npm ci
npm run sync
npx cap open ios
```

在 Xcode 选择 Team、配置唯一 Bundle Identifier，再选择 iPhone/iPad 真机 Run，
发布时 Product > Archive。SPM 首次需下载 Capacitor、SQLCipher 等依赖。
`npm run sync` 自动规范 Windows 生成的 Swift 本地包路径，避免反斜杠造成 Mac 构建失败。
已加入本地文件时间和 UserDefaults 的 PrivacyInfo.xcprivacy，发布前仍需按最终功能审核隐私清单。
SQLite 插件包含 SQLCipher（即使未启用数据库加密）；提交 App Store 前需自行确认加密出口声明要求，
本项目没有擅自将应用声明为“不含加密”。

## 开发与验证

```sh
npm run build
npm test
npx playwright install chromium
# 保持 npm run dev 在另一个终端运行
npm run test:e2e
```

主要目录：

| 路径                                | 内容                               |
| ----------------------------------- | ---------------------------------- |
| `src/engine.ts`                     | 每日计划、题型、过关与复习规则     |
| `src/storage.ts`                    | SQLite / IndexedDB 存储            |
| `src/curriculum.ts`                 | CSV 校验、字段拆分、拼音与笔顺转换 |
| `src/platform.ts`                   | 系统语音、文件读取、导出分享       |
| `src/backup.ts`                     | 恢复前的数据结构校验               |
| `src/App.tsx`、`src/components.tsx` | 四个页面、书写画布与交互           |
| `tests/`                            | 核心规则、语音取消、手机和平板 E2E |
| `public/data/`                      | 手动导入的内置教材资源             |
| `scripts/generate-icons.ps1`        | 使用 Hanzi.png 生成原生图标/启动图 |

验证记录见 `VERIFICATION.md`。原生 SQLite、原生文件选择/分享、系统 TTS 仍需在 Android、iPhone、iPad 真机进行验收。
