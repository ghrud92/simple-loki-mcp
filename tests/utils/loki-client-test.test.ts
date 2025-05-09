import { LokiClient } from "../../src/utils/loki-client.js";
import { LokiAuth } from "../../src/utils/loki-auth.js";
import axios from "axios";
import { LokiClientError } from "../../src/utils/errors.js";

const TEST_LOKI_ADDR = "http://localhost:3100";
const TEST_LABELS = '{test="loki-client-test"}';
const TEST_LINE = `test log line - ${Date.now()}`;

// Loki HTTP API로 로그를 직접 삽입하는 함수
async function pushTestLog() {
  const url = `${TEST_LOKI_ADDR}/loki/api/v1/push`;
  const now = Date.now() * 1_000_000; // ns 단위
  const body = {
    streams: [
      {
        stream: { test: "loki-client-test" },
        values: [[now.toString(), TEST_LINE]],
      },
    ],
  };
  await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
  });
}

describe("LokiClient", () => {
  let mockAuth: LokiAuth;
  let client: LokiClient;

  beforeAll(async () => {
    await pushTestLog();
    // Loki가 로그를 인덱싱할 시간을 약간 기다림
    await new Promise((res) => setTimeout(res, 1000));
  });

  beforeEach(() => {
    // 실제 Loki 주소만 반환하는 mock
    mockAuth = {
      getConfig: () => ({ addr: TEST_LOKI_ADDR }),
      getAuthArgs: () => [],
    } as unknown as LokiAuth;
    client = new LokiClient(mockAuth);
  });

  describe("queryLoki", () => {
    it("should query the pushed log from Loki HTTP API", async () => {
      const result = await client.queryLoki(TEST_LABELS, { limit: 10 });
      expect(result).toContain(TEST_LINE);
    });
  });

  describe("getLabels", () => {
    it("should retrieve available labels from Loki HTTP API as JSON string", async () => {
      const labelsJson = await client.getLabels();

      // Should be a JSON string
      expect(typeof labelsJson).toBe("string");

      // Parse the JSON string
      const result = JSON.parse(labelsJson);

      // Result should have a labels property that is an array
      expect(Array.isArray(result.labels)).toBe(true);

      // Should contain the test label we pushed
      expect(result.labels).toContain("test");

      // Typically, Loki has some standard labels
      const commonLabels = ["job", "filename", "level"];
      commonLabels.forEach((label) => {
        // Some of these labels may not exist in all Loki setups, so we don't assert strictly
        if (result.labels.includes(label)) {
          expect(result.labels).toContain(label);
        }
      });
    });
  });

  describe("getLabelValues", () => {
    it("should retrieve values for a specific label from Loki HTTP API", async () => {
      const labelValues = await client.getLabelValues("test");

      // Label values should be an array
      expect(Array.isArray(labelValues)).toBe(true);

      // Should contain the value we pushed
      expect(labelValues).toContain("loki-client-test");
    });
  });

  describe("Error handling", () => {
    let errorClient: LokiClient;

    beforeEach(() => {
      // Create a client with invalid Loki address
      const errorMockAuth = {
        getConfig: () => ({ addr: "http://non-existent-loki:9999" }),
        getAuthArgs: () => [],
      } as unknown as LokiAuth;
      errorClient = new LokiClient(errorMockAuth);
    });

    it("should handle connection errors when getting labels", async () => {
      await expect(errorClient.getLabels()).rejects.toThrow(LokiClientError);
      await expect(errorClient.getLabels()).rejects.toMatchObject({
        code: "http_query_error",
      });
    });

    it("should handle connection errors when getting label values", async () => {
      await expect(errorClient.getLabelValues("test")).rejects.toThrow(
        LokiClientError
      );
      await expect(errorClient.getLabelValues("test")).rejects.toMatchObject({
        code: "http_query_error",
      });
    });

    it("should handle connection errors when querying logs", async () => {
      await expect(errorClient.queryLoki(TEST_LABELS)).rejects.toThrow(
        LokiClientError
      );
      await expect(errorClient.queryLoki(TEST_LABELS)).rejects.toMatchObject({
        code: "http_query_error",
      });
    });
  });
});
