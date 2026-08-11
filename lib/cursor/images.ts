import { Agent, CursorAgentError } from "@cursor/sdk";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildImagePrompt } from "@/lib/prompts";

export const IMAGE_MODEL = "cursor-generateImage" as const;

export type GenerateRawImageOptions = {
  prompt: string;
  transparent?: boolean;
};

function resolveApiKey(): string | undefined {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key || undefined;
}

function modelId(): string {
  return process.env.CURSOR_MODEL?.trim() || "composer-2.5";
}

/** Vercel (and similar) cannot run the local Cursor agent executor. */
function useCloudAgent(): boolean {
  if (process.env.CURSOR_AGENT_RUNTIME?.trim() === "cloud") return true;
  if (process.env.CURSOR_AGENT_RUNTIME?.trim() === "local") return false;
  return Boolean(process.env.VERCEL);
}

function cloudRepoUrl(): string | undefined {
  const explicit = process.env.CURSOR_CLOUD_REPO_URL?.trim();
  if (explicit) return explicit;
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const slug = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  if (owner && slug) return `https://github.com/${owner}/${slug}`;
  return undefined;
}

function extractImageData(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if (r.status === "success" && r.value && typeof r.value === "object") {
    const value = r.value as Record<string, unknown>;
    if (typeof value.imageData === "string" && value.imageData.length > 0) {
      return value.imageData;
    }
  }

  if (typeof r.imageData === "string" && r.imageData.length > 0) {
    return r.imageData;
  }

  return null;
}

function extractFilePath(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.status === "success" && r.value && typeof r.value === "object") {
    const value = r.value as Record<string, unknown>;
    if (typeof value.filePath === "string") return value.filePath;
  }
  if (typeof r.filePath === "string") return r.filePath;
  return null;
}

async function readPngCandidate(filePath: string, cwd: string): Promise<Buffer | null> {
  const candidates = [
    filePath,
    path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath),
    path.join(cwd, "assets", path.basename(filePath)),
    path.join(cwd, path.basename(filePath)),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(/* turbopackIgnore: true */ candidate);
    } catch {
      // try next
    }
  }
  return null;
}

function isGenerateImageEvent(event: { type?: string; name?: string; status?: string }): boolean {
  if (event.type !== "tool_call") return false;
  const name = String(event.name ?? "").toLowerCase();
  if (!name.includes("generateimage") && name !== "generate_image") return false;
  return event.status === "completed";
}

/**
 * Draft an image via Cursor automation (`generateImage`).
 * - Local: SDK agent on this machine (dev).
 * - Cloud: Cursor cloud agent (Vercel / CURSOR_AGENT_RUNTIME=cloud).
 */
export async function generateRawImageBytes(
  options: GenerateRawImageOptions,
): Promise<{ bytes: Buffer; model: string; runtime: "local" | "cloud" }> {
  const apiKey = resolveApiKey();
  const cloud = useCloudAgent();
  const workDir = cloud
    ? process.cwd()
    : await fs.mkdtemp(path.join(os.tmpdir(), "pixels-gen-"));
  const outName = "sprite.png";
  const description = buildImagePrompt(options.prompt);
  const transparentHint = options.transparent
    ? " Use a fully transparent background behind the subject."
    : "";

  let imageDataB64: string | null = null;
  let toolFilePath: string | null = null;

  try {
    if (cloud) {
      const repo = cloudRepoUrl();
      if (!repo) {
        throw new Error(
          "Cloud Cursor agent needs CURSOR_CLOUD_REPO_URL or a Vercel-linked GitHub repo (VERCEL_GIT_REPO_OWNER/SLUG)",
        );
      }

      await using agent = await Agent.create({
        ...(apiKey ? { apiKey } : {}),
        model: { id: modelId() },
        cloud: {
          repos: [{ url: repo, startingRef: process.env.VERCEL_GIT_COMMIT_REF || "main" }],
          skipReviewerRequest: true,
        },
      });

      const run = await agent.send(
        [
          "Call the generateImage tool exactly once.",
          `description: ${description}${transparentHint}`,
          `filePath: ${outName}`,
          "Do not edit the repository. Do not open a PR. Do not reply with long text.",
        ].join("\n"),
      );

      for await (const event of run.stream()) {
        if (!isGenerateImageEvent(event)) continue;
        const result = (event as { result?: unknown }).result;
        imageDataB64 = extractImageData(result) ?? imageDataB64;
        toolFilePath = extractFilePath(result) ?? toolFilePath;
      }

      const waited = await run.wait();
      if (waited.status === "error" || waited.status === "cancelled") {
        throw new Error(`Cursor cloud agent run ${waited.status}`);
      }
    } else {
      await using agent = await Agent.create({
        ...(apiKey ? { apiKey } : {}),
        model: { id: modelId() },
        local: { cwd: workDir },
        tools: ["generateImage"],
      });

      const run = await agent.send(
        [
          "Call the generateImage tool exactly once.",
          `description: ${description}${transparentHint}`,
          `filePath: ${outName}`,
          "Do not reply with long text. Do not call any other tools.",
        ].join("\n"),
      );

      for await (const event of run.stream()) {
        if (!isGenerateImageEvent(event)) continue;
        const result = (event as { result?: unknown }).result;
        imageDataB64 = extractImageData(result) ?? imageDataB64;
        toolFilePath = extractFilePath(result) ?? toolFilePath;
      }

      const waited = await run.wait();
      if (waited.status === "error" || waited.status === "cancelled") {
        throw new Error(`Cursor agent run ${waited.status}`);
      }
    }

    if (imageDataB64) {
      return {
        bytes: Buffer.from(imageDataB64, "base64"),
        model: IMAGE_MODEL,
        runtime: cloud ? "cloud" : "local",
      };
    }

    if (!cloud) {
      const fromDisk =
        (toolFilePath ? await readPngCandidate(toolFilePath, workDir) : null) ??
        (await readPngCandidate(outName, workDir));

      if (fromDisk) {
        return { bytes: fromDisk, model: IMAGE_MODEL, runtime: "local" };
      }

      const entries = await fs.readdir(workDir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;
        const full = path.join(entry.parentPath ?? workDir, entry.name);
        return {
          bytes: await fs.readFile(full),
          model: IMAGE_MODEL,
          runtime: "local",
        };
      }
    }

    throw new Error("Cursor agent finished but no image was produced");
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor agent startup failed: ${err.message}`);
    }
    throw err;
  } finally {
    if (!cloud) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
