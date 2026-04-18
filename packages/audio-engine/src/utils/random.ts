const PERIOD = 300;
const SEED_MAX = 2 ** 29;

function xorwise(x: number): number {
  const a = (x << 13) ^ x;
  const b = (a >> 17) ^ a;
  return (b << 5) ^ b;
}

function mulberry32(a: number): number {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

type RandAlgo = "xor" | "mulberry";

const frac = (n: number) => n - Math.trunc(n);

function getSeed(n: number): number {
  const value = n % PERIOD === 0 ? 0x9e3779b9 / PERIOD : n / PERIOD;
  return xorwise(Math.trunc(frac(value) * SEED_MAX));
}

const seedToRand = (seed: number) => (seed % SEED_MAX) / SEED_MAX;

type RandMapper = (r: number, start: number, end: number) => number;

const floatMapper: RandMapper = (r, start, end) => r * (end - start) + start;
const intMapper: RandMapper = (r, start, end) =>
  Math.floor(r * (end - start) + start);
const binaryMapper: RandMapper = (r) => Math.round(r);

const quantizeMapper =
  (step: number): RandMapper =>
  (r, start, end) => {
    const raw = r * (end - start) + start;
    const quantized = Math.round(raw / step) * step;
    return Math.min(end, Math.max(start, quantized));
  };

export {
  xorwise,
  mulberry32,
  getSeed,
  seedToRand,
  floatMapper,
  intMapper,
  binaryMapper,
  quantizeMapper,
  type RandMapper,
  type RandAlgo,
};
