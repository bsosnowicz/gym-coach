// Punkty sylwetki z YOLO (COCO-17, współrzędne 0–1 względem klatki) na
// nakładce nad podglądem. Canvas ma rozmiar natywnej klatki wideo, nie pudełka
// CSS — inaczej punkty "pływałyby" względem obrazu.

export const MIN_KEYPOINT_CONFIDENCE = 0.35;

export const SKELETON_CONNECTIONS = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
  ["left_ear", "left_shoulder"], ["right_ear", "right_shoulder"],
];

// Odcinki i punkty do narysowania, w pikselach; czysta funkcja do testów.
export function skeletonGeometry(keypoints = [], { width, height, minConfidence = MIN_KEYPOINT_CONFIDENCE }) {
  const visible = new Map(
    keypoints.filter((point) => point.confidence >= minConfidence).map((point) => [point.name, point])
  );
  const toPixels = (point) => ({ x: point.x * width, y: point.y * height });
  const lines = SKELETON_CONNECTIONS
    .filter(([a, b]) => visible.has(a) && visible.has(b))
    .map(([a, b]) => [toPixels(visible.get(a)), toPixels(visible.get(b))]);
  return { lines, points: [...visible.values()].map(toPixels) };
}

// issue: sylwetka z uwagą (pomarańczowa) zamiast bez uwag (niebieska).
export function drawSkeleton(ctx, keypoints, { issue = false } = {}) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const { lines, points } = skeletonGeometry(keypoints, { width, height });
  const color = issue ? "#ff9800" : "#00b4ff";
  ctx.lineWidth = Math.max(2, width / 320);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [a, b] of lines) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, ctx.lineWidth * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function clearSkeleton(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
