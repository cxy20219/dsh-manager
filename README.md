# dsh-manager

One sidebar entry in the DeepSeek Harness Web UI that manages what an agent
runs on and how you reach it: **skills**, **MCP servers**, and **LAN access**.

- **技能** — scans `~/.agents/skills/` one level deeper than the built-in
  filesystem provider: each directory is a category, each child is a skill
  (`<category>/<skill>/SKILL.md`). Categories and single skills can be switched
  off; a disabled category never enters the agent's skill catalog. Bodies are
  still loaded on demand, so a catalog entry costs its name and description only.
- **目录核对** — the skills tab also reports what the agent's registry actually
  offers, merged across every provider (`ctx.skills.list`). Top-level skills and
  bundled providers therefore show up in the totals, and a skill the manager
  considers active but the registry does not list is called out as shadowed or
  missing instead of silently counting as loaded.
- **MCP** — add, edit, enable, disable, remove and reconnect local stdio MCP
  servers. Discovered tools register on `ctx.tools` as
  `mcp__<server>__<tool>`, with the same naming contract the shipped MCP bridge
  uses. Environment values live in the Host credential store, never in the
  plugin's settings file.
- **局域网访问** — one switch opens an encrypted door on this machine's LAN
  address. The panel prints a QR code; a phone or tablet that scans it opens
  the same GUI over HTTPS and drives this Harness with the same rights as the
  local browser. The listener exists only while the switch is on, and it binds
  one concrete address, never every interface.

## Install

From this directory:

```bash
dsh plugin --profile desktop add /Users/chengxinyu/Desktop/AI-work/dsh-manger
```

Or through the Plugin Manager in the Web UI. The bundle inserts one Host row
(`dsh-manager`) and one Client module; no dependencies are installed, so the
install works offline.

After installation, reload the Web page once. The entry appears in the left
rail next to the other global panels.

## Skill layout

```text
~/.agents/skills/
  dev/
    webapp-testing/SKILL.md
    flat-skill.md            # flat files work too
  office/
    docx/SKILL.md
  ego-browser -> …           # a top-level skill; the filesystem provider owns it
```

The manager skips directories that have their own `SKILL.md` (top-level skills)
and hidden directories. A skill is skipped in the panel with the parser's reason
when its frontmatter is invalid. If two categories expose the same skill name,
the first one (category order, then folder order) registers and the rest show
`重名，未注册`.

The provider registers at rank 550, below the filesystem provider's user roots
(500), so a top-level override still wins a name collision.

## MCP servers

Only `stdio` transport is supported. The form fields map directly to a child
process: command, one argument per line, an optional absolute working directory,
and `KEY=VALUE` environment lines.

- The child environment starts from the ambient environment minus names matching
  `KEY|PASSWORD|SECRET|TOKEN` and `DSH_*`; explicit environment entries are added
  on top.
- Environment values are written to the credential store as the record
  `dsh-manager/<server-id>` (`api-key` kind with an `env` map). The settings file
  keeps only the key names, and the panel never reads values back.
- Tools are re-synced when the server sends `notifications/tools/list_changed`.
  A crashed server shows an error and keeps its row; use **重新连接**. There is
  no automatic reconnect loop.
- Tool results are forwarded as text. Images, audio and embedded binary
  resources are represented by a short diagnostic instead of base64.
- Each server runs as a child process of the Host with your OS user's
  privileges. The permission preset's sandbox does not confine it; only the
  environment is scrubbed.

## LAN access

The Harness web server owns exactly one listener and binds loopback, and the
shipped composition refuses a wildcard bind on purpose. The plugin therefore
leaves the kernel alone: it opens its own HTTPS listener on one concrete LAN
address and forwards every request to the running web server.

- The certificate is self-signed and issued for that address. It is cached
  under the manager's data folder and reissued when the address changes.
- `Host` and `Origin` are rewritten to the upstream's own authority, because
  that authority is the loopback one the Host's browser fence trusts. Cookies,
  bodies and the WebSocket upgrade are forwarded unchanged.
- The QR code carries the Host's launch token. The first visit exchanges it
  for a signed session cookie exactly as a local browser does, and the token
  leaves the address bar in the redirect that follows.
- The link grants owner rights, so it is shown only while the switch is on.
  Turning the switch off closes the port at once; the switch state is
  remembered and the listener comes back on the next start.

| What | Where |
|---|---|
| Manager settings (0600) | `<DSH_HOME>/manager/settings.json`, default `~/.dsh/manager/settings.json` |
| LAN switch and port | the same file, under `lan` |
| TLS material (0600) | `<DSH_HOME>/manager/lan-access/tls/` |
| MCP environment values | the Host credential store, record `dsh-manager/<server-id>` |
| Skill files | `~/.agents/skills/` (top of the configured roots) |

Set an absolute `dataDir` in the row's config to move the settings folder. The
plugin never rewrites the profile patch.

## Limits

- Skill discovery is one category level; deeper nesting is ignored.
- The catalog check covers global providers only: project-level skill roots need
  a workspace, so they never appear in the panel's totals.
- A scan is reused for up to a second to keep the overview cheap; a watcher
  event, a switch, or **重新扫描** drops it immediately.
- MCP transport is stdio only; Streamable HTTP is not implemented.
- Servers configured with the shipped `@deepseek-ai/dsh-mcp-client` rows are
  not imported. This panel manages its own stdio list, so the two don't
  silently share a server namespace.
- Skill deletion is not offered — the panel creates and switches, the file
  manager deletes.
- The MCP list panel reflects state in four-second polls while the tab is open.
- The LAN listener needs `openssl` on the machine to issue the certificate.
  Without it the switch reports the reason instead of opening a port.
- The listener binds one address, never `0.0.0.0`. macOS does not route a
  connection from this machine to its own LAN address, so the link has to be
  opened from another device on the network — the phone is the intended one.
- macOS asks once whether the Harness app may accept incoming connections.
  Without that permission the phone cannot reach the port.
- The certificate is self-signed, so the phone browser calls the page unsafe
  on the first visit and the user has to continue anyway.
- The QR code is generated in the plugin (byte mode, error correction level M,
  versions 1 to 10), so a link longer than 213 bytes cannot be encoded.

## Development

```bash
npm test          # frontmatter, category scan, MCP client, QR encoder, LAN proxy, host wiring
```

Source map:

| File | Role |
|---|---|
| `index.js` | Host entry: provider registration, MCP start, LAN listener, `/api/manager` routes |
| `src/frontmatter.js` | `SKILL.md` frontmatter subset reader |
| `src/skills.js` | category scan, `ctx.skills` provider, switches, create |
| `src/mcp-client.js` | dependency-free stdio MCP client and tool-name contract |
| `src/mcp.js` | server rows, connections, tool registration, credential-backed env |
| `src/lan-access.js` | LAN address detection, self-signed certificate, HTTPS proxy |
| `src/qr.js` | dependency-free QR encoder |
| `src/settings.js` | atomic manager settings store |
| `src/remote.js` | panel endpoints and the merged agent-catalog view |
| `client.js` | sidebar entry and the management page |
