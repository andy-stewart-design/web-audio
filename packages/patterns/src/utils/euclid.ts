function euclid(
  pulses: number | number[],
  steps: number,
  rotation: number | number[] = 0,
) {
  const numPulses = Array.isArray(pulses) ? pulses.length : 1;
  const numRotation = Array.isArray(rotation) ? rotation.length : 1;
  const numCycles = Math.max(numPulses, numRotation);
  const cycles: number[][] = [];

  for (let i = 0; i < numCycles; i++) {
    const p = getValue(pulses, i, 1);
    const r = getValue(rotation, i, 0);
    cycles.push(_euclid(p, steps, r));
  }

  return cycles;
}

export { euclid };

// ————————————————————————————————————————————————————————————————
// INTERNAL
// ————————————————————————————————————————————————————————————————
function getValue<T>(v: T | T[], i: number, fb: T) {
  return Array.isArray(v) ? (v[i % v.length] ?? fb) : v;
}

function _euclid(pulse: number, steps: number, rotation: number) {
  if (pulse < 0 || steps < 0 || steps < pulse) return [];

  let first = new Array(pulse).fill([1]);
  let second = new Array(steps - pulse).fill([0]);

  let firstLength = first.length;
  let minLength = Math.min(firstLength, second.length);
  let loopThreshold = 0;

  while (minLength > loopThreshold) {
    if (loopThreshold === 0) loopThreshold = 1;

    for (let x = 0; x < minLength; x++) {
      first[x] = [...first[x], ...second[x]];
    }

    if (minLength === firstLength) {
      second = second.slice(minLength);
    } else {
      second = first.slice(minLength);
      first = first.slice(0, minLength);
    }

    firstLength = first.length;
    minLength = Math.min(firstLength, second.length);
  }

  const pattern: number[] = [...first.flat(), ...second.flat()];

  if (rotation !== 0) {
    const len = pattern.length;
    const offset = ((rotation % len) + len) % len; // normalize rotation
    return [...pattern.slice(offset), ...pattern.slice(0, offset)];
  }

  return pattern;
}
