# Gateway CLI

The `gateway-cli` is a command-line interface (CLI) tool designed as a wrapper around the NostrMCPGateway, forming an integral part of the ContextVM ecosystem. It allows you to expose your MCP server through the nostr network, facilitating configuration and deployment of your MCP server through nostr.
## Overview

This CLI provides a streamlined way to interact with the NostrMCPGateway, enabling you to:
- Define and manage server parameters.
- Configure Nostr relays for communication.
- Specify public key allowances for secure interactions.
- Control encryption modes.

Its design prioritizes flexibility, allowing configuration parameters to be set through multiple sources with a clear precedence:

1.  **CLI Flags (Highest Priority):** Command-line arguments take precedence over all other configuration methods.
2.  **Environment Variables:** Values set as environment variables are overridden by CLI flags but supersede configuration file settings.
3.  **Configuration File (Lowest Priority):** A YAML-based configuration file (`contextgw.config.yml`) provides default settings that can be overridden by environment variables or CLI flags.

This layered approach ensures robust and adaptable deployment scenarios.

## Installation

### From binaries

**💡Tip:** Choose this installation method if you don't have Deno installed in your system, and you dont want to install it.
You can download the latest release from the [releases page](https://github.com/contextvm/gateway-cli/releases).

**Instructions:**
- Pick the appropriate binary for your system (Linux, macOS, Windows).
- Download the binary and make it executable (e.g., `chmod +x gateway-cli-linux`).
- Move the binary to a directory in your system's PATH (e.g., `/usr/local/bin`).

### With Deno

**💡Tip:** This installation method is recommended if you have Deno installed in your system.

**Instructions:**
- You can just run it with `deno run -A jsr:@contextvm/gateway-cli`.
- You can also install it with `deno install -A gateway-cli jsr:@contextvm/gateway-cli`.

**Note:** The `-A` flag grants the cli all the permissions, if you want to run or install it with scoped permissions, you can use `deno run --allow-run --allow-env --allow-net --allow-read --allow-write jsr:@contextvm/gateway-cli`.

## Usage

### Configuration Precedence

The `gateway-cli` loads configuration in the following order of precedence, where higher numbers override lower numbers:

1.  **CLI Flags**: `--server`, `--private-key`, `--relays`, `--public`, `--server-info-name`, `--server-info-picture`, `--server-info-website`, `--allowed-public-keys`, `--encryption-mode`.
2.  **Environment Variables**: `GW_SERVER`, `GW_PRIVATE_KEY`, `GW_RELAYS`, `GW_PUBLIC`, `GW_SERVER_INFO_NAME`, `GW_SERVER_INFO_PICTURE`, `GW_SERVER_INFO_WEBSITE`, `GW_ALLOWED_PUBLIC_KEYS`, `GW_ENCRYPTION_MODE`.
3.  **Configuration File**: `contextgw.config.yml` (e.g., `server:`, `privateKey:`, `relays:`, etc.)

### Example Configuration File (`contextgw.config.example.yml`)

You can create a `contextgw.config.yml` file in your project root to store default configurations.

```yaml
# contextgw.config.yml
server: "node src/__mocks__/mock-mcp-server.ts"
privateKey: "your-private-key-here"
relays:
  - "wss://relay.damus.io"
  - "wss://relay.primal.net"
public: true
serverInfo:
  name: "My Nostr Gateway"
  picture: "https://example.com/logo.png"
  website: "https://example.com"
allowedPublicKeys:
  - "pubkey1"
  - "pubkey2"
encryptionMode: "REQUIRED" # Options: REQUIRED, OPTIONAL, DISABLED
```

### Running the Gateway CLI

You can run the `gateway-cli` using the methods described above.

**Using `deno`:**

```bash
deno run -A jsr:@contextvm/gateway-cli [options]
```

Replace `[options]` with CLI flags to override configuration settings.

**Example with CLI flags:**

```bash
deno run -A jsr:@contextvm/gateway-cli --private-key "private-key" --relays "wss://relay.com" --server command arg1 arg2 --server-info-name "My MCP server over nostr" --server-info-picture "https://example.com/logo.png" --server-info-website "https://example.com" --allowed-public-keys "pubkey1,pubkey2" --encryption-mode "REQUIRED"
```

This command will start the gateway, overriding the settings from the configuration file or environment variables if exists with the provided CLI values.

## Development

### Prerequisites

- Deno 2.x

### Running from Source

```bash
deno task start
```

### Running Tests

```bash
deno task test
```