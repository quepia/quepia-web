# Install the Quepia remote MCP server

This guide connects supported MCP hosts to Quepia's production Streamable HTTP
endpoint:

```text
https://mcp.quepia.com/mcp
```

The canonical OAuth resource and access-token audience are the same exact URI:

```text
https://mcp.quepia.com/mcp
```

Do not start a client login until Quepia OAuth and Dynamic Client Registration
(DCR) are enabled in production. The MCP protected-resource metadata,
authorization-server discovery, authorization endpoint, token endpoint, and DCR
registration endpoint must all be reachable first. Otherwise, the clients below
cannot discover or register their OAuth application.

Use OAuth login. Do not place access tokens, refresh tokens, API keys, or client
secrets in a shared project configuration.

## Codex CLI, Codex IDE, and Codex-hosted ChatGPT desktop

Codex CLI and the Codex IDE extension share MCP configuration. A ChatGPT
desktop installation that exposes the same Codex host integration can also
surface those servers. This is distinct from the ChatGPT web Apps flow in the
next section; a general ChatGPT desktop installation must not be assumed to
read `config.toml`.

### Recommended: configure with the Codex CLI

```bash
codex mcp add quepia --url https://mcp.quepia.com/mcp --oauth-resource https://mcp.quepia.com/mcp
codex mcp login quepia
codex mcp list
```

The login command must open the browser-based Quepia OAuth consent flow. After
consent, `codex mcp list` must report `quepia` as authenticated and enabled.
Use `/mcp` in Codex to inspect the connected server.

### Equivalent `config.toml`

Add this to the user configuration at `~/.codex/config.toml`, or to
`.codex/config.toml` in a trusted project:

```toml
[mcp_servers.quepia]
url = "https://mcp.quepia.com/mcp"
auth = "oauth"
oauth_resource = "https://mcp.quepia.com/mcp"
```

Then run:

```bash
codex mcp login quepia
```

When the Codex-host integration is present in ChatGPT desktop, restart the app
after changing the configuration, open **Settings → MCP servers**, and select
**Authenticate** if the server still requires sign-in. Enter `/mcp` in the
composer to verify the connection. Otherwise, use the ChatGPT Apps flow below.

Codex uses a local OAuth callback listener. Its port is ephemeral unless the
top-level `mcp_oauth_callback_port` is configured. If
`mcp_oauth_callback_url` is configured, Codex appends a server-specific callback
ID; the authorization server must register the complete resulting redirect URI.

Official references:

- [OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)
- [OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)

## ChatGPT web

ChatGPT web does not read local Codex configuration. Quepia must be created as
a custom app in ChatGPT developer mode. Availability depends on the workspace
plan and administrator policy: Business, Enterprise, and Edu workspaces can
enable full MCP tools; Pro custom apps are currently limited to read/fetch
tools.

1. A workspace administrator enables developer mode under **Workspace
   settings → Permissions & Roles → Connected data**. The exact control is
   called **Developer mode** or **Create custom MCP connectors**, depending on
   the workspace plan.
2. An authorized administrator opens **Workspace settings → Apps → Create**.
   An authorized individual user may instead see **Settings → Apps → Create**.
3. Enter `https://mcp.quepia.com/mcp`, name the app `Quepia`, select OAuth, and
   choose **Scan tools**.
4. Complete the Quepia OAuth flow and create the app.
5. Enable the app from **Workspace settings → Apps → Drafts** if the workspace
   requires administrator publication.
6. Open **Settings → Apps**, connect Quepia, start a new chat, and select Quepia
   from the tools menu.

ChatGPT manages its OAuth client registration and callback. Do not copy a
callback URI from legacy plugin documentation into Quepia manually.

Supabase OAuth currently advertises `openid`, `email`, `profile`, and `phone`
but not `offline_access`. Supabase still issues refresh tokens; however,
ChatGPT's current guidance asks authorization servers to advertise
`offline_access` for durable refresh. Before declaring ChatGPT production
support, verify both initial connection and refresh after the access token has
expired. Do not advertise a scope that the authorization server rejects. If
ChatGPT requires `offline_access` rather than accepting Supabase refresh
tokens, ChatGPT support remains blocked until Supabase adds it or Quepia adopts
a compatible authorization layer.

Official references:

- [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)

## Claude web and Claude Desktop

Claude web and Claude Desktop use the same hosted remote-connector
infrastructure. Do not add this remote URL directly to
`claude_desktop_config.json`.

For an individual account:

1. Open **Customize → Connectors**.
2. Select **+ → Add custom connector**.
3. Enter `https://mcp.quepia.com/mcp`.
4. Leave the optional OAuth Client ID and Client Secret empty so Claude uses
   DCR.
5. Add the connector and select **Connect**.
6. Complete Quepia OAuth.

For Team or Enterprise, an Owner or Primary Owner first adds the URL under
**Organization settings → Connectors → Add → Custom → Web**. Users can then
connect it from **Customize → Connectors**.

The hosted Claude callback is:

```text
https://claude.ai/api/mcp/auth_callback
```

After authorization, the Quepia connector must show as connected and expose its
permitted tools. Claude's requests originate from Anthropic's cloud even when
the user runs Claude Desktop, so the production endpoint and OAuth discovery
routes must be publicly reachable.

Official references:

- [Claude remote MCP connectors](https://claude.com/docs/connectors/custom/remote-mcp)
- [Building Claude connectors](https://claude.com/docs/connectors/building)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)

## Cursor

Create `.cursor/mcp.json` for this project, or add the same entry to
`~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "quepia": {
      "url": "https://mcp.quepia.com/mcp"
    }
  }
}
```

No static `auth` block is required when DCR is enabled. Restart Cursor, open
Cursor's MCP settings, connect `quepia`, and complete the browser OAuth flow.

Cursor Agent CLI can verify the same configuration:

```bash
cursor-agent mcp login quepia
cursor-agent mcp list
cursor-agent mcp list-tools quepia
```

Supported callback allowlist:

```text
https://www.cursor.com/agents/mcp/oauth/callback
http://localhost:8787/callback
```

Quepia deliberately rejects custom-scheme callbacks such as
`cursor://anysphere.cursor-mcp/oauth/callback`. Cursor manages the callback URI;
`mcp.json` has no supported `redirect_uri` override. If a Cursor build still
uses the legacy custom scheme, update Cursor or use a different supported host;
do not weaken the server-wide redirect validation.

Official references:

- [Cursor MCP documentation](https://cursor.com/docs/mcp)
- [Cursor's callback migration notice](https://forum.cursor.com/t/oauth-redirect-uri-changed-from-cursor-to-http-localhost-for-streamable-http-mcp/165019/6)

## VS Code and GitHub Copilot Chat

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "quepia": {
      "type": "http",
      "url": "https://mcp.quepia.com/mcp"
    }
  }
}
```

Alternatively, run **MCP: Add Server** from the Command Palette and enter the
same URL. Save the configuration, select the **Start** or **Authenticate**
CodeLens above the server entry, trust the server when prompted, and complete
Quepia OAuth.

Quepia production supports DCR only. Do not enter or distribute a manual OAuth
Client ID or secret. If a host cannot complete DCR, that host is not supported
until it adds compatible OAuth discovery and registration.

The authorization server must allow both VS Code callbacks:

```text
http://127.0.0.1:33418
https://vscode.dev/redirect
```

Run **MCP: List Servers** and confirm `quepia` is running. In Copilot Chat, open
the tools picker and confirm that the permitted Quepia tools appear.

This setup applies to GitHub Copilot Chat inside VS Code. GitHub's hosted
Copilot coding agent and hosted code review do not support remote MCP servers
that require OAuth.

Official references:

- [Add and manage MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code MCP developer and OAuth guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [GitHub Copilot cloud MCP limitations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent)

## Verify the remote connection

After completing OAuth in a client:

1. Confirm the client reports `quepia` as connected and authenticated.
2. Confirm `accounting_list_accounts` and `accounting_list_expenses` are
   discoverable when the user has `accounting.read`.
3. Confirm the prepare, operation, and commit tools appear only when the user
   has `accounting.expense.write` and the control plane is not in read-only
   mode.
4. Invoke `accounting_list_accounts` and confirm the request completes without
   an OAuth, audience, or insufficient-scope error.
5. If authentication loops or fails, verify that OAuth/DCR is enabled, the
   client callback is allowlisted, and both authorization and token requests
   carry `resource=https://mcp.quepia.com/mcp`.

The protocol-level requirements behind these checks are defined in the
[MCP authorization specification, version 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
