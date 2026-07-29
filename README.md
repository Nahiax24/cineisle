# 映屿 CineIsle

> 一个自部署的双人本地观影同步工具：本地导入视频，同步播放进度、聊天、弹幕、时间轴笔记、字幕感知、低频画面截图，并生成电影票根/片尾回执/观影明信片。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/linzhi-524/cineisle)

## 这是什么？

映屿 CineIsle 是一个轻量的 watch-together 工具。两个人各自在自己的手机里导入本地视频文件，服务端只负责同步房间状态、播放进度、聊天、弹幕、时间轴笔记、观影卡片、字幕上下文和低频画面截图。

**它不提供任何影视资源，也不会上传你的视频文件。** 视频文件只保留在你的设备里；截图功能也需要用户主动触发或在 Android App 内主动开启。

公开版支持在设置里填写 **AI 名字**。填写后，App / PWA 内和 MCP 截图请求会同步这个名字，例如「给小G看一眼」「给林澈看一眼」。

## 本次更新：v0.4.3 Render 休眠保护 + PWA + Android APK

- PWA 页面进入后台后会停止房间轮询与字幕上下文上传，回到前台时以本机进度恢复连接。
- 视频暂停且页面闲置 10 分钟后会自动断开；再次操作或点击「唤醒房间」即可恢复。
- 新增「让服务器休眠」按钮，主动停止持续请求并记住休眠状态，避免重新打开页面后自动唤醒房间。
- Render Free Web Service 在所有 CineIsle 页面断开后可按平台规则进入空闲休眠。

- 新增 **iOS Web/PWA 入口**：iPhone 用 Safari 打开后端地址，添加到主屏幕即可像 App 一样使用。
- Android 仍保留原生 App 与 GitHub Actions 自动打包 APK。
- 新增 PWA 文件：`server/public/index.html`、`app.css`、`app.js`、`manifest.webmanifest`、`sw.js`、图标。
- PWA 支持创建/加入房间、本地导入影片、播放/暂停/进度同步、聊天、弹幕、字幕导入、时间轴笔记、观影卡片、本机影厅记录、手动上传当前视频帧给 AI 看一眼。
- 新增 GitHub Actions：源码 ZIP 打包、上传 ZIP 后解压覆盖旧仓库。
- README 更新：保留 Render 一键部署、局域网部署、Android APK、MCP 工具教程，并补充 iOS PWA 使用说明。
- 修复 Render 一键部署稳定性：移除带内部源地址的 `package-lock.json`，强制使用 npm 官方 registry，并在构建阶段检查 `express` / `cors` 是否安装成功。

## 功能

- 创建/加入观影房间
- 本地导入视频，不上传视频文件
- 播放、暂停、进度同步
- 聊天与弹幕分离
- 横屏右侧抽屉：Android 原生 App 默认只露出 `>`，点开后可聊天、发弹幕、同步进度、请求截图
- iOS/PWA：手机浏览器响应式界面，支持添加到主屏幕
- 观影邀请卡：电影名、观影人、氛围、开场备注
- 时间轴笔记：每条笔记可绑定当前播放时间
- 金句摘录：手动记录台词/高光瞬间
- 三套观影卡片模板：电影票根、片尾回执、观影明信片
- 档案馆/影厅：保存本机导入过的影片信息和上次进度
- 字幕感知：支持导入 `.srt` / `.vtt` / `.ass` / `.ssa` 字幕，按播放进度同步当前字幕与最近字幕
- ASS/SSA 字幕兼容：会尽量去掉样式标签和绘图代码，只保留台词
- 低频画面截图：Android App 开启无障碍服务后可低频上传；PWA 可手动截取当前本地视频帧上传
- 最近画面时间线：后端保留最近 5 张截图摘要，方便 AI 理解刚刚发生了什么
- MCP 接口：让 ChatGPT / 其他支持 MCP 的 AI 读房间、发弹幕、控制播放、请求截图、读取观影上下文、生成卡片

## 文件结构

```text
.
├─ android/                       # Android 原生 App 源码，Actions 生成 APK
├─ server/                        # Node.js 后端 + Web/PWA + MCP 接口
│  ├─ public/                     # iOS Safari / Web 用户访问的 PWA 前端
│  ├─ server.js                   # API + MCP 服务
│  ├─ package.json
│  └─ render.yaml                 # Render 从 server/ 单独部署时可用
├─ docs/                          # 补充教程
├─ render.yaml                    # Render 一键部署配置，rootDir 指向 server
├─ .github/workflows/
│  ├─ build-debug-apk.yml         # Android APK 自动打包
│  ├─ package-source-zip.yml      # 打包源码 ZIP
│  └─ unpack-zip-overwrite.yml    # 上传 ZIP 后解压覆盖仓库
└─ README.md
```

---

# 傻瓜教程：最快跑起来

## 方案 A：Render 一键部署后端（推荐）

### 1. Fork 或上传到自己的 GitHub 仓库

把这个项目放到你的 GitHub 仓库里。仓库可以叫：

```text
cineisle
```

### 2. 点一键部署按钮

README 顶部有按钮：

```text
Deploy to Render
```

点开后，Render 会读取根目录 `render.yaml`，自动创建一个 Web Service，并把服务根目录设为 `server`。

本版已经把一键部署参数写在根目录 `render.yaml` 里：Root Directory 会自动指向 `server`，Build Command 会使用 npm 官方源重新安装依赖，并检查 `express` / `cors` 是否可用。一般情况下不需要手动改 Render 设置。

如果你把仓库名改了，需要把 README 顶部按钮里的链接改成你的仓库地址，例如：

```markdown
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/你的用户名/你的仓库名)
```

### 3. 设置后端 Token

Render 会自动生成环境变量：

```text
CINEISLE_TOKEN
```

你也可以手动改成自己记得住的值。这个 Token 用来保护写入接口和 MCP 操作。

旧版环境变量 `LINJIAN_CINEMA_TOKEN` 仍兼容，但公开版推荐使用 `CINEISLE_TOKEN`。

### 4. 拿到后端地址

部署成功后，Render 会给你一个地址，例如：

```text
https://cineisle-server.onrender.com
```

打开这个地址，会看到 **映屿 CineIsle Web/PWA** 页面。打开：

```text
https://你的 Render 地址/api/health
```

返回 `ok: true` 就说明后端成功了。

### Render 部署失败排查

如果日志里出现：

```text
npm error Exit handler never called!
Error: Cannot find module 'express'
```

通常不是你操作错了，而是依赖没有成功安装。请确认你使用的是 v0.4.1 或更新版本，并优先使用根目录的 `render.yaml` 一键部署。

手动配置时请保持：

```text
Root Directory: server
Build Command: npm install --package-lock=false --no-audit --no-fund && npm run check
Start Command: npm start
NODE_VERSION: 20
```

本项目公开包不再附带 `server/package-lock.json`，避免旧锁文件里的私有 npm 镜像地址导致 Render 无法下载依赖。

### 5. Android App / iOS PWA 填写后端地址

Android App 设置里填写：

```text
后端地址：https://你的 Render 地址
Token：你的 CINEISLE_TOKEN
昵称：观影人A / 你自己的名字
AI 名字：观影助手 / 你自己的 AI 名字
```

iOS 用户直接用 Safari 打开 Render 地址，在页面内填写同样的后端地址和 Token。因为 PWA 和后端在同一个 Render 地址上，后端地址默认会自动填当前网址。

### 6. 创建房间并导入视频

一台设备创建房间，另一台设备输入房间号加入。

两边都点「导入影片」，选择本地同一部视频文件。之后就可以同步播放、暂停、跳转、发弹幕和写笔记。

---

## iOS 使用方式：Safari 添加到主屏幕

不需要 Apple Developer 账号，不需要 TestFlight。

1. 用 iPhone 的 **Safari** 打开你的 Render 地址。
2. 点底部分享按钮。
3. 选择「添加到主屏幕」。
4. 桌面出现「映屿」图标后，从桌面打开。
5. 填写后端地址、Token、昵称和 AI 名字。
6. 创建/加入房间，导入本地影片和字幕。

注意：iOS 浏览器不能像 Android App 一样拿到全局系统权限。PWA 版不会控制别的 App，也不会后台偷偷截图；它只在映屿页面里工作。浏览器也不能永久保存本地视频文件本体，所以重新打开后通常需要重新选择影片。

---

## 方案 B：局域网部署后端（同一 Wi‑Fi 内使用）

这个方案适合宿舍、家里、同一个 Wi‑Fi 下测试，不需要 Render。

### 1. 电脑安装 Node.js

建议 Node.js 18 或更新版本。

### 2. 在电脑上启动后端

进入项目的 `server` 文件夹：

```bash
cd server
npm install --package-lock=false --no-audit --no-fund
```

Windows PowerShell：

```powershell
$env:CINEISLE_TOKEN="change-me"
npm start
```

macOS / Linux：

```bash
export CINEISLE_TOKEN=change-me
npm start
```

看到类似下面的输出就成功了：

```text
CineIsle server: http://localhost:8787
```

### 3. 查电脑局域网 IP

Windows：

```cmd
ipconfig
```

找 `IPv4 地址`，一般像这样：

```text
192.168.1.5
```

macOS：

```bash
ipconfig getifaddr en0
```

Linux：

```bash
ip addr
```

### 4. 手机填写局域网地址

手机和电脑必须连同一个 Wi‑Fi。Android App 或 iOS Safari 页面里填写：

```text
后端地址：http://电脑IP:8787
Token：change-me
```

例如：

```text
http://192.168.1.5:8787
```

浏览器打开下面这个地址能看到页面，就说明手机能连到电脑后端：

```text
http://电脑IP:8787
```

如果打不开，常见原因是电脑防火墙拦截了 8787 端口，允许 Node.js 通过防火墙即可。

---

# Android APK 打包

## 用 GitHub Actions 自动打包

项目自带：

```text
.github/workflows/build-debug-apk.yml
```

推送到 GitHub 后，进入：

```text
Actions → Build Android APK → Run workflow
```

构建成功后，在 Artifacts 下载：

```text
cineisle-android-debug-apk
```

里面会有：

```text
app-debug.apk
```

把 APK 发到 Android 手机安装即可。

## 本地打包

如果你本地有 Android 构建环境：

```bash
gradle :app:assembleDebug
```

APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

---

# GitHub 工作流：上传 ZIP 覆盖旧仓库

适合你在 ChatGPT 里拿到新版 ZIP 后，把旧仓库直接更新。

### 第一次使用

先把新版 ZIP 里的 `.github/workflows/unpack-zip-overwrite.yml` 合进仓库。之后就可以长期用这个工作流更新。

### 使用步骤

1. 把新版 ZIP 上传/提交到仓库根目录，例如：

```text
cineisle-update.zip
```

2. 打开 GitHub：

```text
Actions → Unpack ZIP and overwrite repo → Run workflow
```

3. `zip_file` 填：

```text
cineisle-update.zip
```

4. 运行后，workflow 会自动：

```text
解压 ZIP → 去掉多余根目录 → 覆盖仓库文件 → 删除 ZIP → 提交并 push
```

如果 ZIP 里只有一个总文件夹，比如 `cineisle-main/`，workflow 会自动识别并把里面的内容覆盖到仓库根目录，不会多套一层文件夹。

---

# GitHub 工作流：打包源码 ZIP

项目自带：

```text
.github/workflows/package-source-zip.yml
```

进入：

```text
Actions → Package source ZIP → Run workflow
```

运行成功后，在 Artifacts 下载：

```text
cineisle-source-zip
```

它会自动排除：`.git`、`node_modules`、Android build 产物、已有 ZIP 等临时文件。

---

# 字幕感知与画面截图

## 导入字幕

放映厅里点「导入字幕」，选择本地字幕文件。支持：

```text
.srt / .vtt / .ass / .ssa
```

建议优先选择简体中文或中英双语字幕。ASS/SSA 字幕会自动解析 `Dialogue:` 台词，并尽量清理样式标签、位置代码和绘图代码。

## Android 低频截图

低频截图需要两步：

1. 在 App 里打开「自动截图 ON」；
2. 到系统无障碍设置里开启「映屿画面同步」。

开启后，App 只会在映屿处于前台时低频上传画面截图。横屏里也可以点右侧抽屉的「给{AI 名字}看一眼」来请求立即截图一次。

如果截图没有出现，可以先看 App 里的「截图状态」提示，常见情况包括：

```text
未截图：映屿不在前台
系统截图失败：请确认无障碍权限
HTTP 403：Token 不一致
HTTP 413：截图太大
已请求截图，等待上传
截图已上传
```

## iOS/PWA 手动看一眼

PWA 不能调用 iOS 全局截图权限，但可以在页面里对当前导入的本地视频帧做一次手动截图上传。点：

```text
给 AI 看一眼
```

如果浏览器限制当前视频帧读取，页面会提示失败；这种情况不影响播放同步、聊天、弹幕、字幕和笔记。

---

# MCP 接入教程

后端自带 MCP 接口：

```text
https://你的后端地址/mcp?token=你的 CINEISLE_TOKEN
```

例如：

```text
https://cineisle-server.onrender.com/mcp?token=change-me
```

## MCP 工具列表

| 工具名 | 作用 |
| --- | --- |
| `create_room` | 创建观影房间 |
| `get_room_state` | 读取房间状态、播放进度、聊天、笔记和卡片 |
| `send_room_message` | 发送聊天或弹幕 |
| `control_playback` | 同步播放、暂停、跳转进度 |
| `add_note` | 添加时间轴观影笔记 |
| `generate_card` | 生成或更新观影卡片 |
| `request_screenshot` | 请求手机端在映屿前台立即上传一张低频截图；默认请求者会使用房间里的 AI 名字 |
| `get_viewing_context` | 读取播放状态、当前字幕、最近字幕和可选截图 |

## 给 AI 的示例指令

```text
请创建一个 CineIsle 观影房间，电影名是 Her，主题是 night，观影人是 A × B。
```

```text
请读取房间 ABC123 的当前状态，然后发一条弹幕：这一幕很漂亮。
```

```text
请请求房间 ABC123 的手机端上传一张当前画面截图，然后读取观影上下文。
```

```text
请读取房间 ABC123 的当前字幕和最近字幕，并告诉我刚刚剧情大概发生了什么。
```

```text
请根据房间 ABC123 的观影笔记生成一张电影票根。
```

---

# 安全和隐私说明

- CineIsle 不提供影视资源。
- CineIsle 不上传本地视频文件。
- 「影厅」只保存本机影片信息、片名和上次进度。
- 后端会保存房间状态、聊天、弹幕、笔记、观影卡片、字幕上下文和最近 5 张截图摘要。
- Android 截图功能默认不会偷偷开启，需要用户在 App 内打开开关，并启用系统无障碍服务。
- Android 截图只在映屿 App 前台时上传。
- iOS/PWA 不具备全局控制或后台截图权限，只能在映屿页面内工作。
- Render 免费服务可能会休眠，首次打开可能需要等待几十秒。
- 公开部署时请设置 `CINEISLE_TOKEN`，不要把 Token 发到公开评论区或截图里。

---

# 版本

当前公开版：

```text
CineIsle Public v0.4.0 PWA
```

公开版已移除私人称呼和私密标识，适合开源、自部署和二次定制。
