import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getJsonInput } from "../utils/output.js";
import { EXIT_CODES } from "../utils/errors.js";

describe("JSON Input and Structured Errors", () => {
  const originalStdin = process.stdin;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    vi.clearAllMocks();
  });

  describe("getJsonInput", () => {
    it("should parse direct JSON string", async () => {
      const input = '{"name":"test"}';
      const result = await getJsonInput(input);
      expect(result).toEqual({ name: "test" });
    });

    it("should throw error for invalid direct JSON string", async () => {
      const input = '{"name":';
      await expect(getJsonInput(input)).rejects.toThrow("Invalid JSON provided to --input-json");
    });

    it("should read from stdin when input is '-'", async () => {
      const mockData = '{"name":"from-stdin"}';
      
      // Mock process.stdin as an async iterable
      const mockStdin = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(mockData);
        },
        isTTY: true // Force TTY true to ensure '-' override works
      };
      
      vi.stubGlobal('process', {
        ...process,
        stdin: mockStdin
      });

      const result = await getJsonInput("-");
      expect(result).toEqual({ name: "from-stdin" });
    });

    it("should read from stdin when not a TTY and no input string provided", async () => {
      const mockData = '{"piped":true}';
      
      const mockStdin = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(mockData);
        },
        isTTY: false
      };
      
      vi.stubGlobal('process', {
        ...process,
        stdin: mockStdin
      });

      const result = await getJsonInput();
      expect(result).toEqual({ piped: true });
    });

    it("should throw error for invalid JSON from stdin", async () => {
      const mockData = 'not-json';
      
      const mockStdin = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(mockData);
        },
        isTTY: false
      };
      
      vi.stubGlobal('process', {
        ...process,
        stdin: mockStdin
      });

      await expect(getJsonInput("-")).rejects.toThrow("Invalid JSON provided via stdin");
    });

    it("should return null when no input provided and stdin is TTY", async () => {
      const mockStdin = {
        isTTY: true
      };
      
      vi.stubGlobal('process', {
        ...process,
        stdin: mockStdin
      });

      const result = await getJsonInput();
      expect(result).toBeNull();
    });
  });

  describe("Structured Error Codes", () => {
    it("should have correct exit codes defined", () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.API_ERROR).toBe(1);
      expect(EXIT_CODES.AUTH_REQUIRED).toBe(2);
      expect(EXIT_CODES.CONNECT_FAILED).toBe(3);
      expect(EXIT_CODES.VALIDATION).toBe(4);
      expect(EXIT_CODES.NOT_FOUND).toBe(5);
    });
  });
});
