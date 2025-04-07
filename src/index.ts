import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LokiClientError } from "./utils/errors.js";
import { createLogger } from "./utils/logger.js";
import { LokiClient } from "./utils/loki-client.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// 로거 생성
const logger = createLogger("MCPServer");

// package.json에서 버전 가져오기
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

logger.info("서버 초기화 완료");

// 로키 쿼리 도구
server.tool(
  "query-loki",
  {
    query: z.string().describe("Loki query string"),
    from: z
      .string()
      .optional()
      .describe("Start timestamp in UTC (e.g. '2023-01-01T12:00:00Z')"),
    to: z
      .string()
      .optional()
      .describe("End timestamp in UTC (e.g. '2023-01-01T13:00:00Z')"),
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
    logger.debug("Loki 쿼리 도구 실행", { query, from, to, restOptions });

    // 디버깅을 위한 로그 추가
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

      // 디버깅을 위한 로그 추가
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
      logger.error("Loki 쿼리 도구 실행 오류", { query, error });

      const errorMessage =
        error instanceof LokiClientError
          ? `${error.message} (${error.code})`
          : `${error}`;

      // 디버깅을 위한 로그 추가
      console.error("Loki query error:", errorMessage);

      return {
        content: [
          {
            type: "text",
            text: `Error running Loki query: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 라벨 값 조회 도구
server.tool(
  "get-label-values",
  {
    label: z.string().describe("Label name to get values for"),
  },
  async ({ label }) => {
    logger.debug("라벨 값 조회 도구 실행", { label });

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
      logger.error("라벨 값 조회 도구 실행 오류", { label, error });

      const errorMessage =
        error instanceof LokiClientError
          ? `${error.message} (${error.code})`
          : `${error}`;

      return {
        content: [
          {
            type: "text",
            text: `Error getting label values: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 모든 라벨 조회 도구
server.tool("get-labels", {}, async () => {
  logger.debug("모든 라벨 조회 도구 실행");

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
    logger.error("라벨 조회 도구 실행 오류", { error });

    const errorMessage =
      error instanceof LokiClientError
        ? `${error.message} (${error.code})`
        : `${error}`;

    return {
      content: [
        {
          type: "text",
          text: `Error getting labels: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// 서버 시작
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    logger.info("Loki MCP 서버가 시작되었습니다");
    console.log("Loki MCP server started");
  })
  .catch((err) => {
    logger.error("서버 시작 실패", { error: err });
    console.error("Failed to start server:", err);
  });
