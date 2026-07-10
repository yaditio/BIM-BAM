/**
 * IFC to XKT Conversion Sample
 *
 * This script demonstrates a complete end-to-end workflow for converting IFC files
 * to XKT format using the Xeokit Data Engine API. It showcases job submission,
 * polling with exponential backoff, and automatic file download with extraction.
 *
 * **Purpose:**
 * - Submit an asynchronous job for IFC → GLB → XKT conversion
 * - Poll job status until completion using exponential backoff (Math.pow(2, i))
 * - Download output files from completed tasks
 * - Extract ZIP archives automatically
 * - Save job state for reference and debugging
 *
 * **Workflow:**
 * 1. Import IFC file from URL
 * 2. Convert IFC to GLB using xeoIFC
 * 3. Export GLB files as ZIP archive
 * 4. Convert GLB to XKT using xeokit-convert
 * 5. Export final XKT file
 * 6. Poll until job completes (max 5 iterations with exponential backoff)
 * 7. Download and extract all output files
 *
 * **Output:**
 * Files are saved to `.sample-outputs/convertIfc2Xkt/`:
 * - `job-state-{jobId}.json` - Complete job state with metadata
 * - `export-step-1/` - GLB conversion outputs (extracted from ZIP)
 * - `export-step-2/` - Final XKT file
 *
 * @author Creoox AG
 * @since 2026
 *
 * @example
 * ```bash
 * pnpm sample:convertIfc2Xkt
 * ```
 */

import { config } from "../utils/config.js";
import fs from "fs/promises";
import path from "path";
import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";
import { Job } from "../bindings/job.interface.js";
import { JobState } from "../bindings/event.interface.js";

/**
 * Initializes and submits an IFC to XKT conversion job to the API.
 *
 * Creates a multi-step job that imports an IFC file, converts it through GLB format,
 * and exports the final XKT file. The job includes webhook notifications for progress updates.
 *
 * **Job Pipeline:**
 * - `import-file`: Downloads IFC from remote URL
 * - `convert-step-1`: Converts IFC → GLB using xeoIFC
 * - `export-step-1`: Packages GLB files into a ZIP archive
 * - `convert-step-2`: Converts GLB → XKT using xeokit-convert
 * - `export-step-2`: Exports final XKT file
 *
 * @returns Promise resolving to the initial JobState with job ID and metadata
 * @throws {Error} When API request fails or returns non-OK status
 *
 * @example
 * ```ts
 * const jobState = await initIfc2XktJob();
 * console.log(`Job created: ${jobState.id}`);
 * ```
 */
async function initIfc2XktJob(): Promise<JobState> {
  const job: Job = {
    tag: "ifc-xkt",
    webhook: {
      url: config.computed.webhookSitePostUrl,
      eventTypes: ["job.started", "job.succeeded", "job.failed"],
    },
    tasks: [
      {
        id: "import-file",
        operation: "import/url",
        fileType: "ifc",
        url: "https://sos-ch-gva-2.exo.io/creoox-public/xeokit-data-engine-samples/Duplex.ifc",
      },
      {
        id: "convert-step-1",
        operation: "convert/ifc/glb",
        input: "import-file",
        engine: {
          name: "xeoIfc",
          version: "5.6.11",
        },
      },
      {
        id: "export-step-1",
        operation: "export/url",
        input: "convert-step-1",
        archiveMultipleFiles: true,
      },
      {
        id: "convert-step-2",
        operation: "convert/glb/xkt",
        input: "convert-step-1",
        engine: {
          name: "xeokit-convert",
          version: "1.3.2",
          options: {
            includeMetadata: true,
          },
        },
      },
      {
        id: "export-step-2",
        operation: "export/url",
        input: "convert-step-2",
      },
    ],
  };

  const url = `${config.envs.XDES_API_URL}/api/jobs/async`;

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(job),
      headers: {
        Authorization: config.computed.authHeader,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    const result = (await response.json()) as JobState;
    return result;
  } catch (error: unknown) {
    console.error(error);
    throw Error("error_while_api_request");
  }
}

/**
 * Fetches the current state of a job by its ID.
 *
 * Queries the API to retrieve the complete job state including task progress,
 * file outputs, timestamps, and success status.
 *
 * @param jobId - The unique identifier of the job to query
 * @returns Promise resolving to the current JobState
 * @throws {Error} When API request fails or returns non-OK status
 *
 * @example
 * ```ts
 * const state = await getJobStateByJobId('job_abc123');
 * console.log(`Job status: ${state.endedAt ? 'Complete' : 'Running'}`);
 * ```
 */
async function getJobStateByJobId(jobId: string): Promise<JobState> {
  const url = `${config.envs.XDES_API_URL}/api/jobs/${jobId}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: config.computed.authHeader,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    const result = (await response.json()) as JobState;
    return result;
  } catch (error: unknown) {
    console.error(error);
    throw Error("error_while_api_request");
  }
}

/**
 * Polls a job until it completes using exponential backoff strategy.
 *
 * Checks job status repeatedly with increasing wait times between attempts:
 * - Iteration 0: 1 second (3^0)
 * - Iteration 1: 3 seconds (3^1)
 * - Iteration 2: 9 seconds (3^2)
 * - Iteration 3: 27 seconds (3^3)
 * - Iteration 4: 81 seconds (3^4)
 *
 * The job is considered complete when `jobState.endedAt` is not null.
 *
 * @param jobId - The unique identifier of the job to poll
 * @returns Promise resolving to the final JobState when complete
 * @throws {Error} When job doesn't complete within max iterations (5 attempts)
 *
 * @example
 * ```ts
 * try {
 *   const finalState = await pollJobUntilComplete('job_abc123');
 *   console.log(`Completed: ${finalState.success}`);
 * } catch (error) {
 *   console.error('Job polling timeout');
 * }
 * ```
 */
async function pollJobUntilComplete(jobId: string): Promise<JobState> {
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    console.log(`Polling attempt ${i + 1}/${maxIterations}...`);

    const jobState = await getJobStateByJobId(jobId);

    if (jobState.endedAt !== null) {
      console.log(
        `Job completed with status: ${jobState.success ? "SUCCESS" : "FAILED"}`,
      );
      return jobState;
    }

    // If not the last iteration, wait before next poll
    if (i < maxIterations - 1) {
      const waitTime = Math.pow(3, i) * 1000; // Convert to milliseconds
      console.log(
        `Job not complete yet. Waiting ${waitTime / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error(
    `Job did not complete after ${maxIterations} polling attempts`,
  );
}

/**
 * Downloads output files from specified tasks and extracts ZIP archives.
 *
 * Iterates through the provided task IDs, downloads all files with available URLs
 * from their task context, and automatically extracts any ZIP archives.
 *
 * **Features:**
 * - Downloads files to organized task-specific folders
 * - Automatically detects and extracts archive files
 * - Preserves directory structure from ZIP files
 * - Logs progress and file sizes for each download
 * - Continues on errors to download remaining files
 *
 * @param jobState - The complete job state containing tasksWithContext
 * @param taskIds - Array of task IDs to download files from (e.g., ['export-step-1', 'export-step-2'])
 * @throws {Error} When tasksWithContext is unavailable in the job state
 *
 * @example
 * ```ts
 * await downloadTaskFiles(finalJobState, ['export-step-2', 'convert-step-1']);
 * // Downloads files to:
 * // .sample-outputs/convertIfc2Xkt/export-step-2/...
 * // .sample-outputs/convertIfc2Xkt/convert-step-1/...
 * ```
 */
async function downloadTaskFiles(jobState: JobState, taskIds: string[]) {
  if (!jobState.tasksWithContext) {
    throw new Error("No tasksWithContext available in job state");
  }

  for (const taskId of taskIds) {
    const task = jobState.tasksWithContext.find((t) => t.id === taskId);

    if (!task) {
      console.warn(`Task "${taskId}" not found in tasksWithContext`);
      continue;
    }

    if (!task.context || !task.context.files) {
      console.warn(`No files found for task "${taskId}"`);
      continue;
    }

    console.log(`\nDownloading files from task: ${taskId}`);

    for (const file of task.context.files) {
      if (!file.url) {
        console.warn(`No URL available for file: ${file.path}`);
        continue;
      }

      try {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error(`Failed to download: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const fileName = path.basename(file.path);
        const outputDir = path.join(
          config.fixed.sampleOutputFolder,
          "convertIfc2Xkt",
          taskId,
        );
        const outputPath = path.join(outputDir, fileName);

        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(outputPath, Buffer.from(buffer));

        console.log(
          `✓ Downloaded: ${fileName} (${(file.fileSize / 1024).toFixed(2)} KB) -> ${outputPath}`,
        );

        // Extract ZIP files
        if (file.fileType === "archive" && fileName.endsWith(".zip")) {
          try {
            const extractDir = path.join(
              outputDir,
              path.basename(fileName, ".zip"),
            );
            await fs.mkdir(extractDir, { recursive: true });

            const blob = new Blob([buffer]);
            const zipReader = new ZipReader(new BlobReader(blob));
            const entries = await zipReader.getEntries();

            for (const entry of entries) {
              if (!entry.directory) {
                const entryPath = path.join(extractDir, entry.filename);
                const entryDir = path.dirname(entryPath);
                await fs.mkdir(entryDir, { recursive: true });

                const writer = new BlobWriter();
                const entryBlob = await entry.getData(writer);
                const entryBuffer = await entryBlob.arrayBuffer();
                await fs.writeFile(entryPath, Buffer.from(entryBuffer));
              }
            }

            await zipReader.close();
            console.log(`  → Extracted to: ${extractDir}`);
          } catch (extractError) {
            console.error(`  ✗ Failed to extract ${fileName}:`, extractError);
          }
        }
      } catch (error) {
        console.error(`✗ Failed to download ${file.path}:`, error);
      }
    }
  }
}

/**
 * Saves the complete job state to a JSON file for reference and debugging.
 *
 * Creates a formatted JSON file containing all job metadata, task configurations,
 * execution times, file outputs, and URLs. Useful for debugging, archiving, and
 * understanding the complete job execution flow.
 *
 * @param jobState - The job state to save
 *
 * @example
 * ```ts
 * await saveJobState(finalJobState);
 * // Creates: .sample-outputs/convertIfc2Xkt/job-state-job_abc123.json
 * ```
 */
async function saveJobState(jobState: JobState) {
  const filePath = path.join(
    config.fixed.sampleOutputFolder,
    "convertIfc2Xkt",
    `job-state-${jobState.id}.json`,
  );
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  console.log(`Saving job state to: ${filePath}`);
  await fs.writeFile(filePath, JSON.stringify(jobState, null, 2));
}

/**
 * Main execution function orchestrating the complete conversion workflow.
 *
 * **Workflow Steps:**
 * 1. Submit IFC → XKT conversion job to API
 * 2. Poll job status until completion using exponential backoff
 * 3. Save complete job state to JSON file
 * 4. Download output files from completed tasks
 * 5. Extract ZIP archives automatically
 *
 * On success, all converted files and job metadata are saved to
 * `.sample-outputs/convertIfc2Xkt/` for inspection.
 *
 * @example
 * ```bash
 * pnpm sample:convertIfc2Xkt
 * ```
 */
async function main() {
  const initialJobState = await initIfc2XktJob();
  const jobId = initialJobState.id;
  console.log(`Job created with ID: ${jobId}`);

  const finalJobState = await pollJobUntilComplete(jobId);
  console.log("Final job state:", finalJobState);

  // Save final job state to file
  await saveJobState(finalJobState);

  if (finalJobState.success) {
    console.log("\n=== Downloading output files ===");
    await downloadTaskFiles(finalJobState, ["export-step-2", "export-step-1"]);
    console.log("\n✓ All files downloaded successfully!");
  } else {
    console.error("Job failed, skipping file downloads");
  }
}

main();
