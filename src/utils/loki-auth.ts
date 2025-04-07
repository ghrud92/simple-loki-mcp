import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import os from "os";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { LokiAuthError } from "./errors.js";

// Zod 스키마로 설정 유효성 검사
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
      // 환경 변수에서 설정 로드
      this.loadFromEnv();

      // 설정 파일에서 로드 (환경 변수보다 우선순위 낮음)
      this.loadFromConfigFile();

      // 설정 유효성 검사
      this.validateConfig();

      this.logger.debug("인증 설정 로드 완료", { addr: this.config.addr });
    } catch (error) {
      this.logger.error("인증 설정 로드 중 오류 발생", { error });
      throw new LokiAuthError(
        "config_load_error",
        "인증 설정을 로드하는 중 오류가 발생했습니다",
        { cause: error as Error }
      );
    }
  }

  private loadFromEnv() {
    // 환경 변수에서 설정 로드
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

    this.logger.debug("환경 변수에서 설정 로드됨");
  }

  private loadFromConfigFile() {
    // 설정 파일 경로 (우선순위 순)
    const configPaths = [
      process.env.LOKI_CONFIG_PATH, // 사용자 지정 경로
      path.join(process.cwd(), "logcli-config.yaml"), // 현재 디렉토리
      path.join(os.homedir(), ".logcli-config.yaml"), // 홈 디렉토리
    ].filter(Boolean) as string[];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, "utf8");
          const parsedConfig = yaml.load(configContent) as LokiAuthConfig;

          // 환경 변수에서 설정되지 않은 값만 설정 파일에서 로드
          this.config = { ...parsedConfig, ...this.config };
          this.logger.debug(`설정 파일 로드됨: ${configPath}`);
          break;
        } catch (error) {
          this.logger.warn(`설정 파일 로드 실패: ${configPath}`, { error });
        }
      }
    }
  }

  // 설정 유효성 검사
  private validateConfig() {
    try {
      LokiAuthConfigSchema.parse(this.config);
    } catch (error) {
      this.logger.warn("Loki 설정 유효성 검사 실패", { error });
      // 경고만 출력하고 오류로 처리하지는 않음 (선택적 필드이므로)
    }

    if (!this.config.addr) {
      this.logger.warn("Loki 서버 주소(addr)가 설정되지 않았습니다");
    }
  }

  // logcli 명령어에 인증 관련 인자 추가
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

  // 현재 설정 정보 반환 (MCP 리소스로 노출 가능)
  public getConfig(): Partial<LokiAuthConfig> {
    // 비밀번호와 토큰은 제외
    const { password, bearer_token, ...safeConfig } = this.config;
    return safeConfig;
  }

  // 설정 유효성 확인
  public isConfigValid(): boolean {
    return !!this.config.addr;
  }
}
