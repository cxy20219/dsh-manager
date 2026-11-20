# 插槽契约查询

浏览器半边要往别的包的插槽里塞东西时，先查这个插槽的**契约**，不要照着渲染结果猜。

`harness/tool/slot-contract.mjs` 从已安装的应用里读出客户端模块运行器随包发布的**插槽目录**，
打印每个插槽的：种类（single/keyed/list/hoc/chain）、作用域、注册时必须带的选项、
谁声明了它、谁占了它，以及一段官方示例。

```bash
node harness/tool/slot-contract.mjs --list chat              # 按名字找插槽
node harness/tool/slot-contract.mjs conversation.chat.user.before
```

## 为什么必须有它

插槽的注册形状要求**随种类而变**，少一个选项就会在注册时被拒绝：

- `single` / `keyed` / `list` / `hoc` 各自要求 `key` / `id` 之类；
- `chain` 必须带 `select(owner)`——第一个返回非 null 的条目当选，返回值作为 `matched` 传给它。

被拒绝的注册要么抛错、要么被 try/catch 吞掉，**表现都是「东西没出现」**，
和「插槽还没声明」几乎无法区分。

## 读目录的代价

目录在 `app.asar` 里，普通 Node 读不到；脚本用运行中的 Electron 运行时
（`ELECTRON_RUN_AS_NODE=1`）读出来，和 `panel-preview.mjs` 读主题样式一个路子。
