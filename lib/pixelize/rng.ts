/** Mulberry32 seeded PRNG — deterministic across runs. */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleIndex(rng: () => number, upper: number): number {
  if (upper <= 0) return 0;
  return Math.floor(rng() * upper) % upper;
}
