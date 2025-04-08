import { execFile, exec, spawn } from "child_process";
import util from "util";
import { LokiAuth } from "./loki-auth.js";
import { createLogger } from "./logger.js";
import { LokiClientError } from "./errors.js";
import { LokiQueryBuilder, LokiQueryOptions } from "./loki-query-builder.js";

const execFilePromise = util.promisify(execFile);

// execFile error type definition
interface ExecError extends Error {
  stderr?: string;
  code?: number;
}

export class LokiClient {
  private auth: LokiAuth;
  private queryBuilder: LokiQueryBuilder;
  private logger = createLogger("LokiClient");

  /**
   * LokiClient constructor
   * @param auth LokiAuth instance for dependency injection (optional)
   * @param queryBuilder LokiQueryBuilder instance for dependency injection (optional)
   */
  constructor(auth?: LokiAuth, queryBuilder?: LokiQueryBuilder) {
    this.auth = auth || new LokiAuth();
    this.queryBuilder = queryBuilder || new LokiQueryBuilder();
    this.logger.debug("LokiClient initialized");
  }

  /**
   * Execute Loki query
   * @param query Loki query string
   * @param options query options
   * @returns query result
   */
  async queryLoki(
    query: string,
    options: LokiQueryOptions = {}
  ): Promise<string> {
    this.logger.debug("Executing Loki query", { query, options });
    console.log("Executing Loki query", { query, options });

    try {
      const cmd = "logcli";

      // Authentication arguments
      const authArgs = this.auth.getAuthArgs();

      // Global options (placed before query)
      const globalArgs = this.queryBuilder.buildGlobalArgs(options);

      // Query command (without query string)
      const queryCmd = ["query"];

      // Query specific options
      const querySpecificArgs: string[] = [];

      // Start time option
      if (options.from) {
        querySpecificArgs.push(`--from=${options.from.toISOString()}`);
      }

      // End time option
      if (options.to) {
        querySpecificArgs.push(`--to=${options.to.toISOString()}`);
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

      // Final command array combination (order is important)
      // [auth args] [global options] query [query specific args] [query string]
      const allArgs = [
        ...authArgs,
        ...globalArgs,
        ...queryCmd,
        ...querySpecificArgs,
        query,
      ];

      this.logger.debug("Executing log CLI query command", {
        cmd,
        args: allArgs,
      });

      // Execute command
      const { stdout } = await execFilePromise(cmd, allArgs);
      return stdout;
    } catch (error: unknown) {
      const execError = error as ExecError;
      const errorMsg =
        execError.stderr || execError.message || String(execError);
      console.error("Query execution error:", errorMsg);

      throw new LokiClientError(
        "query_execution_failed",
        `LogCLI query error: ${errorMsg}`,
        { cause: execError }
      );
    }
  }

  /**
   * Get all available labels
   * @returns list of labels
   */
  async getLabels(): Promise<string[]> {
    this.logger.debug("Retrieving label list");

    try {
      const cmd = "logcli";

      // Authentication arguments
      const authArgs = this.auth.getAuthArgs();

      // Label command
      const labelCmd = ["labels"];

      // Final command array combination
      const allArgs = [...authArgs, ...labelCmd];

      this.logger.debug("Executing log CLI labels command", {
        cmd,
        args: allArgs,
      });

      // Use execFile - prevent shell interpretation
      const { stdout } = await execFilePromise(cmd, allArgs);

      // Parse results (split by line and remove empty lines)
      const labels = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      return labels;
    } catch (error: unknown) {
      const execError = error as ExecError;
      const errorMsg =
        execError.stderr || execError.message || String(execError);
      this.logger.error("Log CLI execution failed", {
        error: execError,
        errorMsg,
      });
      throw new LokiClientError(
        "execution_failed",
        `LogCLI error: ${errorMsg}`,
        { cause: execError }
      );
    }
  }

  /**
   * Get all values for a specific label
   * @param labelName label name
   * @returns list of label values
   */
  async getLabelValues(labelName: string): Promise<string[]> {
    this.logger.debug("Retrieving label values list", { labelName });

    try {
      const cmd = "logcli";

      // Authentication arguments
      const authArgs = this.auth.getAuthArgs();

      // Label command and label name
      const labelCmd = ["labels", labelName];

      // Final command array combination
      const allArgs = [...authArgs, ...labelCmd];

      this.logger.debug("Executing log CLI label values command", {
        cmd,
        args: allArgs,
      });

      // Use execFile - prevent shell interpretation
      const { stdout } = await execFilePromise(cmd, allArgs);

      // Parse results (split by line and remove empty lines)
      const labelValues = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      return labelValues;
    } catch (error: unknown) {
      // Enhance type safety
      const execError = error as ExecError;
      const errorMsg =
        execError.stderr || execError.message || String(execError);
      this.logger.error("Log CLI execution failed", {
        error: execError,
        errorMsg,
      });
      throw new LokiClientError(
        "execution_failed",
        `LogCLI error: ${errorMsg}`,
        { cause: execError }
      );
    }
  }
}
