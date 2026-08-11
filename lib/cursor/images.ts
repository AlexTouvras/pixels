import { Agent, CursorAgentError } from "@cursor/sdk";
import type { RunOperation } from "@cursor/sdk";
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
  if (!result) return null;
  if (typeof result === "string") {
    // Sometimes payloads are JSON strings
    try {
      return extractImageData(JSON.parse(result));
    } catch {
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(result) && result.length > 200) {
        return result.replace(/\s+/g, "");
      }
      return null;
    }
  }
  if (typeof result !== "object") return null;
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

  // Nested / alternate shapes from cloud tool envelopes
  for (const key of ["result", "output", "data", "content"]) {
    if (key in r) {
      const nested = extractImageData(r[key]);
      if (nested) return nested;
    }
  }

  if (Array.isArray(r.content)) {
    for (const block of r.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (typeof b.data === "string" && b.data.length > 200) return b.data;
      if (typeof b.imageData === "string") return b.imageData;
    }
  }

  return null;
}

function harvestFromUnknown(payload: unknown): string | null {
  const direct = extractImageData(payload);
  if (direct) return direct;
  try {
    const text = JSON.stringify(payload);
    const m = text.match(/"imageData"\s*:\s*"([A-Za-z0-9+/=\r\n]{200,})"/);
    if (m?.[1]) return m[1].replace(/\\n/g, "");
  } catch {
    // ignore
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

function isGenerateImageEvent(event: {
  type?: string;
  name?: string;
  status?: string;
}): boolean {
  if (event.type !== "tool_call") return false;
  if (event.status && event.status !== "completed") return false;
  const name = String(event.name ?? "").toLowerCase();
  // Cloud may use proto names; accept anything image-related
  return (
    name.includes("generateimage") ||
    name.includes("generate_image") ||
    name.includes("image")
  );
}

async function collectImageFromRun(
  run: {
    stream: () => AsyncIterable<unknown>;
    wait: () => Promise<{ status: string }>;
    supports?: (op: RunOperation) => boolean;
    conversation?: () => Promise<unknown>;
  },
): Promise<{ imageDataB64: string | null; toolFilePath: string | null }> {
  let imageDataB64: string | null = null;
  let toolFilePath: string | null = null;

  for await (const raw of run.stream()) {
    const event = raw as {
      type?: string;
      name?: string;
      status?: string;
      result?: unknown;
      args?: unknown;
      message?: unknown;
    };

    if (event.type === "tool_call") {
      const fromResult = harvestFromUnknown(event.result);
      if (fromResult) imageDataB64 = fromResult;
      if (isGenerateImageEvent(event)) {
        toolFilePath = extractFilePath(event.result) ?? toolFilePath;
      }
    }

    if (event.type === "assistant") {
      const fromMsg = harvestFromUnknown(event.message ?? event);
      if (fromMsg) imageDataB64 = fromMsg;
    }
  }

  const waited = await run.wait();
  if (waited.status === "error" || waited.status === "cancelled") {
    throw new Error(`Cursor agent run ${waited.status}`);
  }

  if (!imageDataB64 && run.supports?.("conversation") && run.conversation) {
    try {
      const conv = await run.conversation();
      imageDataB64 = harvestFromUnknown(conv);
    } catch {
      // optional
    }
  }

  return { imageDataB64, toolFilePath };
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/** Cloud agents keep generated files in the VM; pull them via artifacts API. */
async function downloadCloudImageArtifact(
  agent: {
    listArtifacts: () => Promise<Array<{ path: string; sizeBytes: number }>>;
    downloadArtifact: (path: string) => Promise<Buffer>;
  },
  preferredPaths: string[],
): Promise<Buffer | null> {
  let artifacts: Array<{ path: string; sizeBytes: number }>;
  try {
    artifacts = await agent.listArtifacts();
  } catch {
    return null;
  }
  if (!artifacts.length) return null;

  const preferred = preferredPaths
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/").toLowerCase());

  const ranked = [...artifacts].sort((a, b) => {
    const aPath = a.path.replace(/\\/g, "/").toLowerCase();
    const bPath = b.path.replace(/\\/g, "/").toLowerCase();
    const aScore =
      (preferred.some((p) => aPath === p || aPath.endsWith(`/${p}`)) ? 100 : 0) +
      (IMAGE_EXT.test(aPath) ? 10 : 0) +
      Math.min(a.sizeBytes, 1_000_000) / 1_000_000;
    const bScore =
      (preferred.some((p) => bPath === p || bPath.endsWith(`/${p}`)) ? 100 : 0) +
      (IMAGE_EXT.test(bPath) ? 10 : 0) +
      Math.min(b.sizeBytes, 1_000_000) / 1_000_000;
    return bScore - aScore;
  });

  for (const art of ranked) {
    if (!IMAGE_EXT.test(art.path) && art.sizeBytes < 200) continue;
    try {
      const buf = await agent.downloadArtifact(art.path);
      if (buf.length > 0) return buf;
    } catch {
      // try next
    }
  }
  return null;
}

function cloudStartingRef(): string {
  return (
    process.env.CURSOR_CLOUD_STARTING_REF?.trim() ||
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    "master"
  );
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

  const promptLines = [
    "Call the generateImage tool exactly once.",
    `description: ${description}${transparentHint}`,
    `filePath: ${outName}`,
    `Write the image to ${outName} in the workspace root.`,
  ];

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
          repos: [{ url: repo, startingRef: cloudStartingRef() }],
          skipReviewerRequest: true,
        },
      });

      const run = await agent.send(
        [
          ...promptLines,
          "Do not edit source files. Do not run shell commands. Do not open a PR. Do not reply with long text.",
        ].join("\n"),
      );
      ({ imageDataB64, toolFilePath } = await collectImageFromRun(run));

      if (imageDataB64) {
        return {
          bytes: Buffer.from(imageDataB64, "base64"),
          model: IMAGE_MODEL,
          runtime: "cloud",
        };
      }

      const fromArtifact = await downloadCloudImageArtifact(agent, [
        toolFilePath ?? "",
        outName,
        `./${outName}`,
      ]);
      if (fromArtifact) {
        return { bytes: fromArtifact, model: IMAGE_MODEL, runtime: "cloud" };
      }
    } else {
      await using agent = await Agent.create({
        ...(apiKey ? { apiKey } : {}),
        model: { id: modelId() },
        local: { cwd: workDir },
        tools: ["generateImage"],
      });

      const run = await agent.send(
        [...promptLines, "Do not reply with long text. Do not call any other tools."].join(
          "\n",
        ),
      );
      ({ imageDataB64, toolFilePath } = await collectImageFromRun(run));

      if (imageDataB64) {
        return {
          bytes: Buffer.from(imageDataB64, "base64"),
          model: IMAGE_MODEL,
          runtime: "local",
        };
      }

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
