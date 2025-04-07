/**
 * 간단한 로깅 유틸리티
 *
 * @param context 로그 컨텍스트 (보통 파일이나 클래스 이름)
 * @returns 로거 객체
 */
export function createLogger(context: string) {
  return {
    info: (message: string, data?: Record<string, any>) => {
      console.info(`[INFO][${context}] ${message}`, data || "");
    },
    warn: (message: string, data?: Record<string, any>) => {
      console.warn(`[WARN][${context}] ${message}`, data || "");
    },
    error: (message: string, data?: Record<string, any>) => {
      console.error(`[ERROR][${context}] ${message}`, data || "");
    },
    debug: (message: string, data?: Record<string, any>) => {
      if (process.env.DEBUG) {
        console.debug(`[DEBUG][${context}] ${message}`, data || "");
      }
    },
  };
}
