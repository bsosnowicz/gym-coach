// Body points from YOLO (COCO-17, 0–1 of the frame) on the overlay above the
// preview. The canvas has the native video frame size, not the CSS box size,
// or the points would drift off the image.

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

// Segments and points to draw, in pixels; pure, for the tests.
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

// issue: a body with a deviation (orange) rather than without (blue).
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
