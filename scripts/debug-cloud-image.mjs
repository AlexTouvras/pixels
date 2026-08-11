import { writeFileSync } from "node:fs";
import { Agent } from "@cursor/sdk";

const apiKey = process.env.CURSOR_API_KEY;
const repo = process.env.CURSOR_CLOUD_REPO_URL || "https://github.com/AlexTouvras/pixels";
const startingRef = process.env.CURSOR_CLOUD_STARTING_REF || "master";
const outLog = process.env.DEBUG_OUT || "scripts/.debug-cloud.json";

if (!apiKey) {
  console.error("CURSOR_API_KEY missing");
  process.exit(1);
}

const summary = {
  repo,
  startingRef,
  status: null,
  events: [],
  artifacts: [],
  downloadedBytes: null,
  hasImageDataInStream: false,
  error: null,
};

const agent = await Agent.create({
  apiKey,
  model: { id: process.env.CURSOR_MODEL || "composer-2.5" },
  cloud: {
    repos: [{ url: repo, startingRef }],
    skipReviewerRequest: true,
  },
});

try {
  const run = await agent.send(
    [
      "Call the generateImage tool exactly once.",
      "description: tiny green slime monster pixel art game sprite, flat colors, hard edges",
      "filePath: sprite.png",
      "Write the image to sprite.png in the workspace root.",
      "Do not edit source files. Do not open a PR.",
    ].join("\n"),
  );

  for await (const event of run.stream()) {
    const json = JSON.stringify(event);
    const hasImageData = json.includes("imageData");
    if (hasImageData) summary.hasImageDataInStream = true;
    summary.events.push({
      type: event.type,
      name: event.name,
      status: event.status,
      hasImageData,
      snippet: json.slice(0, 280),
    });
  }

  const waited = await run.wait();
  summary.status = waited.status;

  try {
    const artifacts = await agent.listArtifacts();
    summary.artifacts = artifacts;
    const png = artifacts.find((a) => /\.png$/i.test(a.path)) ?? artifacts[0];
    if (png) {
      const buf = await agent.downloadArtifact(png.path);
      summary.downloadedBytes = buf.length;
      writeFileSync("scripts/.debug-cloud-sprite.png", buf);
    }
  } catch (err) {
    summary.error = `artifacts: ${err instanceof Error ? err.message : String(err)}`;
  }
} catch (err) {
  summary.error = err instanceof Error ? err.message : String(err);
} finally {
  await agent[Symbol.asyncDispose]();
}

writeFileSync(outLog, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify(
    {
      status: summary.status,
      eventCount: summary.events.length,
      hasImageDataInStream: summary.hasImageDataInStream,
      artifacts: summary.artifacts,
      downloadedBytes: summary.downloadedBytes,
      error: summary.error,
      eventTypes: summary.events.map((e) => `${e.type}:${e.name || ""}:${e.status || ""}`),
    },
    null,
    2,
  ),
);
process.exit(summary.downloadedBytes || summary.hasImageDataInStream ? 0 : 1);
