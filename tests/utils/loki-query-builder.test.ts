import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
  LokiQueryBuilder,
  LokiQueryOptions,
} from "../../src/utils/loki-query-builder.js";

describe("LokiQueryBuilder", () => {
  let queryBuilder: LokiQueryBuilder;

  beforeEach(() => {
    queryBuilder = new LokiQueryBuilder();

    // Date.now와 toISOString을 모킹하여 일관된 테스트 결과 보장
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2023-01-01T12:00:00Z").getTime());
    jest
      .spyOn(Date.prototype, "toISOString")
      .mockReturnValue("2023-01-01T11:00:00Z"); // 1시간 전
  });

  describe("buildGlobalArgs", () => {
    test("전역 옵션 없는 경우", () => {
      const args = queryBuilder.buildGlobalArgs();
      expect(args).toEqual([]);
    });

    test("전역 옵션이 있는 경우", () => {
      const options: LokiQueryOptions = {
        quiet: true,
        output: "raw",
      };

      const args = queryBuilder.buildGlobalArgs(options);
      expect(args).toContain("--quiet");
      expect(args).toContain("--output=raw");
      expect(args.length).toBe(2);
    });
  });

  describe("buildQuerySpecificArgs", () => {
    test("기본 옵션으로 쿼리 인자 생성", () => {
      const args = queryBuilder.buildQuerySpecificArgs();

      // 기본값은 --from=1시간 전, --to=현재
      expect(args).toContain("--from=2023-01-01T11:00:00Z");
      expect(args).toContain("--to=now");
      expect(args.length).toBe(2); // 기본 인자만 포함되어야 함
    });

    test("모든 쿼리 관련 옵션이 있는 경우", () => {
      // toISOString 전역 모킹 해제
      jest.spyOn(Date.prototype, "toISOString").mockRestore();

      // 개별 날짜에 대한 toISOString 모킹 설정
      jest
        .spyOn(Date.prototype, "toISOString")
        .mockImplementation(function (this: Date) {
          if (this.getTime() === new Date("2023-01-01T10:00:00Z").getTime()) {
            return "2023-01-01T10:00:00Z";
          } else if (
            this.getTime() === new Date("2023-01-01T11:00:00Z").getTime()
          ) {
            return "2023-01-01T11:00:00Z";
          }
          return new Date(Date.now() - 60 * 60 * 1000).toISOString();
        });

      const options: LokiQueryOptions = {
        from: new Date("2023-01-01T10:00:00Z"), // 2시간 전
        to: new Date("2023-01-01T11:00:00Z"), // 1시간 전
        limit: 100,
        batch: 50,
        forward: true,
      };

      const args = queryBuilder.buildQuerySpecificArgs(options);

      expect(args).toContain("--from=2023-01-01T10:00:00Z");
      expect(args).toContain("--to=2023-01-01T11:00:00Z");
      expect(args).toContain("--limit=100");
      expect(args).toContain("--batch=50");
      expect(args).toContain("--forward");
      expect(args.length).toBe(5); // 모든 쿼리 관련 옵션이 포함되어야 함
    });

    test("일부 쿼리 관련 옵션만 있는 경우", () => {
      // 전역 모킹을 다시 설정
      jest
        .spyOn(Date.prototype, "toISOString")
        .mockReturnValue("2023-01-01T11:00:00Z");

      const options: LokiQueryOptions = {
        limit: 200,
      };

      const args = queryBuilder.buildQuerySpecificArgs(options);

      expect(args).toContain("--from=2023-01-01T11:00:00Z"); // 모킹된 1시간 전
      expect(args).toContain("--to=now");
      expect(args).toContain("--limit=200");
      expect(args.length).toBe(3);

      // 지정하지 않은 옵션은 포함되지 않아야 함
      expect(args).not.toContain("--batch=");
      expect(args).not.toContain("--forward");
    });
  });

  describe("buildStreamArgs", () => {
    test("스트림 모드 인자 생성", () => {
      const args = queryBuilder.buildStreamArgs();
      expect(args).toEqual(["--tail"]);
      expect(args.length).toBe(1);
    });
  });
});
