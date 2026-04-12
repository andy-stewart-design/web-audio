export function xox(...steps: (number | number[])[] | string[]) {
  return steps.map((c) => {
    if (typeof c === "string") {
      return c.split("").reduce<number[]>((acc, s) => {
        if (s.trim()) acc.push(s.trim() === "x" ? 1 : 0);
        return acc;
      }, []);
    }
    return Array.isArray(c) ? c.map((n) => (n ? 1 : 0)) : c ? [1] : [0];
  });
}
