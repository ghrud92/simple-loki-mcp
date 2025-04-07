import { execFile, exec, spawn } from "child_process";
import util from "util";
import { LokiAuth } from "./loki-auth.js";
import { createLogger } from "./logger.js";
import { LokiClientError } from "./errors.js";
import { LokiQueryBuilder, LokiQueryOptions } from "./loki-query-builder.js";

const execFilePromise = util.promisify(execFile);

// execFile 에러 타입 정의
interface ExecError extends Error {
  stderr?: string;
  code?: number;
}

export class LokiClient {
  private auth: LokiAuth;
  private queryBuilder: LokiQueryBuilder;
  private logger = createLogger("LokiClient");

  /**
   * LokiClient 생성자
   * @param auth 의존성 주입을 위한 LokiAuth 인스턴스 (선택적)
   * @param queryBuilder 의존성 주입을 위한 LokiQueryBuilder 인스턴스 (선택적)
   */
  constructor(auth?: LokiAuth, queryBuilder?: LokiQueryBuilder) {
    this.auth = auth || new LokiAuth();
    this.queryBuilder = queryBuilder || new LokiQueryBuilder();
    this.logger.debug("LokiClient 초기화됨");
  }

  /**
   * Loki 쿼리 실행
   * @param query Loki 쿼리 문자열
   * @param options 쿼리 옵션
   * @returns 쿼리 결과
   */
  async queryLoki(
    query: string,
    options: LokiQueryOptions = {}
  ): Promise<string> {
    this.logger.debug("Loki 쿼리 실행", { query, options });
    console.log("Loki 쿼리 실행", { query, options });

    try {
      const cmd = "logcli";

      // 인증 인자
      const authArgs = this.auth.getAuthArgs();

      // 전역 옵션 (query 앞에 위치)
      const globalArgs = this.queryBuilder.buildGlobalArgs(options);

      // 쿼리 명령 (쿼리 문자열 없이)
      const queryCmd = ["query"];

      // 쿼리 특정 옵션들
      const querySpecificArgs: string[] = [];

      // 시작 시간 옵션
      if (options.from) {
        querySpecificArgs.push(`--from=${options.from.toISOString()}`);
      } else {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        querySpecificArgs.push(`--from=${oneHourAgo}`);
      }

      // 종료 시간 옵션
      if (options.to) {
        querySpecificArgs.push(`--to=${options.to.toISOString()}`);
      } else {
        querySpecificArgs.push(`--to=now`);
      }

      // 결과 제한 옵션
      if (options.limit) {
        querySpecificArgs.push(`--limit=${options.limit}`);
      }

      // 배치 크기 옵션
      if (options.batch) {
        querySpecificArgs.push(`--batch=${options.batch}`);
      }

      // 결과 정렬 방향 옵션
      if (options.forward) {
        querySpecificArgs.push("--forward");
      }

      // 최종 명령 배열 조합 (순서 중요)
      // [인증 인자] [전역 옵션] query [쿼리 특정 인자] [쿼리 문자열]
      const allArgs = [
        ...authArgs,
        ...globalArgs,
        ...queryCmd,
        ...querySpecificArgs,
        query,
      ];

      this.logger.debug("로그 CLI 쿼리 명령어 실행", {
        cmd,
        args: allArgs,
      });

      // 명령어 실행
      const { stdout } = await execFilePromise(cmd, allArgs);
      return stdout;
    } catch (error: unknown) {
      const execError = error as ExecError;
      const errorMsg =
        execError.stderr || execError.message || String(execError);
      console.error("쿼리 실행 오류:", errorMsg);

      throw new LokiClientError(
        "query_execution_failed",
        `LogCLI query error: ${errorMsg}`,
        { cause: execError }
      );
    }
  }

  /**
   * 사용 가능한 모든 라벨 조회
   * @returns 라벨 목록
   */
  async getLabels(): Promise<string[]> {
    this.logger.debug("라벨 목록 조회");

    try {
      const cmd = "logcli";

      // 인증 인자
      const authArgs = this.auth.getAuthArgs();

      // 라벨 명령
      const labelCmd = ["labels"];

      // 최종 명령 배열 조합
      const allArgs = [...authArgs, ...labelCmd];

      this.logger.debug("로그 CLI 라벨 명령어 실행", { cmd, args: allArgs });

      // execFile 사용 - 쉘 해석 방지
      const { stdout } = await execFilePromise(cmd, allArgs);

      // 결과 파싱 (줄 단위로 분할하고 공백 제거)
      const labels = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      return labels;
    } catch (error: unknown) {
      const execError = error as ExecError;
      const errorMsg =
        execError.stderr || execError.message || String(execError);
      this.logger.error("로그 CLI 실행 실패", { error: execError, errorMsg });
      throw new LokiClientError(
        "execution_failed",
        `LogCLI error: ${errorMsg}`,
        { cause: execError }
      );
    }
  }

  /**
   * 특정 라벨의 모든 값 조회
   * @param labelName 라벨 이름
   * @returns 라벨 값 목록
   */
  async getLabelValues(labelName: string): Promise<string[]> {
    this.logger.debug("라벨 값 목록 조회", { labelName });

    try {
      const cmd = "logcli";

      // 인증 인자
      const authArgs = this.auth.getAuthArgs();

      // 라벨 명령 및 라벨 이름
      const labelCmd = ["labels", labelName];

      // 최종 명령 배열 조합
      const allArgs = [...authArgs, ...labelCmd];

      this.logger.debug("로그 CLI 라벨 값 명령어 실행", {
        cmd,
        args: allArgs,
      });

      // execFile 사용 - 쉘 해석 방지
      const { stdout } = await execFilePromise(cmd, allArgs);

      // 결과 파싱 (줄 단위로 분할하고 공백 제거)
      const labelValues = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      return labelValues;
    } catch (error: unknown) {
      // 타입 안전성 강화
      const execError = error as ExecError;
      const errorMsg =
        execError.stderr || execError.message || String(execError);
      this.logger.error("로그 CLI 실행 실패", { error: execError, errorMsg });
      throw new LokiClientError(
        "execution_failed",
        `LogCLI error: ${errorMsg}`,
        { cause: execError }
      );
    }
  }
}
