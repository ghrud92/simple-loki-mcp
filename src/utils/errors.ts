/**
 * Loki 클라이언트 관련 에러
 */
export class LokiClientError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    options?: { cause?: Error; details?: Record<string, any> }
  ) {
    super(message, { cause: options?.cause });
    this.name = "LokiClientError";
    this.code = code;
    this.details = options?.details;
  }
}

/**
 * Loki 인증 관련 에러
 */
export class LokiAuthError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    options?: { cause?: Error; details?: Record<string, any> }
  ) {
    super(message, { cause: options?.cause });
    this.name = "LokiAuthError";
    this.code = code;
    this.details = options?.details;
  }
}
