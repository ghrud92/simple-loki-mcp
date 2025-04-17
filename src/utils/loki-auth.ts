import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import os from "os";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { LokiAuthError, JsonRpcErrorCode } from "./errors.js";

// Config validation using Zod schema
const LokiAuthConfigSchema = z.object({
  addr: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  tenant_id: z.string().optional(),
  bearer_token: z.string().optional(),
  bearer_token_file: z.string().optional(),
  ca_file: z.string().optional(),
  cert_file: z.string().optional(),
  key_file: z.string().optional(),
  org_id: z.string().optional(),
  tls_skip_verify: z.boolean().optional(),
});

export type LokiAuthConfig = z.infer<typeof LokiAuthConfigSchema>;

export class LokiAuth {
  private config: LokiAuthConfig = {};
  private logger = createLogger("LokiAuth");

  constructor() {
    try {
      // Load configuration from environment variables
      this.loadFromEnv();

      // Load from config file (lower priority than environment variables)
      this.loadFromConfigFile();

      // Validate configuration
      this.validateConfig();

      this.logger.debug("Authentication configuration loaded", {
        addr: this.config.addr,
      });
    } catch (error) {
      this.logger.error("Error loading authentication configuration", {
        error,
      });

      // Structure error code and details
      const cause = error as Error;
      throw new LokiAuthError(
        "config_load_error",
        "An error occurred while loading authentication configuration",
        {
          cause: cause,
          details: {
            message: cause.message,
            name: cause.name,
            stack: cause.stack,
            // Add original error's jsonRpcCode if available
            errorCode:
              (cause as { jsonRpcCode?: JsonRpcErrorCode }).jsonRpcCode ||
              JsonRpcErrorCode.ConfigError,
          },
        }
      );
    }
  }

  private loadFromEnv() {
    // Load configuration from environment variables
    if (process.env.LOKI_ADDR) this.config.addr = process.env.LOKI_ADDR;
    if (process.env.LOKI_USERNAME)
      this.config.username = process.env.LOKI_USERNAME;
    if (process.env.LOKI_PASSWORD)
      this.config.password = process.env.LOKI_PASSWORD;
    if (process.env.LOKI_TENANT_ID)
      this.config.tenant_id = process.env.LOKI_TENANT_ID;
    if (process.env.LOKI_BEARER_TOKEN)
      this.config.bearer_token = process.env.LOKI_BEARER_TOKEN;
    if (process.env.LOKI_BEARER_TOKEN_FILE)
      this.config.bearer_token_file = process.env.LOKI_BEARER_TOKEN_FILE;
    if (process.env.LOKI_CA_FILE)
      this.config.ca_file = process.env.LOKI_CA_FILE;
    if (process.env.LOKI_CERT_FILE)
      this.config.cert_file = process.env.LOKI_CERT_FILE;
    if (process.env.LOKI_KEY_FILE)
      this.config.key_file = process.env.LOKI_KEY_FILE;
    if (process.env.LOKI_ORG_ID) this.config.org_id = process.env.LOKI_ORG_ID;
    if (process.env.LOKI_TLS_SKIP_VERIFY)
      this.config.tls_skip_verify = process.env.LOKI_TLS_SKIP_VERIFY === "true";

    this.logger.debug("Configuration loaded from environment variables");
  }

  private loadFromConfigFile() {
    // Configuration file paths (in order of priority)
    const configPaths = [
      process.env.LOKI_CONFIG_PATH, // Custom path
      path.join(process.cwd(), "logcli-config.yaml"), // Current directory
      path.join(os.homedir(), ".logcli-config.yaml"), // Home directory
    ].filter(Boolean) as string[];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, "utf8");
          const parsedConfig = yaml.load(configContent) as LokiAuthConfig;

          // Only load values from config file that are not set in environment variables
          this.config = { ...parsedConfig, ...this.config };
          this.logger.debug(`Configuration file loaded: ${configPath}`);
          break;
        } catch (error) {
          this.logger.warn(`Failed to load configuration file: ${configPath}`, {
            error,
          });
        }
      }
    }
  }

  // Validate configuration
  private validateConfig() {
    try {
      LokiAuthConfigSchema.parse(this.config);
    } catch (error) {
      this.logger.warn("Loki configuration validation failed", { error });
      // Only log a warning, don't treat as error (fields are optional)
    }

    if (!this.config.addr) {
      this.logger.warn("Loki server address (addr) is not configured");
    }
  }

  // Add authentication arguments to logcli command
  public getAuthArgs(): string[] {
    const args: string[] = [];

    if (this.config.addr) args.push(`--addr=${this.config.addr}`);
    if (this.config.username) args.push(`--username=${this.config.username}`);
    if (this.config.password) args.push(`--password=${this.config.password}`);
    if (this.config.tenant_id)
      args.push(`--tenant-id=${this.config.tenant_id}`);
    if (this.config.bearer_token)
      args.push(`--bearer-token=${this.config.bearer_token}`);
    if (this.config.bearer_token_file)
      args.push(`--bearer-token-file=${this.config.bearer_token_file}`);
    if (this.config.ca_file) args.push(`--ca-file=${this.config.ca_file}`);
    if (this.config.cert_file)
      args.push(`--cert-file=${this.config.cert_file}`);
    if (this.config.key_file) args.push(`--key-file=${this.config.key_file}`);
    if (this.config.org_id) args.push(`--org-id=${this.config.org_id}`);
    if (this.config.tls_skip_verify) args.push("--tls-skip-verify");

    return args;
  }

  // Return current configuration info (can be exposed as MCP resource)
  public getConfig(): Partial<LokiAuthConfig> {
    // Password and token are excluded
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, bearer_token, ...safeConfig } = this.config;
    return safeConfig;
  }

  // Check if configuration is valid
  public isConfigValid(): boolean {
    return !!this.config.addr;
  }
}
