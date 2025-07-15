import { parseArgs, type ParseOptions } from "@std/cli/parse-args";
import { NostrMCPGateway } from "@contextvm/sdk/gateway";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PrivateKeySigner } from "@contextvm/sdk/signer/private-key-signer";
import { SimpleRelayPool } from "@contextvm/sdk/relay/simple-relay-pool";
import meta from "./deno.json" with { type: "json" };
import { loadConfig } from "./src/config.ts";
import { EncryptionMode } from "@contextvm/sdk";
function printUsage() {
  console.log(`
Usage: gateway-cli [OPTIONS]

Options:
  --server <command> [...args]         The command and arguments to start the MCP server. (Env: GW_SERVER)
  --private-key <hex-key>             The Nostr private key in hex format. (Env: GW_PRIVATE_KEY)
  --relays <urls...>                  A list of Nostr relay URLs, separated by commas. (Env: GW_RELAYS)
  --public                            Announce the server publicly for discovery. (Env: GW_PUBLIC)
  --server-info-name <name>           The name of the server to be displayed in the server info. (Env: GW_SERVER_INFO_NAME)
  --server-info-picture <url>         The URL of the server's picture. (Env: GW_SERVER_INFO_PICTURE)
  --server-info-website <url>         The URL of the server's website. (Env: GW_SERVER_INFO_WEBSITE)
  --allowed-public-keys <keys...>     A list of allowed public keys. (Env: GW_ALLOWED_PUBLIC_KEYS)
  --encryption-mode <mode>            The encryption mode to use. Can be 'none', 'nip04', or 'nip44'. (Env: GW_ENCRYPTION_MODE)
  -h, --help                          Show this help message.
  -v, --version                       Show the version number.

Configuration can also be provided via a 'contextgw.config.yml' file or environment variables.
Priority: CLI flags > contextgw.config.yml > environment variables.
  `);
}

const options: ParseOptions = {
  boolean: ["help", "version"],
  alias: { h: "help", v: "version" },
};
const args = parseArgs(Deno.args, options);

if (args.help) {
  printUsage();
  Deno.exit(0);
}

if (args.version) {
  console.log((meta as { version?: string }).version ?? "0.1.0");
  Deno.exit(0);
}

async function main() {
  const config = await loadConfig(Deno.args);

  const [command, ...commandArgs] = config.server;

  const mcpServerTransport = new StdioClientTransport({
    command: command,
    args: commandArgs,
  });

  const signer = new PrivateKeySigner(config.privateKey);
  const relayPool = new SimpleRelayPool(config.relays);

  const gateway = new NostrMCPGateway({
    mcpServerTransport,
    nostrTransportOptions: {
      signer,
      relayHandler: relayPool,
      isPublicServer: config.public,
      serverInfo: config.serverInfo,
      allowedPublicKeys: config.allowedPublicKeys,
      encryptionMode: config.encryptionMode as EncryptionMode,
    },
  });

  await gateway.start();

  const shutdown = async () => {
    console.log("Received signal, shutting down gracefully...");
    if (gateway) {
      try {
        await gateway.stop();
      } catch (error) {
        console.error("Error stopping NostrMCPGateway:", error);
      }
    }
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Failed to start gateway:", error);
    Deno.exit(1);
  });
}
