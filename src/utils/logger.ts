/**
 * Simple logging utility
 *
 * @param context Log context (typically file or class name)
 * @returns Logger object
 */
export function createLogger(context: string) {
  return {
    info: (message: string, data?: unknown) => {},
    warn: (message: string, data?: unknown) => {},
    error: (message: string, data?: unknown) => {},
    debug: (message: string, data?: unknown) => {},
  };
}
