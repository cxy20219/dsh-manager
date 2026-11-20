---
title: 面板离线预览工具
summary: 不开 GUI 也能看面板长什么样：真实 client.js + 真实 Host 主题 + 假接口回答
---
# 面板离线预览（dsh-manager）

`harness/tool/panel-preview.mjs` 在浏览器里渲染管理面板，用的是**真的** `client.js`、**真的** Host 主题样式，
只有 `/api/manager` 的回答是假的。

## 为什么需要它

桌面版 GUI 的 web 服务只认应用自己打印的那条带启动令牌的 URL。别的浏览器（`ego-browser` 也一样）打开
只会得到 “dsh web authentication required”，直接调 `/api/manager/*` 一律 401。令牌是进程内随机值，不落盘，
没有别的办法拿到——**视觉核对只能由用户在自己的浏览器里刷新页面**。预览工具补上的是「改完就能自己看一眼」
这一步。

## 用法

```bash
npm install --prefix /tmp/dsh-preview-cache react@18 react-dom@18
DSH_NODE_EXECUTABLE="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  node harness/tool/panel-preview.mjs --react-dir /tmp/dsh-preview-cache/node_modules
# [preview] http://127.0.0.1:8123/ (tab: tools)
```

`--tab` 指定自动点开的页签，`--port` 换端口，`--out` 换输出目录。预览页支持 `?lang=en`。

## 它是怎么拼出来的

- **真实组件**：`client.js` 是普通脚本，调用 `window.__ModuleLoader__.load({id, factory})`。预览页自己实现
  这个 loader，`factory(require)` 里把 `'react'` 换成 UMD 版 React，然后照真实流程调 `plugin.apply(ctx)`，
  从 `ctx.slots.register('main', Panel)` 里拿到组件，用 ReactDOM 渲染。
- **真实样式**：`client.js` 里的 CSS 数组在 `apply` 时自己插进 `<head>`；Host 的主题变量由
  `dsh-client-ui-theme/src/styles/` 下的样式提供，用运行中的 Electron 运行时
  （`ELECTRON_RUN_AS_NODE=1` + `DSH_NODE_EXECUTABLE`）从 `app.asar` 里读出来。
- **真实文案**：预览页从 `client.js` 里取出 `zh` / `en` 两个字典并实现 `t(key, {占位符})`。
- **假接口**：全局 `fetch` 拦截 `/api/manager/<端点>`，返回脚本内置的夹具。

## 坑

- `app.asar` 里 **`fs.cpSync` 不认归档路径**（ENOENT），要逐个文件 `copyFileSync`；`readdirSync` 和
  `copyFileSync` 在 Electron 运行时里都能用。
- 主题样式**不止一个文件**：颜色在 `design-platform.css`，圆角 `--dsw-radius-*` 和 `--dsw-font-family`
  在 `base.css`。只取前者会看到直角、默认字体和失效的按钮。
- React 19 没有 UMD 包，预览用 React 18 的 `umd/react.production.min.js` 与
  `umd/react-dom.production.min.js`；面板只用 `createElement` / `useState` / `useEffect` /
  `useCallback` / `useRef`，18 足够。
- 主题是 `body[data-ds-dark-theme]` 这个**属性**：加它=暗色，去掉=亮色，没有 `prefers-color-scheme` 参与。
- 截图偶尔会拍到主题切换的中间帧，看起来像按钮配色错了；等 800ms 再截。
- **夹具的值必须是数据，不能是函数**：夹具整体走 `JSON.stringify` 写进 `fixtures.js`，函数值会被静默丢掉，
  表现为「接口永远返回没有夹具的错误」。写 `() => ({...})` 不会报错，只是那个端点根本没注册。

## 边界

预览**不能**替代 `npm test`：它只证明渲染得出来、样式不炸，不证明接口契约和行为。行为仍然由
`test/client-render.test.mjs`（真实 `client.js` + React 替身）和 `test/host.test.mjs`（真实 `apply()` +
假 Host）守着。
