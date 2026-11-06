export const galleryMoods = [
  { title: '翡翠暗光', en: 'EMERALD AFTER DARK', color: '#87a993', line: '把锋芒，留给光。', detail: '一抹绿意，停在夜色与轮廓之间。' },
  { title: '绯红长廊', en: 'A SCARLET INTERLUDE', color: '#bc6e69', line: '不必开口，自有回响。', detail: '沿着光的方向，走近这一刻。' },
  { title: '香槟时刻', en: 'THE GOLDEN HOUR', color: '#c6a777', line: '夜色正好，光也偏爱。', detail: '让微光慢下来，留住一瞬的温度。' },
  { title: '柔光一面', en: 'THE SOFTER SIDE', color: '#cba1ad', line: '冷艳之外，还有温柔。', detail: '柔和的光，照见另一种从容。' },
  { title: '午夜余光', en: 'AFTER THE LAST LIGHT', color: '#b58b65', line: '灯光暗下，故事继续。', detail: '藏在夜色里，也藏在余光里。' },
] as const;

export function galleryPose(index: number, selection: number) {
  const distance = index - selection;
  return {
    x: Math.sin(distance * 0.9) * 0.95,
    y: -distance * 4.45,
    z: -Math.min(5, Math.abs(distance) * 1.55),
    rotation: -Math.sin(distance * 0.65) * 0.22,
  };
}

export function clampSelection(index: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), index));
}

export function cropTexture(width: number, height: number, aspect: number, focal = { x: 0.5, y: 0.5 }) {
  const source = width / height;
  const repeatX = Math.min(1, aspect / source), repeatY = Math.min(1, source / aspect);
  return { repeatX, repeatY, offsetX: (1 - repeatX) * focal.x, offsetY: (1 - repeatY) * (1 - focal.y) };
}
