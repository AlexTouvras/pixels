"use client";

import { useCallback, useMemo, useState } from "react";
import { PixelPreview } from "./PixelPreview";
import { COLOR_OPTIONS, SIZE_OPTIONS } from "@/lib/validation";

type ResultState = {
  width: number;
  height: number;
  colorsUsed: number;
  pngBase64: string;
  previewPngBase64: string;
  rawPngBase64?: string;
  model?: string;
};

function toDataUrl(b64: string) {
  return `data:image/png;base64,${b64}`;
}

function downloadPng(b64: string, filename: string) {
  const a = document.createElement("a");
  a.href = toDataUrl(b64);
  a.download = filename;
  a.click();
}

export function GeneratorForm() {
  const [prompt, setPrompt] = useState("cute slime monster with a tiny crown");
  const [size, setSize] = useState<(typeof SIZE_OPTIONS)[number]>(32);
  const [colors, setColors] = useState<(typeof COLOR_OPTIONS)[number]>(16);
  const [transparent, setTransparent] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const previewSrc = useMemo(
    () => (result ? toDataUrl(result.previewPngBase64) : null),
    [result],
  );
  const rawSrc = useMemo(
    () => (result?.rawPngBase64 ? toDataUrl(result.rawPngBase64) : null),
    [result],
  );

  const runGenerate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          width: size,
          height: size,
          colors,
          transparent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setResult(data);
      setShowRaw(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }, [prompt, size, colors, transparent]);

  return (
    <div className="workspace">
      <div className="workspace-grid">
        <form
          className="controls"
          onSubmit={(e) => {
            e.preventDefault();
            void runGenerate();
          }}
        >
          <label className="field">
            <span>Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Describe a game sprite…"
              required
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            Ask for transparent background
          </label>

          <label className="field">
            <span>Sprite size</span>
            <div className="chip-row">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={size === s ? "chip active" : "chip"}
                  onClick={() => setSize(s)}
                >
                  {s}×{s}
                </button>
              ))}
            </div>
          </label>

          <label className="field">
            <span>Palette size</span>
            <div className="chip-row">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={colors === c ? "chip active" : "chip"}
                  onClick={() => setColors(c)}
                >
                  {c} colors
                </button>
              ))}
            </div>
          </label>

          <div className="actions">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Working…" : "Generate"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!result || busy}
              onClick={() =>
                result &&
                downloadPng(
                  result.pngBase64,
                  `pixels-${result.width}x${result.height}.png`,
                )
              }
            >
              Download 1× PNG
            </button>
          </div>

          {result && rawSrc ? (
            <label className="check">
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
              />
              Show raw AI image
            </label>
          ) : null}

          {error ? <p className="error" role="alert">{error}</p> : null}
          {result?.model ? <p className="hint">Model {result.model}</p> : null}
        </form>

        <PixelPreview
          previewSrc={previewSrc}
          rawSrc={rawSrc}
          showRaw={showRaw}
          width={result?.width ?? size}
          height={result?.height ?? size}
          colorsUsed={result?.colorsUsed}
        />
      </div>
    </div>
  );
}
