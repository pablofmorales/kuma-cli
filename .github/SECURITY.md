# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in kuma-cli, **do not open a public GitHub issue**.

Please report it privately:

- **Email:** security@blackasteroid.com.ar
- **Response time:** We aim to acknowledge within 48 hours and provide a fix or mitigation within 7 days for critical issues.

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We will credit you in the release notes unless you prefer to remain anonymous.

## Supported Versions

Only the latest published version on npm is actively supported. Please update before reporting.

```bash
npm install -g @blackasteroid/kuma-cli@latest
```

## Known Security Considerations

### Credential handling

- **Session tokens** are stored in plaintext at `~/.config/kuma-cli-nodejs/config.json` with `0600` permissions (readable only by the owning user). OS-level keychain integration is planned for a future release.

- **Notification secrets** (webhook URLs, bot tokens) should always be passed via environment variables, never as literal flag values. Literal values appear in shell history (`~/.zsh_history`, `~/.bash_history`) and process listings (`ps aux`).

  ✅ Correct:
  ```bash
  export DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
  kuma notifications create --type discord --name "Alerts" --discord-webhook '$DISCORD_WEBHOOK'
  ```

  ❌ Avoid:
  ```bash
  kuma notifications create --type discord --name "Alerts" --discord-webhook https://discord.com/api/webhooks/TOKEN
  ```

### Network security

- The CLI will warn when connecting to a Kuma instance over plain HTTP (`http://`). Always use HTTPS in production environments — credentials and session tokens are transmitted over the WebSocket connection.

### Push tokens

- Push monitor tokens are cryptographically random (48 hex chars from `crypto.getRandomValues`). Keep them secret; anyone with the token can send heartbeats.

### Upgrade integrity

- `kuma upgrade` installs the specific version confirmed from GitHub Releases (e.g., `@blackasteroid/kuma-cli@1.2.0`) rather than `@latest` to reduce exposure to supply chain attacks on the npm registry.
