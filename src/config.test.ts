import { assertEquals, assertExists } from 'jsr:@std/assert';
import { loadConfig } from './config.ts';
import * as yaml from 'npm:js-yaml';
import { EncryptionMode } from '@contextvm/sdk';

async function withTestContext(testFn: () => Promise<void>) {
  const envVarsToClean = [
    'GW_SERVER',
    'GW_PRIVATE_KEY',
    'GW_RELAYS',
    'GW_PUBLIC',
    'GW_SERVER_INFO_NAME',
    'GW_SERVER_INFO_PICTURE',
    'GW_SERVER_INFO_WEBSITE',
    'GW_ALLOWED_PUBLIC_KEYS',
    'GW_ENCRYPTION_MODE',
  ];
  let testError: unknown; // To store error from testFn

  try {
    await testFn();
  } catch (e) {
    testError = e; // Store the error
  } finally {
    try {
      await Deno.remove('contextgw.config.yml');
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        // Log the error or handle it, but do not re-throw
        console.error('Error during Deno.remove in finally block:', error);
      }
    }
    for (const key of envVarsToClean) {
      Deno.env.delete(key);
    }
  }
  // Re-throw the original error after cleanup if one occurred
  if (testError) {
    throw testError;
  }
}

Deno.test('Config Loader', async (t) => {
  const dummyPrivateKey = 'a'.repeat(64);
  await t.step(
    'should load configuration from environment variables',
    () =>
      withTestContext(async () => {
        Deno.env.set('GW_SERVER', 'node src/__mocks__/mock-mcp-server.ts');
        Deno.env.set(
          'GW_PRIVATE_KEY',
          'test-private-key'.concat(dummyPrivateKey),
        );
        Deno.env.set(
          'GW_RELAYS',
          'wss://relay.damus.io,wss://relay.primal.net',
        );
        Deno.env.set('GW_PUBLIC', 'true');
        Deno.env.set('GW_SERVER_INFO_NAME', 'test-server');
        Deno.env.set('GW_SERVER_INFO_PICTURE', 'https://example.com/logo.png');
        Deno.env.set('GW_SERVER_INFO_WEBSITE', 'https://example.com');
        Deno.env.set('GW_ALLOWED_PUBLIC_KEYS', 'pubkey1,pubkey2');
        Deno.env.set('GW_ENCRYPTION_MODE', EncryptionMode.REQUIRED);

        const config = await loadConfig([]);

        assertEquals(config.server, [
          'node',
          'src/__mocks__/mock-mcp-server.ts',
        ]);
        assertEquals(
          config.privateKey,
          'test-private-key'.concat(dummyPrivateKey),
        );
        assertEquals(config.relays, [
          'wss://relay.damus.io',
          'wss://relay.primal.net',
        ]);
        assertEquals(config.public, true);
        assertExists(config.serverInfo);
        assertEquals(config.serverInfo.name, 'test-server');
        assertEquals(config.serverInfo.picture, 'https://example.com/logo.png');
        assertEquals(config.serverInfo.website, 'https://example.com');
        assertEquals(config.allowedPublicKeys, ['pubkey1', 'pubkey2']);
        assertEquals(config.encryptionMode, EncryptionMode.REQUIRED);
      }),
  );

  await t.step(
    'should load configuration from a YAML file',
    () =>
      withTestContext(async () => {
        const testConfig = {
          server: ['node', 'src/__mocks__/mock-mcp-server.ts'],
          privateKey: 'yaml-private-key'.concat(dummyPrivateKey),
          relays: ['wss://relay.nostr.band', 'wss://nostr.public.cat'],
          public: false,
          serverInfo: {
            name: 'yaml-server',
            picture: 'https://example.com/logo.yml',
            website: 'https://example.yml',
          },
          allowedPublicKeys: ['pubkey3', 'pubkey4'],
          encryptionMode: EncryptionMode.DISABLED,
        };
        const yamlString = yaml.dump(testConfig);
        await Deno.writeTextFile('contextgw.config.yml', yamlString);

        const config = await loadConfig([]);

        assertEquals(config.server, [
          'node',
          'src/__mocks__/mock-mcp-server.ts',
        ]);
        assertEquals(
          config.privateKey,
          'yaml-private-key'.concat(dummyPrivateKey),
        );
        assertEquals(config.relays, [
          'wss://relay.nostr.band',
          'wss://nostr.public.cat',
        ]);
        assertEquals(config.public, false);
        assertExists(config.serverInfo);
        assertEquals(config.serverInfo.name, 'yaml-server');
        assertEquals(config.serverInfo.picture, 'https://example.com/logo.yml');
        assertEquals(config.serverInfo.website, 'https://example.yml');
        assertEquals(config.allowedPublicKeys, ['pubkey3', 'pubkey4']);
        assertEquals(config.encryptionMode, EncryptionMode.DISABLED);
      }),
  );

  await t.step(
    'should load configuration from CLI arguments',
    () =>
      withTestContext(async () => {
        const args = [
          '--server',
          'node',
          'src/__mocks__/mock-mcp-server.ts',
          '--private-key',
          'cli-private-key'.concat(dummyPrivateKey),
          '--relays',
          'wss://relay.snort.social',
          '--public',
          '--server-info-name',
          'cli-server',
          '--allowed-public-keys',
          'pubkey5',
          '--encryption-mode',
          EncryptionMode.OPTIONAL,
        ];

        const config = await loadConfig(args);
        assertEquals(config.server, [
          'node',
          'src/__mocks__/mock-mcp-server.ts',
        ]);
        assertEquals(
          config.privateKey,
          'cli-private-key'.concat(dummyPrivateKey),
        );
        assertEquals(config.relays, ['wss://relay.snort.social']);
        assertEquals(config.public, true);
        assertExists(config.serverInfo);
        assertEquals(config.serverInfo?.name, 'cli-server');
        assertEquals(config.allowedPublicKeys, ['pubkey5']);
        assertEquals(config.encryptionMode, EncryptionMode.OPTIONAL);
      }),
  );

  await t.step(
    'should merge configurations with the correct priority',
    () =>
      withTestContext(async () => {
        // 1. Set environment variables (lowest priority)
        Deno.env.set('GW_SERVER', 'env-server node-arg');
        Deno.env.set(
          'GW_PRIVATE_KEY',
          'env-private-key'.concat(dummyPrivateKey),
        );
        Deno.env.set('GW_RELAYS', 'env-relay1,env-relay2');

        // 2. Create YAML file (middle priority)
        const yamlConfig = {
          privateKey: 'yaml-private-key'.concat(dummyPrivateKey),
          relays: ['yaml-relay'],
        };
        const yamlString = yaml.dump(yamlConfig);
        await Deno.writeTextFile('contextgw.config.yml', yamlString);

        // 3. Define CLI arguments (highest priority)
        const args = ['--relays', 'cli-relay'];

        const config = await loadConfig(args);

        assertEquals(config.server, ['env-server', 'node-arg']); // From env
        assertEquals(
          config.privateKey,
          'yaml-private-key'.concat(dummyPrivateKey),
        ); // From yaml
        assertEquals(config.relays, ['cli-relay']); // From cli
      }),
  );
});
