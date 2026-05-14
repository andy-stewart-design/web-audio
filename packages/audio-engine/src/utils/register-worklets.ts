export function registerWorklets(
  ctx: AudioContext,
  sources: string[],
): Promise<void> {
  return Promise.all(
    sources.map((source) => {
      const blob = new Blob([source], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      return ctx.audioWorklet.addModule(url);
    }),
  ).then(() => undefined);
}
