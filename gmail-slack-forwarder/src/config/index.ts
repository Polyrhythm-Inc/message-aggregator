import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, type Config } from './schema.js';

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace('~', homedir());
  }
  return resolve(path);
}

function camelCaseKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(camelCaseKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
        return [camelKey, camelCaseKeys(value)];
      })
    );
  }
  return obj;
}

export function loadConfig(configPath?: string): Config {
  const defaultConfigPath = '~/.gmail-slack-forwarder/config.yaml';
  const resolvedPath = expandPath(configPath ?? defaultConfigPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const rawConfig = parseYaml(content);
  const camelConfig = camelCaseKeys(rawConfig);

  const result = ConfigSchema.safeParse(camelConfig);

  if (!result.success) {
    const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid config:\n${errors}`);
  }

  const config = result.data;

  // Expand paths
  config.credentialsPath = expandPath(config.credentialsPath);
  config.dedupe.sqlitePath = expandPath(config.dedupe.sqlitePath);
  config.accounts = config.accounts.map(account => ({
    ...account,
    tokenPath: expandPath(account.tokenPath),
  }));

  return config;
}

export function getSlackBotToken(config: Config): string {
  const token = process.env[config.slack.botTokenEnv];
  if (!token) {
    throw new Error(`Environment variable ${config.slack.botTokenEnv} is not set`);
  }
  return token;
}

export * from './schema.js';
