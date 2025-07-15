import { z } from "npm:zod";
import { deepMerge } from "https://deno.land/std@0.224.0/collections/deep_merge.ts";
import { load as parseYaml } from "npm:js-yaml";
import { parseArgs, type ParseOptions } from "@std/cli/parse-args";

const serverInfoSchema = z.object({
  name: z.string().optional(),
  picture: z.string().optional(),
  website: z.string().optional(),
});

export const configSchema = z.object({
  server: z.string().min(1, "Server command is required"),
  privateKey: z.string().min(1, "Private key is required"),
  relays: z.array(z.string()).min(1, "At least one relay is required"),
  public: z.boolean().optional().default(false),
  serverInfo: serverInfoSchema.optional(),
  allowedPublicKeys: z.array(z.string()).optional(),
  encryptionMode: z
    .enum(["OPTIONAL", "REQUIRED", "DISABLED"])
    .optional()
    .default("REQUIRED"),
});

export type Config = z.infer<typeof configSchema>;

const ENV_PREFIX = "GW_";
const ENV_VARS = {
  server: `${ENV_PREFIX}SERVER`,
  privateKey: `${ENV_PREFIX}PRIVATE_KEY`,
  relays: `${ENV_PREFIX}RELAYS`,
  public: `${ENV_PREFIX}PUBLIC`,
  serverInfoName: `${ENV_PREFIX}SERVER_INFO_NAME`,
  serverInfoPicture: `${ENV_PREFIX}SERVER_INFO_PICTURE`,
  serverInfoWebsite: `${ENV_PREFIX}SERVER_INFO_WEBSITE`,
  allowedPublicKeys: `${ENV_PREFIX}ALLOWED_PUBLIC_KEYS`,
  encryptionMode: `${ENV_PREFIX}ENCRYPTION_MODE`,
};

const YAML_CONFIG_PATH = "contextgw.config.yml";

function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {};

  if (Deno.env.get(ENV_VARS.server)) {
    config.server = Deno.env.get(ENV_VARS.server);
  }
  if (Deno.env.get(ENV_VARS.privateKey)) {
    config.privateKey = Deno.env.get(ENV_VARS.privateKey);
  }
  if (Deno.env.get(ENV_VARS.relays)) {
    config.relays = Deno.env.get(ENV_VARS.relays)?.split(",");
  }
  if (Deno.env.get(ENV_VARS.public)) {
    config.public = Deno.env.get(ENV_VARS.public) === "true";
  }
  const serverInfo: Partial<z.infer<typeof serverInfoSchema>> = {};
  if (Deno.env.get(ENV_VARS.serverInfoName)) {
    serverInfo.name = Deno.env.get(ENV_VARS.serverInfoName);
  }
  if (Deno.env.get(ENV_VARS.serverInfoPicture)) {
    serverInfo.picture = Deno.env.get(ENV_VARS.serverInfoPicture);
  }
  if (Deno.env.get(ENV_VARS.serverInfoWebsite)) {
    serverInfo.website = Deno.env.get(ENV_VARS.serverInfoWebsite);
  }
  if (Object.keys(serverInfo).length > 0) {
    config.serverInfo = serverInfo;
  }
  if (Deno.env.get(ENV_VARS.allowedPublicKeys)) {
    config.allowedPublicKeys = Deno.env
      .get(ENV_VARS.allowedPublicKeys)
      ?.split(",");
  }
  if (Deno.env.get(ENV_VARS.encryptionMode)) {
    config.encryptionMode = Deno.env.get(ENV_VARS.encryptionMode) as
      | "OPTIONAL"
      | "REQUIRED"
      | "DISABLED";
  }

  return config;
}

async function loadConfigFromYaml(): Promise<Partial<Config>> {
  try {
    const yamlContent = await Deno.readTextFile(YAML_CONFIG_PATH);
    return parseYaml(yamlContent) as Partial<Config>;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    throw error;
  }
}

function loadConfigFromCli(args: string[]): Partial<Config> {
  const cliOptions: ParseOptions = {
    boolean: ["help", "version", "public"],
    string: [
      "server",
      "private-key",
      "encryption-mode",
      "server-info-name",
      "server-info-picture",
      "server-info-website",
    ],
    collect: ["relays", "allowed-public-keys"],
    alias: { h: "help", v: "version" },
  };

  const parsedArgs = parseArgs(args, cliOptions);
  const config: Partial<Config> = {};

  if (parsedArgs.server) {
    config.server = Array.isArray(parsedArgs.server)
      ? parsedArgs.server.join(" ")
      : parsedArgs.server;
  }

  const positionalArgs = (parsedArgs._ as string[]).join(" ");
  if (positionalArgs && !config.server) {
    config.server = positionalArgs;
  }

  if (parsedArgs["private-key"]) config.privateKey = parsedArgs["private-key"];
  if (parsedArgs.relays) config.relays = parsedArgs.relays;
  if (parsedArgs.public) config.public = parsedArgs.public;
  if (parsedArgs["allowed-public-keys"]) {
    config.allowedPublicKeys = parsedArgs["allowed-public-keys"];
  }
  if (parsedArgs["encryption-mode"]) {
    config.encryptionMode = parsedArgs["encryption-mode"] as
      | "OPTIONAL"
      | "REQUIRED"
      | "DISABLED";
  }

  const serverInfo: Partial<z.infer<typeof serverInfoSchema>> = {};
  if (parsedArgs["server-info-name"]) {
    serverInfo.name = parsedArgs["server-info-name"];
  }
  if (parsedArgs["server-info-picture"]) {
    serverInfo.picture = parsedArgs["server-info-picture"];
  }
  if (parsedArgs["server-info-website"]) {
    serverInfo.website = parsedArgs["server-info-website"];
  }
  if (Object.keys(serverInfo).length > 0) {
    config.serverInfo = serverInfo;
  }

  return config;
}
export async function loadConfig(args: string[]): Promise<Config> {
  const envConfig = loadConfigFromEnv();
  const yamlConfig = await loadConfigFromYaml();
  const cliConfig = loadConfigFromCli(args);

  const mergedConfig = deepMerge(
    deepMerge(envConfig, yamlConfig, { arrays: "replace" }),
    cliConfig,
    { arrays: "replace" },
  );

  return configSchema.parse(mergedConfig);
}
