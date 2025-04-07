import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
  LokiQueryBuilder,
  LokiQueryOptions,
} from "../../src/utils/loki-query-builder.js";

describe("LokiQueryBuilder", () => {
  let queryBuilder: LokiQueryBuilder;

  beforeEach(() => {
    queryBuilder = new LokiQueryBuilder();

    // Mock Date.now and toISOString to ensure consistent test results
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2023-01-01T12:00:00Z").getTime());
    jest
      .spyOn(Date.prototype, "toISOString")
      .mockReturnValue("2023-01-01T11:00:00Z"); // 1 hour ago
  });

  describe("buildGlobalArgs", () => {
    test("No global options", () => {
      const args = queryBuilder.buildGlobalArgs();
      expect(args).toEqual([]);
    });

    test("With global options", () => {
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
    test("Generate query arguments with default options", () => {
      const args = queryBuilder.buildQuerySpecificArgs();

      // Default values are --from=1 hour ago, --to=now
      expect(args).toContain("--from=2023-01-01T11:00:00Z");
      expect(args).toContain("--to=now");
      expect(args.length).toBe(2); // Should only include default arguments
    });

    test("With all query-related options", () => {
      // Reset global toISOString mock
      jest.spyOn(Date.prototype, "toISOString").mockRestore();

      // Set up mocking for individual dates
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
        from: new Date("2023-01-01T10:00:00Z"), // 2 hours ago
        to: new Date("2023-01-01T11:00:00Z"), // 1 hour ago
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
      expect(args.length).toBe(5); // Should include all query-related options
    });

    test("With only some query-related options", () => {
      // Reset global mocking
      jest
        .spyOn(Date.prototype, "toISOString")
        .mockReturnValue("2023-01-01T11:00:00Z");

      const options: LokiQueryOptions = {
        limit: 200,
      };

      const args = queryBuilder.buildQuerySpecificArgs(options);

      expect(args).toContain("--from=2023-01-01T11:00:00Z"); // Mocked 1 hour ago
      expect(args).toContain("--to=now");
      expect(args).toContain("--limit=200");
      expect(args.length).toBe(3);

      // Options not specified should not be included
      expect(args).not.toContain("--batch=");
      expect(args).not.toContain("--forward");
    });
  });

  describe("buildStreamArgs", () => {
    test("Generate stream mode arguments", () => {
      const args = queryBuilder.buildStreamArgs();
      expect(args).toEqual(["--tail"]);
      expect(args.length).toBe(1);
    });
  });
});
