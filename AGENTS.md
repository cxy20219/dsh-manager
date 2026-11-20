> 在执行任何操作前，必须先根据下方文件索引查阅获取足够上下文，确认信息充分后再行动；`harness/harness.md` 是必须查阅的项目总览。
# 文档索引，按需查阅

- [Harness 开发指南](harness/harness.md)：dsh-manager 项目总览：资源分层（workflow/experience/tool/resources）、面板的浏览器半边结构、视觉核对走离线预览而行为核对走 npm test 的分工，以及常用入口指向。
- [面板 UI 约定与验证方式](harness/experience/panel-ui-conventions.md)：dsh-manager 面板的结构与验证约定：顶层页签与子页挂载规则、工具目录的单一来源、DSH 语义变量与主题属性、locale 死键判断、client-render 测试入口，以及桌面版 GUI 打不开时怎么用离线预览做视觉核对。
- [panel-preview.md](harness/tool/panel-preview.md)：dsh-manager 面板的离线预览工具说明：为什么桌面版 GUI 打不开、预览怎么拼出来、asar 读取与主题样式的坑、预览不能替代 npm test 的边界。
- [panel-preview.mjs](harness/tool/panel-preview.mjs)：面板离线预览脚本：用真实 client.js、真实 Host 主题样式和假的 /api/manager 回答在浏览器里渲染管理面板。桌面版 GUI 只认带令牌的 URL 时，改完面板想在浏览器里看一眼、或要截图核对明暗两套主题时用它。
