/**
 * Loki query options type definition
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
 * Default constants
 */
export const DEFAULT_LIMIT = 1000;
