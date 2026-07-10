/**
 * Test Validation Utilities
 *
 * Provides reusable validation functions for testing API artifacts.
 *
 * @author Creoox AG
 * @since 2026
 */

import type { JobState } from "../../src/bindings/event.interface.js";
import type { Event } from "../../src/bindings/event.interface.js";
import fs from "fs/promises";

/**
 * Validates that a JobState object has the expected structure and success status.
 *
 * @param jobState - The JobState object to validate
 * @throws {Error} If validation fails
 */
export function validateJobState(jobState: JobState): void {
  if (!jobState.id) {
    throw new Error("JobState missing required 'id' field");
  }

  if (!jobState.id.startsWith("job_")) {
    throw new Error(`Invalid job ID format: ${jobState.id}`);
  }

  if (typeof jobState.success !== "boolean") {
    throw new Error("JobState missing or invalid 'success' field");
  }

  if (!jobState.createdAt) {
    throw new Error("JobState missing 'createdAt' timestamp");
  }

  if (!jobState.tasks || !Array.isArray(jobState.tasks)) {
    throw new Error("JobState missing or invalid 'tasks' array");
  }

  // Validate that all tasks succeeded if job succeeded
  if (jobState.success) {
    if (jobState.tasksWithContext) {
      const failedTasks = jobState.tasksWithContext.filter(
        (task: { context?: { endedAt?: string; error?: unknown } }) =>
          !task.context?.endedAt || task.context?.error,
      );
      if (failedTasks.length > 0) {
        throw new Error(
          `Job marked as success but ${failedTasks.length} task(s) failed or didn't complete`,
        );
      }
    }
  }
}

/**
 * Validates that a webhook Event has the expected structure.
 *
 * @param event - The Event object to validate
 * @param expectedEventType - Optional expected event type to verify
 * @throws {Error} If validation fails
 */
export function validateEvent(event: Event, expectedEventType?: string): void {
  if (!event.id) {
    throw new Error("Event missing required 'id' field");
  }

  if (!event.id.startsWith("evt_")) {
    throw new Error(`Invalid event ID format: ${event.id}`);
  }

  if (!event.eventType) {
    throw new Error("Event missing 'eventType' field");
  }

  if (expectedEventType && event.eventType !== expectedEventType) {
    throw new Error(
      `Expected event type '${expectedEventType}' but got '${event.eventType}'`,
    );
  }

  if (!event.createdAt) {
    throw new Error("Event missing 'createdAt' timestamp");
  }

  if (!event.jobState) {
    throw new Error("Event missing 'jobState' field");
  }
}

/**
 * Validates that a file exists and has content.
 *
 * @param filePath - Path to the file to validate
 * @throws {Error} If file doesn't exist or is empty
 */
export async function validateFileExists(filePath: string): Promise<void> {
  try {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      throw new Error(`Path exists but is not a file: ${filePath}`);
    }

    if (stats.size === 0) {
      throw new Error(`File is empty: ${filePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`File does not exist: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Validates that a directory exists.
 *
 * @param dirPath - Path to the directory to validate
 * @throws {Error} If directory doesn't exist
 */
export async function validateDirectoryExists(dirPath: string): Promise<void> {
  try {
    const stats = await fs.stat(dirPath);

    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${dirPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }
    throw error;
  }
}

/**
 * Validates that a file has an expected minimum size.
 *
 * @param filePath - Path to the file to validate
 * @param minSizeBytes - Minimum expected file size in bytes
 * @throws {Error} If file is smaller than expected
 */
export async function validateFileSize(
  filePath: string,
  minSizeBytes: number,
): Promise<void> {
  await validateFileExists(filePath);

  const stats = await fs.stat(filePath);

  if (stats.size < minSizeBytes) {
    throw new Error(
      `File ${filePath} is ${stats.size} bytes, expected at least ${minSizeBytes} bytes`,
    );
  }
}

/**
 * Validates that a GLB file has a valid glTF 2.0 header.
 *
 * GLB files start with a 12-byte header:
 * - 4 bytes: magic number (0x46546C67 = "glTF")
 * - 4 bytes: version (should be 2)
 * - 4 bytes: total file length
 *
 * @param filePath - Path to the GLB file to validate
 * @throws {Error} If GLB header is invalid
 */
export async function validateGlbHeader(filePath: string): Promise<void> {
  await validateFileExists(filePath);

  const buffer = await fs.readFile(filePath);

  if (buffer.length < 12) {
    throw new Error(`GLB file too small: ${buffer.length} bytes`);
  }

  // Check magic number "glTF" (0x46546C67)
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error(
      `Invalid GLB magic number: 0x${magic.toString(16)} (expected 0x46546C67)`,
    );
  }

  // Check version (should be 2 for glTF 2.0)
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version} (expected 2)`);
  }

  // Check declared length matches actual length
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(
      `GLB length mismatch: header says ${declaredLength} bytes, file is ${buffer.length} bytes`,
    );
  }
}

/**
 * Validates that an XKT file has a valid header.
 *
 * XKT files start with a specific format identifier.
 *
 * @param filePath - Path to the XKT file to validate
 * @throws {Error} If XKT header is invalid
 */
export async function validateXktHeader(filePath: string): Promise<void> {
  await validateFileExists(filePath);

  const buffer = await fs.readFile(filePath);

  if (buffer.length < 4) {
    throw new Error(`XKT file too small: ${buffer.length} bytes`);
  }

  // XKT files typically start with version integers
  // This is a basic check - could be enhanced with more specific validation
  const firstByte = buffer[0];
  if (firstByte === 0) {
    // Valid - many binary formats start with version 0
    return;
  }

  // Check for reasonable version number (0-20)
  if (firstByte > 20) {
    throw new Error(
      `Suspicious XKT header byte: ${firstByte} (expected 0-20 for version)`,
    );
  }
}

/**
 * Validates that a JSON file is valid and parseable.
 *
 * @param filePath - Path to the JSON file to validate
 * @returns Parsed JSON object
 * @throws {Error} If JSON is invalid
 */
export async function validateJsonFile<T = unknown>(
  filePath: string,
): Promise<T> {
  await validateFileExists(filePath);

  const content = await fs.readFile(filePath, "utf-8");

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Validates that timestamps are in chronological order.
 *
 * @param timestamps - Array of ISO timestamp strings
 * @throws {Error} If timestamps are not chronological
 */
export function validateChronologicalOrder(timestamps: string[]): void {
  for (let i = 1; i < timestamps.length; i++) {
    const prev = new Date(timestamps[i - 1]).getTime();
    const curr = new Date(timestamps[i]).getTime();

    if (curr < prev) {
      throw new Error(
        `Timestamps not in chronological order: ${timestamps[i - 1]} comes after ${timestamps[i]}`,
      );
    }
  }
}
