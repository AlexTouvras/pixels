import { NextResponse } from "next/server";
import { generateRawImageBytes, IMAGE_MODEL } from "@/lib/cursor/images";
import { pixelizeBuffer } from "@/lib/pixelize";
import { generateRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";
/** Cursor agent image runs can take a while; Hobby max is 300s. */
export const maxDuration = 300;

export async function POST(request: Request) {
  // CURSOR_API_KEY in .env.local, or SDK stored login (~/.cursor/sdk/auth.json)
  const hasEnvKey = Boolean(process.env.CURSOR_API_KEY?.trim());

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { prompt, width, height, colors, transparent } = parsed.data;

  try {
    const { bytes, model } = await generateRawImageBytes({
      prompt,
      transparent,
    });

    const result = await pixelizeBuffer(bytes, {
      width,
      height,
      colors,
      seed: 42,
      previewScale: 8,
    });

    return NextResponse.json({
      width: result.width,
      height: result.height,
      colorsUsed: result.colorsUsed,
      pngBase64: result.pngBase64,
      previewPngBase64: result.previewPngBase64,
      rawPngBase64: bytes.toString("base64"),
      model: model ?? IMAGE_MODEL,
      auth: hasEnvKey ? "env" : "sdk-stored",
      runtime: process.env.VERCEL || process.env.CURSOR_AGENT_RUNTIME === "cloud" ? "cloud" : "local",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const needsAuth = /api key|401|CURSOR_API_KEY|auth|login|unauthorized/i.test(
      message,
    );
    if (needsAuth) {
      return NextResponse.json(
        {
          error:
            "Cursor auth missing. Add CURSOR_API_KEY to .env.local (Dashboard → Integrations → User API Keys), or run a one-time SDK login.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Cursor image generation failed" },
      { status: 502 },
    );
  }
}
