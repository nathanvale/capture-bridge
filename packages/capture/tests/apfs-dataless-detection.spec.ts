/**
 * Test Suite: APFS_DATALESS_DETECTION--T01
 * Risk: P0 CRITICAL (TDD Required)
 *
 * Context: Voice memos may be stored as APFS dataless files that require iCloud download.
 * This is a critical P0 gap that must be tested comprehensively.
 *
 * TDD Applicability Decision: REQUIRED
 * - Risk Level: P0 - Data integrity, storage operations, core business logic
 * - Failure Impact: Data loss potential, corrupt voice memo processing
 * - Complexity: High - APFS interaction, asynchronous operations, edge cases
 *
 * Coverage Requirements:
 * - .icloud placeholder file detection
 * - Size threshold checks (< 1KB indicates dataless)
 * - Extended attributes parsing for download state
 * - Edge cases: missing files, permission errors, malformed attributes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, statSync } from "node:fs";
import { detectAPFSStatus, APFSStatus } from "../src/apfs/dataless-detector.js";

// Mock filesystem operations
vi.mock("node:fs");
vi.mock("node:fs/promises");

// Mock extended attributes (xattr)
const mockXattr = {
  get: vi.fn(),
  list: vi.fn(),
};
vi.mock("xattr", () => mockXattr);

const mockFs = {
  existsSync: vi.mocked(existsSync),
  statSync: vi.mocked(statSync),
};

describe("APFS Dataless Detection - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({
      size: 5242880, // 5MB - normal file
      birthtime: new Date("2025-09-29T10:00:00Z"),
      mtime: new Date("2025-09-29T10:05:00Z"),
      isFile: () => true,
      isDirectory: () => false,
    } as any);

    mockXattr.get.mockReturnValue({});
    mockXattr.list.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe(".icloud placeholder file detection", () => {
    it("detects .icloud placeholder files", async () => {
      const mockPath = "/path/to/Recording.m4a";
      const icloudPath = "/path/to/.Recording.m4a.icloud";

      // Mock: original file doesn't exist, .icloud placeholder does
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockPath) return false;
        if (path === icloudPath) return true;
        return false;
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.exists).toBe(true);
      expect(status.isDataless).toBe(true);
      expect(status.isDownloading).toBe(false);
      expect(status.icloudPlaceholderPath).toBe(icloudPath);
    });

    it("handles multiple .icloud placeholder patterns", async () => {
      const testCases = [
        {
          original: "/Users/test/Recording 01.m4a",
          placeholder: "/Users/test/.Recording 01.m4a.icloud",
        },
        {
          original: "/path/with spaces/Voice Memo.m4a",
          placeholder: "/path/with spaces/.Voice Memo.m4a.icloud",
        },
        {
          original: "/complex/Recording-2025-09-29.m4a",
          placeholder: "/complex/.Recording-2025-09-29.m4a.icloud",
        },
      ];

      for (const { original, placeholder } of testCases) {
        vi.clearAllMocks();

        mockFs.existsSync.mockImplementation((path) => {
          if (path === original) return false;
          if (path === placeholder) return true;
          return false;
        });

        const status = await detectAPFSStatus(original);

        expect(status.isDataless).toBe(true);
        expect(status.icloudPlaceholderPath).toBe(placeholder);
      }
    });

    it("returns false when neither original nor .icloud file exists", async () => {
      const mockPath = "/path/to/nonexistent.m4a";

      mockFs.existsSync.mockReturnValue(false);

      const status = await detectAPFSStatus(mockPath);

      expect(status.exists).toBe(false);
      expect(status.isDataless).toBe(false);
      expect(status.icloudPlaceholderPath).toBeUndefined();
    });
  });

  describe("size threshold detection", () => {
    it("detects files with size < 1KB as dataless", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 512, // Less than 1KB (1024 bytes)
        birthtime: new Date(),
        mtime: new Date(),
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const status = await detectAPFSStatus(mockPath);

      expect(status.exists).toBe(true);
      expect(status.isDataless).toBe(true);
      expect(status.fileSizeBytes).toBe(512);
      expect(status.reason).toContain("size threshold");
    });

    it("treats files >= 1KB as potentially downloaded", async () => {
      const testSizes = [1024, 2048, 5242880]; // 1KB, 2KB, 5MB

      for (const size of testSizes) {
        vi.clearAllMocks();

        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue({
          size,
          birthtime: new Date(),
          mtime: new Date(),
          isFile: () => true,
          isDirectory: () => false,
        } as any);

        const status = await detectAPFSStatus("/path/to/Recording.m4a");

        // Note: file might still be dataless due to extended attributes
        // but size threshold alone doesn't indicate dataless
        expect(status.fileSizeBytes).toBe(size);
        if (!status.isDataless) {
          expect(status.reason).not.toContain("size threshold");
        }
      }
    });

    it("handles zero-byte files as dataless", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 0,
        birthtime: new Date(),
        mtime: new Date(),
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const status = await detectAPFSStatus(mockPath);

      expect(status.isDataless).toBe(true);
      expect(status.fileSizeBytes).toBe(0);
      expect(status.reason).toContain("size threshold");
    });
  });

  describe("extended attributes detection", () => {
    it("checks extended attributes for download state", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockFs.existsSync.mockReturnValue(true);
      mockXattr.get.mockReturnValue({
        "com.apple.metadata:com_apple_clouddocs_downloading": Buffer.from("1"),
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.isDownloading).toBe(true);
      expect(status.extendedAttributes).toHaveProperty(
        "com.apple.metadata:com_apple_clouddocs_downloading",
      );
    });

    it("detects ubiquitous item attribute", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockXattr.get.mockReturnValue({
        "com.apple.metadata:com_apple_clouddocs_ubiquitous": Buffer.from("1"),
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.isUbiquitousItem).toBe(true);
      expect(status.extendedAttributes).toHaveProperty(
        "com.apple.metadata:com_apple_clouddocs_ubiquitous",
      );
    });

    it("detects downloaded attribute for fully downloaded files", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockXattr.get.mockReturnValue({
        "com.apple.metadata:com_apple_clouddocs_downloaded": Buffer.from("1"),
        "com.apple.metadata:com_apple_clouddocs_ubiquitous": Buffer.from("1"),
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.isDownloaded).toBe(true);
      expect(status.isUbiquitousItem).toBe(true);
      expect(status.isDataless).toBe(false); // Downloaded files are not dataless
    });

    it("handles missing extended attributes gracefully", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockXattr.get.mockReturnValue({});
      mockXattr.list.mockReturnValue([]);

      const status = await detectAPFSStatus(mockPath);

      expect(status.extendedAttributes).toEqual({});
      expect(status.isDownloading).toBe(false);
      expect(status.isUbiquitousItem).toBe(false);
      expect(status.isDownloaded).toBe(false);
    });

    it("handles xattr read errors gracefully", async () => {
      const mockPath = "/path/to/Recording.m4a";

      mockXattr.get.mockImplementation(() => {
        throw new Error("Permission denied: xattr read failed");
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.extendedAttributes).toEqual({});
      expect(status.error).toContain("xattr read failed");
      // Should still provide basic file detection
      expect(status.exists).toBe(true);
    });
  });

  describe("edge cases and error handling", () => {
    it("handles permission denied errors", async () => {
      const mockPath = "/path/to/restricted.m4a";

      mockFs.statSync.mockImplementation(() => {
        const error = new Error("EACCES: permission denied");
        (error as any).code = "EACCES";
        throw error;
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.error).toContain("permission denied");
      expect(status.exists).toBe(true); // existsSync still worked
      expect(status.fileSizeBytes).toBeUndefined();
    });

    it("handles file not found during stat", async () => {
      const mockPath = "/path/to/disappeared.m4a";

      mockFs.existsSync.mockReturnValue(true); // File existed during check
      mockFs.statSync.mockImplementation(() => {
        const error = new Error("ENOENT: no such file or directory");
        (error as any).code = "ENOENT";
        throw error;
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.error).toContain("no such file or directory");
      expect(status.exists).toBe(true); // Initial check passed
      expect(status.fileSizeBytes).toBeUndefined();
    });

    it("handles directories correctly", async () => {
      const mockPath = "/path/to/RecordingFolder";

      mockFs.statSync.mockReturnValue({
        size: 4096,
        birthtime: new Date(),
        mtime: new Date(),
        isFile: () => false,
        isDirectory: () => true,
      } as any);

      const status = await detectAPFSStatus(mockPath);

      expect(status.exists).toBe(true);
      expect(status.isDirectory).toBe(true);
      expect(status.isDataless).toBe(false); // Directories can't be dataless
    });

    it("combines multiple dataless indicators correctly", async () => {
      const mockPath = "/path/to/Recording.m4a";

      // Small size + downloading attribute + no .icloud file
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 256, // Less than 1KB
        birthtime: new Date(),
        mtime: new Date(),
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      mockXattr.get.mockReturnValue({
        "com.apple.metadata:com_apple_clouddocs_downloading": Buffer.from("1"),
        "com.apple.metadata:com_apple_clouddocs_ubiquitous": Buffer.from("1"),
      });

      const status = await detectAPFSStatus(mockPath);

      expect(status.isDataless).toBe(true);
      expect(status.isDownloading).toBe(true);
      expect(status.isUbiquitousItem).toBe(true);
      expect(status.reason).toContain("size threshold");
    });
  });

  describe("return value structure validation", () => {
    it("returns complete APFSStatus structure", async () => {
      const mockPath = "/path/to/Recording.m4a";

      const status = await detectAPFSStatus(mockPath);

      // Verify all required fields are present
      expect(status).toHaveProperty("exists");
      expect(status).toHaveProperty("isDataless");
      expect(status).toHaveProperty("isDownloading");
      expect(status).toHaveProperty("isUbiquitousItem");
      expect(status).toHaveProperty("isDownloaded");
      expect(status).toHaveProperty("fileSizeBytes");
      expect(status).toHaveProperty("extendedAttributes");
      expect(status).toHaveProperty("lastModified");
      expect(status).toHaveProperty("created");

      // Verify types
      expect(typeof status.exists).toBe("boolean");
      expect(typeof status.isDataless).toBe("boolean");
      expect(typeof status.isDownloading).toBe("boolean");
      expect(typeof status.isUbiquitousItem).toBe("boolean");
      expect(typeof status.isDownloaded).toBe("boolean");
    });

    it("includes diagnostic information for debugging", async () => {
      const mockPath = "/path/to/Recording.m4a";

      const status = await detectAPFSStatus(mockPath);

      if (status.isDataless) {
        expect(status.reason).toBeDefined();
        expect(typeof status.reason).toBe("string");
      }

      if (status.error) {
        expect(typeof status.error).toBe("string");
      }
    });
  });
});
