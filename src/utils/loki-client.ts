import axios, { AxiosError } from "axios";
import { execFile } from "child_process";
import util from "util";
import { LokiClientError } from "./errors.js";
import { createLogger } from "./logger.js";
import { LokiAuth } from "./loki-auth.js";
import { LokiQueryBuilder, LokiQueryOptions } from "./loki-query-builder.js";

const execFilePromise = util.promisify(execFile);

// execFile error type definition
interface ExecError extends Error {
  stderr?: string;
  code?: number;
}

// Loki API response types
interface LokiApiResponse {
  status: string;
  data: {
    resultType: "vector" | "matrix" | "streams";
    result: Array<LokiStream | LokiVector | LokiMatrix>;
    stats?: Record<string, unknown>;
  };
}

interface LokiStream {
  stream: Record<string, string>;
  values: Array<[string, string]>; // [timestamp, log line]
}

interface LokiVector {
  metric: Record<string, string>;
  value: [number, string]; // [timestamp, value]
}

interface LokiMatrix {
  metric: Record<string, string>;
  values: Array<[number, string]>; // [timestamp, value]
}

export class LokiClient {
  private auth: LokiAuth;
  private queryBuilder: LokiQueryBuilder;
  private logger = createLogger("LokiClient");
  private hasLogCli: boolean | null = null;

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
   * Check if logcli is available on the system
   * @returns Promise<boolean> True if logcli is available
   */
  private async isLogCliAvailable(): Promise<boolean> {
    // Return cached value if we've already checked
    if (this.hasLogCli !== null) {
      return this.hasLogCli;
    }

    try {
      await execFilePromise("logcli", ["--version"]);
      this.hasLogCli = true;
      this.logger.debug("logcli is available");
      return true;
    } catch (error) {
      this.hasLogCli = false;
      this.logger.debug("logcli is not available, will use HTTP API");
      return false;
    }
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

    try {
      // Check if logcli is available and use it if possible
      if (await this.isLogCliAvailable()) {
        return this.queryLokiViaLogCli(query, options);
      } else {
        return this.queryLokiViaHttp(query, options);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Loki query failed", { error, errorMsg });

      // Re-throw if it's already a LokiClientError
      if (error instanceof LokiClientError) {
        throw error;
      }

      // Create a new error with standard format
      throw new LokiClientError(
        "query_execution_failed",
        `Loki query error: ${errorMsg}`,
        {
          cause: error as Error,
          details: {
            query,
            options,
          },
        }
      );
    }
  }

  /**
   * Execute Loki query using logcli
   * @param query Loki query string
   * @param options query options
   * @returns query result
   */
  private async queryLokiViaLogCli(
    query: string,
    options: LokiQueryOptions = {}
  ): Promise<string> {
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

      // Assign more specific error code
      const errorCode = execError.code
        ? `query_execution_failed_${execError.code}` // Specific error code based on exit code
        : "query_execution_failed";

      throw new LokiClientError(errorCode, `LogCLI query error: ${errorMsg}`, {
        cause: execError,
        details: {
          query,
          options,
          exitCode: execError.code,
          stderr: execError.stderr,
        },
      });
    }
  }

  /**
   * Execute Loki query using HTTP API
   * @param query Loki query string
   * @param options query options
   * @returns query result
   */
  private async queryLokiViaHttp(
    query: string,
    options: LokiQueryOptions = {}
  ): Promise<string> {
    try {
      const config = this.auth.getConfig();

      if (!config.addr) {
        throw new LokiClientError(
          "http_query_error",
          "Loki server address (addr) is not configured",
          { details: { query, options } }
        );
      }

      // Build URL and parameters for query_range endpoint
      const url = `${config.addr}/loki/api/v1/query_range`;
      const params: Record<string, string> = {
        query,
      };

      // Add time range parameters
      if (options.from) {
        params.start = options.from.toISOString();
      }

      if (options.to) {
        params.end = options.to.toISOString();
      }

      if (options.limit) {
        params.limit = options.limit.toString();
      }

      if (options.forward !== undefined) {
        params.direction = options.forward ? "forward" : "backward";
      }

      // Prepare request headers
      const headers: Record<string, string> = {};

      // Add authentication headers
      if (config.username && config.password) {
        const auth = Buffer.from(
          `${config.username}:${config.password}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      } else if (config.bearer_token) {
        headers["Authorization"] = `Bearer ${config.bearer_token}`;
      }

      if (config.tenant_id) {
        headers["X-Scope-OrgID"] = config.tenant_id;
      }

      if (config.org_id) {
        headers["X-Org-ID"] = config.org_id;
      }

      // Set output format if specified
      if (options.output) {
        if (options.output === "raw" || options.output === "jsonl") {
          headers["Accept"] = "application/json";
        }
      }

      this.logger.debug("Executing HTTP query", {
        url,
        params,
        headers: {
          ...headers,
          Authorization: headers.Authorization ? "[REDACTED]" : undefined,
        },
      });

      // Make the HTTP request
      const response = await axios.get<LokiApiResponse>(url, {
        params,
        headers,
        // Handle TLS options if specified
        ...(config.tls_skip_verify
          ? { httpsAgent: { rejectUnauthorized: false } }
          : {}),
      });

      // Format the response to match logcli output
      return this.formatHttpResponse(response.data, options);
    } catch (error: unknown) {
      let errorMsg = "HTTP query failed";
      let errorDetails: Record<string, unknown> = { query, options };

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMsg = `HTTP query failed: ${axiosError.message}`;
        errorDetails = {
          ...errorDetails,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
        };
      } else if (error instanceof Error) {
        errorMsg = `HTTP query failed: ${error.message}`;
      }

      throw new LokiClientError("http_query_error", errorMsg, {
        cause: error as Error,
        details: errorDetails,
      });
    }
  }

  /**
   * Format HTTP response to match logcli output format
   * @param responseData The response data from Loki HTTP API
   * @param options Query options
   * @returns Formatted string output
   */
  private formatHttpResponse(
    responseData: LokiApiResponse,
    options: LokiQueryOptions = {}
  ): string {
    if (!responseData || !responseData.data || !responseData.data.result) {
      return "No results found.";
    }

    const { resultType, result } = responseData.data;

    // For stream results (log lines)
    if (resultType === "streams") {
      let output = "";

      // Format each stream
      for (const stream of result as LokiStream[]) {
        const labels = this.formatLabels(stream.stream);

        if (!options.quiet) {
          output += `${labels}\n`;
        }

        // Format log lines
        for (const [timestamp, line] of stream.values) {
          if (options.output === "jsonl") {
            // JSON Lines format
            const entry = {
              timestamp,
              labels: stream.stream,
              line,
            };
            output += `${JSON.stringify(entry)}\n`;
          } else if (options.output === "raw") {
            // Raw format (just the line)
            output += `${line}\n`;
          } else {
            // Default format (timestamp and line)
            const date = new Date(parseInt(timestamp) / 1000000);
            output += `${date.toISOString()} ${line}\n`;
          }
        }

        if (!options.quiet) {
          output += "\n";
        }
      }

      return output;
    }

    // For vector or matrix results (metrics)
    else if (resultType === "vector" || resultType === "matrix") {
      let output = "";

      if (resultType === "vector") {
        for (const item of result as LokiVector[]) {
          const labels = this.formatLabels(item.metric);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const [_timestamp, value] = item.value; // Timestamp not needed for display
          output += `${labels} ${value}\n`;
        }
      } else {
        // matrix
        for (const item of result as LokiMatrix[]) {
          const labels = this.formatLabels(item.metric);
          output += `${labels}\n`;
          for (const [timestamp, value] of item.values) {
            const date = new Date(timestamp * 1000);
            output += `  ${date.toISOString()} ${value}\n`;
          }
          output += "\n";
        }
      }

      return output;
    }

    // Fallback: return raw JSON
    return JSON.stringify(responseData, null, 2);
  }

  /**
   * Format labels object to string representation
   * @param labels Labels object
   * @returns Formatted labels string
   */
  private formatLabels(labels: Record<string, string>): string {
    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(", ");
    return `{${labelPairs}}`;
  }

  /**
   * Get all available labels
   * @returns list of labels
   */
  async getLabels(): Promise<string[]> {
    this.logger.debug("Retrieving label list");

    try {
      // Check if logcli is available and use it if possible
      if (await this.isLogCliAvailable()) {
        return this.getLabelsViaLogCli();
      } else {
        return this.getLabelsViaHttp();
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Getting labels failed", { error, errorMsg });

      // Re-throw if it's already a LokiClientError
      if (error instanceof LokiClientError) {
        throw error;
      }

      // Create a new error with standard format
      throw new LokiClientError(
        "execution_failed",
        `Failed to get labels: ${errorMsg}`,
        {
          cause: error as Error,
          details: {
            command: "labels",
          },
        }
      );
    }
  }

  /**
   * Get all available labels using logcli
   * @returns list of labels
   */
  private async getLabelsViaLogCli(): Promise<string[]> {
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

      // Assign more specific error code
      const errorCode = execError.code
        ? `execution_failed_${execError.code}` // Specific error code based on exit code
        : "execution_failed";

      throw new LokiClientError(errorCode, `LogCLI error: ${errorMsg}`, {
        cause: execError,
        details: {
          command: "labels",
          exitCode: execError.code,
          stderr: execError.stderr,
        },
      });
    }
  }

  /**
   * Get all available labels using HTTP API
   * @returns list of labels
   */
  private async getLabelsViaHttp(): Promise<string[]> {
    try {
      const config = this.auth.getConfig();

      if (!config.addr) {
        throw new LokiClientError(
          "http_query_error",
          "Loki server address (addr) is not configured",
          { details: { command: "labels" } }
        );
      }

      // Build URL for labels endpoint
      const url = `${config.addr}/loki/api/v1/labels`;

      // Prepare request headers
      const headers: Record<string, string> = {};

      // Add authentication headers
      if (config.username && config.password) {
        const auth = Buffer.from(
          `${config.username}:${config.password}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      } else if (config.bearer_token) {
        headers["Authorization"] = `Bearer ${config.bearer_token}`;
      }

      if (config.tenant_id) {
        headers["X-Scope-OrgID"] = config.tenant_id;
      }

      if (config.org_id) {
        headers["X-Org-ID"] = config.org_id;
      }

      this.logger.debug("Executing HTTP labels query", {
        url,
        headers: {
          ...headers,
          Authorization: headers.Authorization ? "[REDACTED]" : undefined,
        },
      });

      // Make the HTTP request
      const response = await axios.get<{ status: string; data: string[] }>(
        url,
        {
          headers,
          // Handle TLS options
          ...(config.tls_skip_verify
            ? { httpsAgent: { rejectUnauthorized: false } }
            : {}),
        }
      );

      if (
        response.data &&
        response.data.data &&
        Array.isArray(response.data.data)
      ) {
        return response.data.data;
      }

      return [];
    } catch (error: unknown) {
      let errorMsg = "HTTP labels query failed";
      let errorDetails: Record<string, unknown> = { command: "labels" };

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMsg = `HTTP labels query failed: ${axiosError.message}`;
        errorDetails = {
          ...errorDetails,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
        };
      } else if (error instanceof Error) {
        errorMsg = `HTTP labels query failed: ${error.message}`;
      }

      throw new LokiClientError("http_query_error", errorMsg, {
        cause: error as Error,
        details: errorDetails,
      });
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
      // Check if logcli is available and use it if possible
      if (await this.isLogCliAvailable()) {
        return this.getLabelValuesViaLogCli(labelName);
      } else {
        return this.getLabelValuesViaHttp(labelName);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error("Getting label values failed", {
        error,
        errorMsg,
        labelName,
      });

      // Re-throw if it's already a LokiClientError
      if (error instanceof LokiClientError) {
        throw error;
      }

      // Create a new error with standard format
      throw new LokiClientError(
        "execution_failed",
        `Failed to get label values: ${errorMsg}`,
        {
          cause: error as Error,
          details: {
            command: "label values",
            labelName,
          },
        }
      );
    }
  }

  /**
   * Get all values for a specific label using logcli
   * @param labelName label name
   * @returns list of label values
   */
  private async getLabelValuesViaLogCli(labelName: string): Promise<string[]> {
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

      // Assign more specific error code
      const errorCode = execError.code
        ? `execution_failed_${execError.code}` // Specific error code based on exit code
        : "execution_failed";

      throw new LokiClientError(errorCode, `LogCLI error: ${errorMsg}`, {
        cause: execError,
        details: {
          command: "labels",
          labelName,
          exitCode: execError.code,
          stderr: execError.stderr,
        },
      });
    }
  }

  /**
   * Get all values for a specific label using HTTP API
   * @param labelName label name
   * @returns list of label values
   */
  private async getLabelValuesViaHttp(labelName: string): Promise<string[]> {
    try {
      const config = this.auth.getConfig();

      if (!config.addr) {
        throw new LokiClientError(
          "http_query_error",
          "Loki server address (addr) is not configured",
          { details: { command: "label values", labelName } }
        );
      }

      // Build URL for label values endpoint
      const url = `${config.addr}/loki/api/v1/label/${encodeURIComponent(
        labelName
      )}/values`;

      // Prepare request headers
      const headers: Record<string, string> = {};

      // Add authentication headers
      if (config.username && config.password) {
        const auth = Buffer.from(
          `${config.username}:${config.password}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      } else if (config.bearer_token) {
        headers["Authorization"] = `Bearer ${config.bearer_token}`;
      }

      if (config.tenant_id) {
        headers["X-Scope-OrgID"] = config.tenant_id;
      }

      if (config.org_id) {
        headers["X-Org-ID"] = config.org_id;
      }

      this.logger.debug("Executing HTTP label values query", {
        url,
        labelName,
        headers: {
          ...headers,
          Authorization: headers.Authorization ? "[REDACTED]" : undefined,
        },
      });

      // Make the HTTP request
      const response = await axios.get<{ status: string; data: string[] }>(
        url,
        {
          headers,
          // Handle TLS options
          ...(config.tls_skip_verify
            ? { httpsAgent: { rejectUnauthorized: false } }
            : {}),
        }
      );

      if (
        response.data &&
        response.data.data &&
        Array.isArray(response.data.data)
      ) {
        return response.data.data;
      }

      return [];
    } catch (error: unknown) {
      let errorMsg = "HTTP label values query failed";
      let errorDetails: Record<string, unknown> = {
        command: "label values",
        labelName,
      };

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMsg = `HTTP label values query failed: ${axiosError.message}`;
        errorDetails = {
          ...errorDetails,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
        };
      } else if (error instanceof Error) {
        errorMsg = `HTTP label values query failed: ${error.message}`;
      }

      throw new LokiClientError("http_query_error", errorMsg, {
        cause: error as Error,
        details: errorDetails,
      });
    }
  }
}
