import { LokiClient } from "../../src/utils/loki-client.js";
import { LokiQueryBuilder } from "../../src/utils/loki-query-builder.js";
import { LokiAuth } from "../../src/utils/loki-auth.js";
import axios from "axios";

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
    client = new LokiClient(mockAuth, new LokiQueryBuilder());
  });

  it("should query the pushed log from Loki HTTP API", async () => {
    const result = await client.queryLoki(TEST_LABELS, { limit: 10 });
    expect(result).toContain(TEST_LINE);
  });
});
