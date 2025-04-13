#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LokiClientError, JsonRpcErrorCode } from "./utils/errors.js";
import { createLogger } from "./utils/logger.js";
import { LokiClient } from "./utils/loki-client.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Create logger
const logger = createLogger("MCPServer");

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = resolve(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const server = new McpServer({
  name: "loki-query-server",
  version: packageJson.version,
  description: "MCP server for querying Loki logs via logcli",
});

const lokiClient = new LokiClient();

logger.info("Server initialization complete");

// Loki query tool
server.tool(
  "query-loki",
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
      .describe("Maximum number of logs to return. Maximum value is 5000"),
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
  async ({ query, from, to, ...restOptions }) => {
    logger.debug("Loki query tool execution", { query, from, to, restOptions });

    // Debug log
    console.log("Loki query tool called with:", {
      query,
      from,
      to,
      restOptions,
    });

    try {
      // Convert string dates to Date objects
      const options = {
        ...restOptions,
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      };

      // Debug log
      console.log("Constructed options:", options);

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

      // Create structured error information
      const errorCode = error instanceof LokiClientError 
        ? error.jsonRpcCode 
        : JsonRpcErrorCode.InternalError;
        
      const errorMessage = error instanceof LokiClientError
        ? `${error.message} (code: ${error.jsonRpcCode}, ${error.code})`
        : `${error}`;

      // Construct error details
      const errorDetails = error instanceof LokiClientError
        ? error.details || {}
        : {};

      // Debug log
      console.error("Loki query error:", errorMessage);

      return {
        content: [
          {
            type: "text",
            text: `Error running Loki query: ${errorMessage}`,
          },
        ],
        isError: true,
        errorCode: errorCode,
        errorDetails: errorDetails
      };
    }
  }
);

// Label values query tool
server.tool(
  "get-label-values",
  {
    label: z.string().describe("Label name to get values for"),
  },
  async ({ label }) => {
    logger.debug("Label values query tool execution", { label });

    try {
      const values = await lokiClient.getLabelValues(label);

      return {
        content: [
          {
            type: "text",
            text: values.join("\n"),
          },
        ],
      };
    } catch (error) {
      logger.error("Label values query tool execution error", { label, error });

      // Create structured error information
      const errorCode = error instanceof LokiClientError 
        ? error.jsonRpcCode 
        : JsonRpcErrorCode.InternalError;
        
      const errorMessage = error instanceof LokiClientError
        ? `${error.message} (code: ${error.jsonRpcCode}, ${error.code})`
        : `${error}`;

      // Construct error details
      const errorDetails = error instanceof LokiClientError
        ? error.details || {}
        : {};

      return {
        content: [
          {
            type: "text",
            text: `Error getting label values: ${errorMessage}`,
          },
        ],
        isError: true,
        errorCode: errorCode,
        errorDetails: errorDetails
      };
    }
  }
);

// Get all labels tool
server.tool("get-labels", {}, async () => {
  logger.debug("All labels query tool execution");

  try {
    const labels = await lokiClient.getLabels();

    return {
      content: [
        {
          type: "text",
          text: labels.join("\n"),
        },
      ],
    };
  } catch (error) {
    logger.error("Labels query tool execution error", { error });

    // Create structured error information
    const errorCode = error instanceof LokiClientError 
      ? error.jsonRpcCode 
      : JsonRpcErrorCode.InternalError;
      
    const errorMessage = error instanceof LokiClientError
      ? `${error.message} (code: ${error.jsonRpcCode}, ${error.code})`
      : `${error}`;

    // Construct error details
    const errorDetails = error instanceof LokiClientError
      ? error.details || {}
      : {};

    return {
      content: [
        {
          type: "text",
          text: `Error getting labels: ${errorMessage}`,
        },
      ],
      isError: true,
      errorCode: errorCode,
      errorDetails: errorDetails
    };
  }
});

// Start server
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    logger.info("Loki MCP server has started");
    console.log("Loki MCP server started");
  })
  .catch((err) => {
    // Log structured error information
    const errorCode = err instanceof Error 
      ? JsonRpcErrorCode.InternalError 
      : JsonRpcErrorCode.ServerError;
    
    logger.error("Server start failed", { 
      error: err, 
      errorCode: errorCode,
      message: err instanceof Error ? err.message : String(err)
    });
    console.error("Failed to start server:", err);
  });
