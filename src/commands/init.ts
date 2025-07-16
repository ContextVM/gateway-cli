import { type Config, configSchema } from '../config.ts';
import { dump } from 'npm:js-yaml';
import { z } from 'npm:zod';

function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodBoolean) {
    return true;
  }
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault
  ) {
    return isBooleanSchema(schema.def.innerType as z.ZodTypeAny);
  }
  return false;
}

function promptForValue(
  key: string,
  schema: z.ZodTypeAny,
  isOptional: boolean,
): string | boolean | undefined | string[] {
  const description = schema.description || `Enter value for ${key}`;
  const promptMessage = `${key.toUpperCase()}: ${description}`;

  while (true) {
    let value: string | undefined | boolean;
    if (isBooleanSchema(schema)) {
      const answer = prompt(`${promptMessage} (y/n)`);
      if (isOptional && answer === '') return undefined;
      value = answer?.toLowerCase() === 'y';
    } else if (isOptional) {
      const response = prompt(`${promptMessage} (optional)`);
      if (!response) {
        return undefined;
      }
      value = response;
    } else {
      value = prompt(promptMessage) ?? '';
    }

    let parsedValue: string | boolean | undefined | string[] = value;
    if (schema instanceof z.ZodArray && typeof value === 'string') {
      parsedValue = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }

    const result = schema.safeParse(parsedValue);
    if (result.success) {
      return result.data as string | boolean | undefined | string[];
    } else {
      const flatError = z.treeifyError(result.error);
      const errorMessage = flatError.errors.toString();
      console.error(`❌ Invalid input for ${key}:`, errorMessage);
    }
  }
}

export async function initCommand() {
  const config: Partial<Config> = {};
  const shape = configSchema.shape;

  console.log('Welcome to the gateway configuration wizard!');
  console.log('Please follow the prompts to create your configuration file.');

  for (const key in shape) {
    const fieldSchema = shape[key as keyof typeof shape];

    if (key === 'serverInfo') {
      console.log('--- Server Metadata (optional) ---');
      const serverInfo: Partial<Config['serverInfo']> = {};
      const serverInfoSchema = configSchema.shape.serverInfo.def
        .innerType as z.ZodObject<z.ZodRawShape>;

      for (const subKey in serverInfoSchema.shape) {
        const subFieldSchema = serverInfoSchema.shape[subKey] as z.ZodTypeAny;
        const answer = promptForValue(
          subKey,
          subFieldSchema,
          subFieldSchema.safeParse(undefined).success,
        );
        if (answer !== undefined && answer !== '') {
          (serverInfo as Record<string, unknown>)[subKey] = answer;
        }
      }
      if (Object.keys(serverInfo).length > 0) {
        config.serverInfo = serverInfo;
      }
    } else {
      const isOptional = fieldSchema.safeParse(undefined).success;
      const answer = promptForValue(key, fieldSchema, isOptional);
      if (answer !== undefined) {
        (config as Record<string, unknown>)[key] = answer;
      }
    }
  }

  console.log('\n✅ Configuration complete! Here is your generated config:');
  const yamlConfig = dump(config);
  console.log(yamlConfig);

  const save = confirm(
    '💾 Do you want to save this configuration to contextgw.config.yml?',
  );
  if (save) {
    await Deno.writeTextFile('contextgw.config.yml', yamlConfig);
    console.log('✅ Configuration saved successfully!');
  } else {
    console.log('Configuration not saved.');
  }
}
