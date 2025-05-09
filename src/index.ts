#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  JsonRpcErrorCode,
  createJsonRpcError,
  createToolErrorResponse,
} from "./utils/errors.js";
import { createLogger } from "./utils/logger.js";
import { LokiClient } from "./utils/loki-client.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { DEFAULT_LIMIT } from "./utils/loki-query-options.js";

// Create logger
const logger = createLogger("MCPServer");

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = resolve(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

// Handle server-level errors (transport, connection, etc.)
function handleServerError(errorType: string, error: Error | unknown): void {
  // Create a standard JSON-RPC error object
  const jsonRpcError = createJsonRpcError(
    JsonRpcErrorCode.ServerError,
    error instanceof Error ? error.message : String(error),
    {
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      errorType,
    }
  );

  logger.error(`MCP ${errorType} error`, {
    error,
    jsonRpcError,
  });
}

// Create server
const server = new McpServer({
  name: "loki-query-server",
  version: packageJson.version,
  description: "MCP server for querying Loki logs via logcli",
});

const lokiClient = new LokiClient();

logger.info("Server initialization complete");

// Loki query tool
server.tool(
  "query_loki",
  {
    query: z.string().describe("Loki query string"),
    from: z
      .string()
      .optional()
      .describe(
        "Start timestamp in UTC (e.g. '2023-01-01T12:00:00Z'). Relative time expressions like '1h ago' are not supported. Use ISO 8601 format."
      ),
    to: z
      .string()
      .optional()
      .describe(
        "End timestamp in UTC (e.g. '2023-01-01T13:00:00Z'). Relative time expressions like 'now' are not supported. Use ISO 8601 format."
      ),
    limit: z
      .number()
      .optional()
      .refine((val) => val === undefined || val <= DEFAULT_LIMIT, {
        message: `Maximum limit value is ${DEFAULT_LIMIT}`,
      })
      .describe(
        `Maximum number of logs to return. Maximum value is ${DEFAULT_LIMIT}`
      ),
    batch: z.number().optional().describe("Batch size for query results"),
    output: z
      .enum(["default", "raw", "jsonl"])
      .optional()
      .describe(
        "Output format - valid values are 'default' (formatted log lines), 'raw' (unprocessed log lines), or 'jsonl' (JSON Lines format). Note: values like 'text' or 'json' are not supported."
      ),
    quiet: z.boolean().optional().describe("Suppress query metadata"),
    forward: z
      .boolean()
      .optional()
      .describe("Display results in chronological order"),
  },
  async ({ query, from, to, ...restOptions }, extra) => {
    logger.debug("Loki query tool execution", {
      query,
      from,
      to,
      restOptions,
      extra,
    });

    try {
      // Convert string dates to Date objects
      const options = {
        ...restOptions,
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      };

      const result = await lokiClient.queryLoki(query, options);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.debug("Loki query tool execution error details", {
        error,
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      logger.error("Loki query tool execution error", { query, error });

      // Log the error
      logger.error(
        "Loki query error:",
        error instanceof Error ? error.message : String(error)
      );

      // Create standardized error response
      return createToolErrorResponse(error, "Error running Loki query", {
        query,
        options: { from, to, ...restOptions },
      });
    }
  }
);

// Label values query tool
server.tool(
  "get_label_values",
  {
    label: z.string().describe("Label name to get values for"),
  },
  async ({ label }, extra) => {
    logger.debug("Label values query tool execution", { label, extra });

    try {
      const valuesJson = await lokiClient.getLabelValues(label);

      return {
        content: [
          {
            type: "text",
            text: valuesJson,
          },
        ],
      };
    } catch (error) {
      logger.error("Label values query tool execution error", { label, error });

      // Create standardized error response
      return createToolErrorResponse(error, "Error getting label values", {
        label,
      });
    }
  }
);

// Get all labels tool
server.tool("get_labels", {}, async (_args, extra) => {
  logger.debug("All labels query tool execution", { extra });

  try {
    const labelsJson = await lokiClient.getLabels();

    return {
      content: [
        {
          type: "text",
          text: labelsJson,
        },
      ],
    };
  } catch (error) {
    logger.error("Labels query tool execution error", { error });

    // Create standardized error response
    return createToolErrorResponse(error, "Error getting labels");
  }
});

// Initialize error handling for message processing
// This function sets up appropriate event handlers for the server
function setupErrorHandlers(server: McpServer): void {
  try {
    // Set up handlers for process-level errors
    process.on("uncaughtException", (error) => {
      handleServerError("transport", error);
      // Don't exit the process, just log the error
    });

    process.on("unhandledRejection", (reason) => {
      handleServerError(
        "transport",
        reason instanceof Error ? reason : new Error(String(reason))
      );
      // Don't exit the process, just log the error
    });

    // Add a handler for when the server is initialized
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server.server as any).oninitialized = () => {
      logger.info("Server fully initialized");
    };

    logger.info("Error handlers initialized");
  } catch (error) {
    logger.warn("Could not initialize all error handlers", error);
  }
}

// Apply error handlers before connecting
setupErrorHandlers(server);

// Start server
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    logger.info("Loki MCP server has started");
  })
  .catch((err) => {
    handleServerError("connection", err);
  });
