export const PIXEL_ART_SUFFIX =
  ", true pixel art game sprite, flat colors, hard edges, limited palette, no antialiasing, centered subject, plain background";

export function buildImagePrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  if (trimmed.toLowerCase().includes("pixel art")) {
    return `${trimmed}, flat colors, hard edges, limited palette, no antialiasing, centered subject`;
  }
  return `${trimmed}${PIXEL_ART_SUFFIX}`;
}
