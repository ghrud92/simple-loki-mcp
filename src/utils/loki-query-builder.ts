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
 * Loki query builder class
 * Converts various options to logcli command line arguments.
 */
export class LokiQueryBuilder {
  /**
   * Generate global option arguments (positioned before the query command)
   * @param options query options
   * @returns array of global command line arguments
   */
  public buildGlobalArgs(options: LokiQueryOptions = {}): string[] {
    const globalArgs: string[] = [];

    // Quiet output option (global option)
    if (options.quiet) {
      globalArgs.push("--quiet");
    }

    // Output format option (global option)
    if (options.output) {
      globalArgs.push(`--output=${options.output}`);
    }

    return globalArgs;
  }

  /**
   * Generate query-specific option arguments (positioned after the query command)
   * @param options query options
   * @returns array of query-specific command line arguments
   */
  public buildQuerySpecificArgs(options: LokiQueryOptions = {}): string[] {
    const querySpecificArgs: string[] = [];

    // Start time option
    if (options.from) {
      querySpecificArgs.push(`--from=${options.from.toISOString()}`);
    } else {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      querySpecificArgs.push(`--from=${oneHourAgo}`);
    }

    // End time option
    if (options.to) {
      querySpecificArgs.push(`--to=${options.to.toISOString()}`);
    } else {
      querySpecificArgs.push(`--to=now`);
    }

    // Result limit option
    if (options.limit) {
      querySpecificArgs.push(`--limit=${options.limit}`);
    }

    // Batch size option
    if (options.batch) {
      querySpecificArgs.push(`--batch=${options.batch}`);
    }

    // Result sorting direction option
    if (options.forward) {
      querySpecificArgs.push("--forward");
    }

    return querySpecificArgs;
  }

  /**
   * Generate stream mode specific arguments
   * @returns array of stream mode specific arguments
   */
  public buildStreamArgs(): string[] {
    return ["--tail"];
  }
}
