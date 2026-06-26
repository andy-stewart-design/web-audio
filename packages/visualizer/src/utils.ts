import type { Oklch } from "./index";

function drawSpectrumBars(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  foreground: Oklch,
  numBars = 80,
): void {
  if (data.length === 0 || width === 0 || height === 0) return;

  const barWidth = width / numBars;
  const barGap = 2;
  const samplesPerBar = Math.max(1, Math.floor(data.length / numBars));
  const [l, c, h] = foreground;
  ctx.fillStyle = `oklch(${l} ${c} ${h})`;

  for (let i = 0; i < numBars; i++) {
    const sampleIndex = Math.min(
      data.length - 1,
      Math.floor(i * samplesPerBar + samplesPerBar / 2),
    );
    const value = data[sampleIndex] ?? 0;
    const barHeight = (value / 255) * height * 0.9 + height * 0.005;

    ctx.fillRect(
      i * barWidth,
      height / 2 - barHeight / 2,
      Math.max(0, barWidth - barGap),
      barHeight,
    );
  }
}

function drawSpectrumCurve(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  foreground: Oklch,
  numPoints = 80,
): void {
  if (data.length === 0 || width === 0 || height === 0 || numPoints < 2) return;

  const samplesPerPoint = Math.max(1, Math.floor(data.length / numPoints));
  const pointSpacing = width / (numPoints - 1);
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < numPoints; i++) {
    const sampleIndex = Math.min(
      data.length - 1,
      Math.floor(i * samplesPerPoint + samplesPerPoint / 2),
    );
    const value = data[sampleIndex] ?? 0;
    const normalizedValue = value / 255;
    const y = height - (normalizedValue * height * 0.9 + height * 0.05);
    points.push({ x: i * pointSpacing, y });
  }

  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  if (!firstPoint || !lastPoint) return;

  const drawCurve = () => {
    for (let i = 0; i < points.length - 1; i++) {
      const currentPoint = points[i];
      const nextPoint = points[i + 1];
      if (!currentPoint || !nextPoint) continue;
      ctx.quadraticCurveTo(
        currentPoint.x,
        currentPoint.y,
        (currentPoint.x + nextPoint.x) / 2,
        (currentPoint.y + nextPoint.y) / 2,
      );
    }
  };

  const [l, c, h] = foreground;

  ctx.beginPath();
  ctx.moveTo(firstPoint.x, height);
  ctx.lineTo(firstPoint.x, firstPoint.y);
  drawCurve();
  ctx.lineTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(lastPoint.x, height);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `oklch(${l} ${c} ${h} / 0.5)`);
  gradient.addColorStop(1, `oklch(${l} ${c} ${h} / 0.1)`);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);
  drawCurve();
  ctx.lineTo(lastPoint.x, lastPoint.y);
  ctx.strokeStyle = `oklch(${l} ${c} ${h})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawOscilloscope(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  foreground: Oklch,
): void {
  if (data.length === 0 || width === 0 || height === 0) return;

  const [l, c, h] = foreground;
  ctx.strokeStyle = `oklch(${l} ${c} ${h})`;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const sliceWidth = width / data.length;
  let x = 0;

  for (let i = 0; i < data.length; i++) {
    const v = (data[i] ?? 0) / 128;
    const y = (v * height) / 2;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

export { drawOscilloscope, drawSpectrumBars, drawSpectrumCurve };
