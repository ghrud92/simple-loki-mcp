/**
 * Loki 쿼리 옵션 타입 정의
 */
export interface LokiQueryOptions {
  from?: Date;
  to?: Date;
  limit?: number;
  batch?: number;
  quiet?: boolean;
  forward?: boolean;
  output?: "default" | "raw" | "jsonl";
}

/**
 * Loki 쿼리 생성을 담당하는 클래스
 * 다양한 옵션을 받아 logcli 명령줄 인자로 변환합니다.
 */
export class LokiQueryBuilder {
  /**
   * 전역 옵션 인자 생성 (query 명령 이전에 위치)
   * @param options 쿼리 옵션
   * @returns 전역 명령줄 인자 배열
   */
  public buildGlobalArgs(options: LokiQueryOptions = {}): string[] {
    const globalArgs: string[] = [];

    // 간결한 출력 옵션 (전역 옵션)
    if (options.quiet) {
      globalArgs.push("--quiet");
    }

    // 결과 형식 옵션 (전역 옵션)
    if (options.output) {
      globalArgs.push(`--output=${options.output}`);
    }

    return globalArgs;
  }

  /**
   * 쿼리 특정 옵션 인자 생성 (query 명령 이후에 위치)
   * @param options 쿼리 옵션
   * @returns 쿼리 특정 명령줄 인자 배열
   */
  public buildQuerySpecificArgs(options: LokiQueryOptions = {}): string[] {
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

    return querySpecificArgs;
  }

  /**
   * 스트림 모드 특정 인자 생성
   * @returns 스트림 모드 특정 인자 배열
   */
  public buildStreamArgs(): string[] {
    return ["--tail"];
  }
}
