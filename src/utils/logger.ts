/**
 * Simple logging utility
 *
 * @param context Log context (typically file or class name)
 * @returns Logger object
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
