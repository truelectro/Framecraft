import {
  DeviceFinish,
  DeviceModel,
  OverlayLayer,
  PlatformSlot,
  RenderedSceneBounds,
  SampleScreenVariant,
  SceneBox,
  SlideConfig,
} from '../types';
import { drawSampleScreen, hexWithAlpha } from './sampleScreens';

const imageCache = new Map<string, HTMLImageElement>();
const loadingUrls = new Set<string>();
const listeners = new Set<() => void>();

export function subscribeImageLoads(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCachedImage(url: string | null): HTMLImageElement | null {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  if (!loadingUrls.has(url)) {
    loadingUrls.add(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(url, img);
      loadingUrls.delete(url);
      listeners.forEach((fn) => fn());
    };
    img.onerror = () => {
      loadingUrls.delete(url);
    };
    img.src = url;
  }
  return null;
}

let cachedNoiseCanvas: HTMLCanvasElement | null = null;

function getNoiseTile(): HTMLCanvasElement {
  if (cachedNoiseCanvas) return cachedNoiseCanvas;
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const tctx = tile.getContext('2d');
  if (tctx) {
    const imgData = tctx.createImageData(140, 140);
    const d = imgData.data;
    let seed = 1337;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = (seed & 255) > 128 ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    tctx.putImageData(imgData, 0, 0);
  }
  cachedNoiseCanvas = tile;
  return tile;
}

export interface RenderOptions {
  width: number;
  height: number;
  platformSlot: PlatformSlot;
  showSafeZones?: boolean;
  isPlayFeatureGraphic?: boolean;
  previousSlide?: SlideConfig | null;
  hideTextForInlineEdit?: boolean;
}

interface TextSegment {
  text: string;
  accent: boolean;
}

function parseHeadlineSegments(raw: string): TextSegment[] {
  const parts = raw.split(/(\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return { text: part.slice(1, -1), accent: true };
    }
    return { text: part, accent: false };
  });
}

function isColorLight(hex: string): boolean {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return true;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  slide: SlideConfig
) {
  const { background } = slide;

  // Opaque base coat (required by App Store Connect & Google Play Console)
  ctx.fillStyle = background.colorA || '#090B10';
  ctx.fillRect(0, 0, w, h);

  if (background.type === 'linear') {
    const rad = ((background.angle - 90) * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.hypot(w, h) / 2;
    const grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * len,
      cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len,
      cy + Math.sin(rad) * len
    );
    grad.addColorStop(0, background.colorA);
    grad.addColorStop(0.55, background.colorB);
    grad.addColorStop(1, background.colorC);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (background.type === 'mesh') {
    const baseGrad = ctx.createLinearGradient(0, 0, w * 0.6, h);
    baseGrad.addColorStop(0, background.colorA);
    baseGrad.addColorStop(1, background.colorB);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    const orb1 = ctx.createRadialGradient(
      w * 0.82,
      h * 0.16,
      0,
      w * 0.82,
      h * 0.16,
      Math.max(w, h) * 0.72
    );
    orb1.addColorStop(0, hexWithAlpha(background.colorC, 0.72));
    orb1.addColorStop(0.6, hexWithAlpha(background.colorC, 0.18));
    orb1.addColorStop(1, hexWithAlpha(background.colorC, 0));
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, w, h);

    const orb2 = ctx.createRadialGradient(
      w * 0.16,
      h * 0.85,
      0,
      w * 0.16,
      h * 0.85,
      Math.max(w, h) * 0.68
    );
    orb2.addColorStop(0, hexWithAlpha(slide.accentColor, 0.25));
    orb2.addColorStop(1, hexWithAlpha(slide.accentColor, 0));
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, w, h);
  }

  if (background.spotlight) {
    const spotX = slide.layout === 'banner-split' ? w * 0.73 : w * 0.5;
    const spotY = slide.layout === 'editorial-bottom' ? h * 0.34 : h * 0.62;
    const spotR = Math.max(w, h) * 0.52;
    const spot = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, spotR);
    spot.addColorStop(0, hexWithAlpha(slide.accentColor, 0.2));
    spot.addColorStop(0.55, hexWithAlpha(slide.accentColor, 0.05));
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
  }

  if (background.pattern !== 'none' && background.patternOpacity > 0) {
    const isLightText = isColorLight(slide.textColor);
    const strokeCol = isLightText
      ? `rgba(255,255,255,${background.patternOpacity})`
      : `rgba(15,23,42,${background.patternOpacity})`;
    const step = Math.round(Math.min(w, h) * 0.048);

    ctx.save();
    if (background.pattern === 'grid') {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0012);
      ctx.beginPath();
      for (let x = step / 2; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = step / 2; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    } else if (background.pattern === 'dots') {
      ctx.fillStyle = strokeCol;
      const dotR = Math.max(1.4, Math.min(w, h) * 0.0022);
      for (let x = step / 2; x < w; x += step) {
        for (let y = step / 2; y < h; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (background.pattern === 'rings') {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = Math.max(1.2, Math.min(w, h) * 0.0015);
      const rcx = slide.layout === 'banner-split' ? w * 0.75 : w * 0.5;
      const rcy = h * 0.62;
      for (let i = 1; i <= 6; i++) {
        ctx.beginPath();
        ctx.arc(rcx, rcy, i * Math.min(w, h) * 0.14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (background.noise > 0) {
    const tile = getNoiseTile();
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      ctx.save();
      ctx.globalAlpha = background.noise;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}

export function getDeviceAspect(model: DeviceModel): number {
  if (model === 'ipad-pro') return 1.34;
  if (model === 'browser-card') return 0.64;
  if (model === 'pixel-9-pro') return 2.12;
  return 2.08;
}

interface DeviceDrawSpec {
  cx: number;
  cy: number;
  width: number;
  rotationDeg: number;
  model: DeviceModel;
  finish: DeviceFinish;
  screenshotUrl: string | null;
  sampleVariant: SampleScreenVariant;
  accentColor: string;
  fit: 'cover' | 'contain';
  shadowIntensity: number;
  glare: boolean;
}

function getFinishColors(finish: DeviceFinish) {
  switch (finish) {
    case 'titanium-silver':
      return {
        outerA: '#F8FAFC',
        outerB: '#CBD5E1',
        outerC: '#E2E8F0',
        bezel: '#090B10',
        innerStroke: 'rgba(255,255,255,0.85)',
        clay: false,
      };
    case 'titanium-natural':
      return {
        outerA: '#D6D3D1',
        outerB: '#78716C',
        outerC: '#A8A29E',
        bezel: '#0C0A09',
        innerStroke: 'rgba(255,255,255,0.45)',
        clay: false,
      };
    case 'clay-dark':
      return {
        outerA: '#18181B',
        outerB: '#18181B',
        outerC: '#27272A',
        bezel: '#18181B',
        innerStroke: 'rgba(255,255,255,0.09)',
        clay: true,
      };
    case 'clay-light':
      return {
        outerA: '#F1F5F9',
        outerB: '#E2E8F0',
        outerC: '#FFFFFF',
        bezel: '#F1F5F9',
        innerStroke: 'rgba(15,23,42,0.08)',
        clay: true,
      };
    case 'titanium-dark':
    default:
      return {
        outerA: '#3F4451',
        outerB: '#12151C',
        outerC: '#262A34',
        bezel: '#050608',
        innerStroke: 'rgba(255,255,255,0.22)',
        clay: false,
      };
  }
}

function drawDevice(
  ctx: CanvasRenderingContext2D,
  spec: DeviceDrawSpec
): SceneBox | null {
  const {
    cx,
    cy,
    width: devW,
    rotationDeg,
    model,
    finish,
    screenshotUrl,
    sampleVariant,
    accentColor,
    fit,
    shadowIntensity,
    glare,
  } = spec;

  if (model === 'none') return null;

  const aspect = getDeviceAspect(model);
  const devH = devW * aspect;

  ctx.save();
  ctx.translate(cx, cy);
  if (rotationDeg !== 0) {
    ctx.rotate((rotationDeg * Math.PI) / 180);
  }

  const x = -devW / 2;
  const y = -devH / 2;

  const outerRadius =
    model === 'browser-card'
      ? devW * 0.032
      : model === 'ipad-pro'
      ? devW * 0.062
      : model === 'frameless'
      ? devW * 0.075
      : model === 'pixel-9-pro'
      ? devW * 0.132
      : devW * 0.148;

  if (shadowIntensity > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.68, 0.42 * shadowIntensity)})`;
    ctx.shadowBlur = devW * 0.16 * shadowIntensity;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = devW * 0.07 * shadowIntensity;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, devW - 4, devH - 4, outerRadius);
    ctx.fillStyle = '#090B10';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.45, 0.24 * shadowIntensity)})`;
    ctx.shadowBlur = devW * 0.045 * shadowIntensity;
    ctx.shadowOffsetY = devW * 0.02 * shadowIntensity;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, devW - 4, devH - 4, outerRadius);
    ctx.fillStyle = '#090B10';
    ctx.fill();
    ctx.restore();
  }

  if (model === 'frameless') {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, devW, devH, outerRadius);
    ctx.clip();
    drawScreenContents(
      ctx,
      x,
      y,
      devW,
      devH,
      screenshotUrl,
      sampleVariant,
      accentColor,
      fit,
      false
    );
    if (glare) drawGlassGlare(ctx, x, y, devW, devH);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(x, y, devW, devH, outerRadius);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1.5, devW * 0.004);
    ctx.stroke();
    ctx.restore();
    return { cx, cy, width: devW, height: devH, rotationDeg };
  }

  if (model === 'browser-card') {
    const barH = devW * 0.056;
    const isLightFrame = finish === 'titanium-silver' || finish === 'clay-light';
    ctx.beginPath();
    ctx.roundRect(x, y, devW, devH, outerRadius);
    ctx.fillStyle = isLightFrame ? '#F1F5F9' : '#14171F';
    ctx.fill();

    const dotR = barH * 0.13;
    const dotY = y + barH / 2;
    ['#EF4444', '#F59E0B', '#10B981'].forEach((col, i) => {
      ctx.beginPath();
      ctx.arc(x + barH * 0.55 + i * dotR * 3.1, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });

    const pillW = devW * 0.36;
    const pillH = barH * 0.52;
    ctx.beginPath();
    ctx.roundRect(-pillW / 2, dotY - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fillStyle = isLightFrame
      ? 'rgba(15,23,42,0.06)'
      : 'rgba(255,255,255,0.06)';
    ctx.fill();

    const pad = devW * 0.008;
    const sx = x + pad;
    const sy = y + barH;
    const sw = devW - pad * 2;
    const sh = devH - barH - pad;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, Math.max(4, outerRadius - pad));
    ctx.clip();
    drawScreenContents(
      ctx,
      sx,
      sy,
      sw,
      sh,
      screenshotUrl,
      sampleVariant,
      accentColor,
      fit,
      true
    );
    if (glare) drawGlassGlare(ctx, sx, sy, sw, sh);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(x, y, devW, devH, outerRadius);
    ctx.strokeStyle = isLightFrame
      ? 'rgba(15,23,42,0.12)'
      : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1.5, devW * 0.0025);
    ctx.stroke();

    ctx.restore();
    return { cx, cy, width: devW, height: devH, rotationDeg };
  }

  const palette = getFinishColors(finish);

  if (model !== 'ipad-pro' && !palette.clay) {
    const btnW = devW * 0.011;
    ctx.fillStyle = palette.outerC;
    ctx.beginPath();
    if (model === 'pixel-9-pro') {
      // Pixel 9 Pro: Power button above single Volume rocker on right rail
      ctx.roundRect(
        x + devW - btnW * 0.28,
        y + devH * 0.21,
        btnW,
        devH * 0.058,
        btnW / 2
      );
      ctx.roundRect(
        x + devW - btnW * 0.28,
        y + devH * 0.295,
        btnW,
        devH * 0.115,
        btnW / 2
      );
    } else {
      // iPhone 16 Pro: Action + Volume Up/Down on left, Power on right
      ctx.roundRect(x - btnW * 0.7, y + devH * 0.17, btnW, devH * 0.036, btnW / 2);
      ctx.roundRect(x - btnW * 0.7, y + devH * 0.23, btnW, devH * 0.068, btnW / 2);
      ctx.roundRect(x - btnW * 0.7, y + devH * 0.31, btnW, devH * 0.068, btnW / 2);
      ctx.roundRect(
        x + devW - btnW * 0.3,
        y + devH * 0.25,
        btnW,
        devH * 0.095,
        btnW / 2
      );
    }
    ctx.fill();
  }

  const rimGrad = ctx.createLinearGradient(x, y, x + devW, y + devH);
  rimGrad.addColorStop(0, palette.outerA);
  rimGrad.addColorStop(0.45, palette.outerB);
  rimGrad.addColorStop(1, palette.outerC);

  ctx.beginPath();
  ctx.roundRect(x, y, devW, devH, outerRadius);
  ctx.fillStyle = rimGrad;
  ctx.fill();

  const rimThickness = model === 'ipad-pro' ? devW * 0.008 : devW * 0.012;
  const bezelThickness = model === 'ipad-pro' ? devW * 0.026 : devW * 0.024;

  ctx.beginPath();
  ctx.roundRect(
    x + rimThickness,
    y + rimThickness,
    devW - rimThickness * 2,
    devH - rimThickness * 2,
    outerRadius - rimThickness
  );
  ctx.fillStyle = palette.bezel;
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(
    x + rimThickness * 0.5,
    y + rimThickness * 0.5,
    devW - rimThickness,
    devH - rimThickness,
    outerRadius - rimThickness * 0.5
  );
  ctx.strokeStyle = palette.innerStroke;
  ctx.lineWidth = Math.max(1, devW * 0.003);
  ctx.stroke();

  const inset = rimThickness + bezelThickness;
  const sx = x + inset;
  const sy = y + inset;
  const sw = devW - inset * 2;
  const sh = devH - inset * 2;
  const screenRadius = Math.max(8, outerRadius - inset);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, screenRadius);
  ctx.clip();

  drawScreenContents(
    ctx,
    sx,
    sy,
    sw,
    sh,
    screenshotUrl,
    sampleVariant,
    accentColor,
    fit,
    false
  );

  if (!palette.clay) {
    if (model === 'iphone-16-pro') {
      const diW = sw * 0.295;
      const diH = sw * 0.084;
      const diX = -diW / 2;
      const diY = sy + sw * 0.032;
      ctx.beginPath();
      ctx.roundRect(diX, diY, diW, diH, diH / 2);
      ctx.fillStyle = '#040507';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        diX + diW - diH * 0.52,
        diY + diH / 2,
        diH * 0.2,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        diX + diW - diH * 0.55,
        diY + diH * 0.44,
        diH * 0.06,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(99, 102, 241, 0.55)';
      ctx.fill();
    } else if (model === 'pixel-9-pro') {
      const camR = sw * 0.03;
      const camY = sy + sw * 0.05;
      ctx.beginPath();
      ctx.arc(0, camY, camR, 0, Math.PI * 2);
      ctx.fillStyle = '#050608';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, camY, camR * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-camR * 0.18, camY - camR * 0.18, camR * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.55)';
      ctx.fill();
    }
  }

  if (glare) {
    drawGlassGlare(ctx, sx, sy, sw, sh);
  }

  ctx.restore();
  ctx.restore();

  return { cx, cy, width: devW, height: devH, rotationDeg };
}

function drawScreenContents(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  screenshotUrl: string | null,
  sampleVariant: SampleScreenVariant,
  accentColor: string,
  fit: 'cover' | 'contain',
  isWide: boolean
) {
  const img = getCachedImage(screenshotUrl);
  if (img) {
    ctx.fillStyle = '#090B10';
    ctx.fillRect(sx, sy, sw, sh);
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = sw / sh;
    let dw = sw;
    let dh = sh;
    if (fit === 'cover') {
      if (imgRatio > boxRatio) {
        dh = sh;
        dw = sh * imgRatio;
      } else {
        dw = sw;
        dh = sw / imgRatio;
      }
    } else {
      if (imgRatio > boxRatio) {
        dw = sw;
        dh = sw / imgRatio;
      } else {
        dh = sh;
        dw = sh * imgRatio;
      }
    }
    const dx = sx + (sw - dw) / 2;
    const dy = sy + (sh - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    drawSampleScreen(ctx, sx, sy, sw, sh, sampleVariant, accentColor, isWide);
  }
}

function drawGlassGlare(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + sw * 0.68, sy);
  ctx.lineTo(sx + sw * 0.14, sy + sh);
  ctx.lineTo(sx, sy + sh);
  ctx.closePath();
  const glareGrad = ctx.createLinearGradient(
    sx,
    sy,
    sx + sw * 0.65,
    sy + sh * 0.65
  );
  glareGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
  glareGrad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  glareGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glareGrad;
  ctx.fill();
  ctx.restore();
}

function drawOverlayLayers(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlays: OverlayLayer[],
  orderFilter: 'above' | 'behind',
  recordedBoxes: Array<SceneBox & { id: string; layerOrder: 'above' | 'behind' }>
) {
  const baseRef = Math.min(w, h) * 0.36;

  for (const ov of overlays) {
    if (!ov.visible || ov.layerOrder !== orderFilter) continue;
    const img = getCachedImage(ov.imageUrl);
    const aspect =
      img && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;

    const drawW = Math.max(24, baseRef * ov.scale);
    const drawH = Math.max(24, drawW / aspect);
    const cx = (ov.x / 100) * w;
    const cy = (ov.y / 100) * h;

    recordedBoxes.push({
      id: ov.id,
      cx,
      cy,
      width: drawW,
      height: drawH,
      rotationDeg: ov.rotation,
      layerOrder: ov.layerOrder,
    });

    if (!img) continue;

    ctx.save();
    ctx.translate(cx, cy);
    if (ov.rotation !== 0) {
      ctx.rotate((ov.rotation * Math.PI) / 180);
    }
    ctx.globalAlpha = Math.max(0.05, Math.min(1, ov.opacity));

    const rx = -drawW / 2;
    const ry = -drawH / 2;
    const radPx = (ov.cornerRadius / 100) * Math.min(drawW, drawH);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (radPx > 0.5) {
      if (ov.shadow > 0) {
        ctx.save();
        ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.65, 0.38 * ov.shadow)})`;
        ctx.shadowBlur = Math.min(drawW, drawH) * 0.18 * ov.shadow;
        ctx.shadowOffsetY = Math.min(drawW, drawH) * 0.06 * ov.shadow;
        ctx.beginPath();
        ctx.roundRect(rx, ry, drawW, drawH, radPx);
        ctx.fillStyle = '#090B10';
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.roundRect(rx, ry, drawW, drawH, radPx);
      ctx.clip();
      ctx.drawImage(img, rx, ry, drawW, drawH);
    } else {
      // Preserves exact alpha silhouette shadow for transparent PNGs/SVGs
      if (ov.shadow > 0) {
        ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.65, 0.38 * ov.shadow)})`;
        ctx.shadowBlur = Math.min(drawW, drawH) * 0.18 * ov.shadow;
        ctx.shadowOffsetY = Math.min(drawW, drawH) * 0.06 * ov.shadow;
      }
      ctx.drawImage(img, rx, ry, drawW, drawH);
    }

    ctx.restore();
  }
}

interface TextBlockOptions {
  x: number;
  y: number;
  maxWidth: number;
  align: 'left' | 'center';
  slide: SlideConfig;
  unit: number;
  skipPaint?: boolean;
}

function drawEditorialCopy(
  ctx: CanvasRenderingContext2D,
  opts: TextBlockOptions
): { bottomY: number; box: (SceneBox & { align: 'left' | 'center'; fontPx: number }) | null } {
  const { x, maxWidth, align, slide, unit, skipPaint } = opts;
  const startY = opts.y;
  let cursorY = startY;
  const isLightFg = isColorLight(slide.textColor);

  const isSerif = slide.fontFamily === 'Instrument Serif';
  const baseTitlePx = Math.round(
    (isSerif ? 92 : 76) * unit * slide.titleSizeScale
  );

  let widestLine = 0;

  if (slide.headline.trim()) {
    const weight = isSerif ? 400 : 800;
    const lineHeight = baseTitlePx * (isSerif ? 1.04 : 1.08);

    ctx.font = `${weight} ${baseTitlePx}px "${slide.fontFamily}", sans-serif`;
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        isSerif
          ? `${(-baseTitlePx * 0.015).toFixed(1)}px`
          : `${(-baseTitlePx * 0.032).toFixed(1)}px`;
    }

    const segments = parseHeadlineSegments(slide.headline.trim());
    interface WordToken {
      word: string;
      accent: boolean;
      width: number;
    }
    const spaceWidth = ctx.measureText(' ').width;
    const words: WordToken[] = [];

    for (const seg of segments) {
      const pieces = seg.text.split(/\s+/).filter(Boolean);
      for (const piece of pieces) {
        words.push({
          word: piece,
          accent: seg.accent,
          width: ctx.measureText(piece).width,
        });
      }
    }

    const lines: WordToken[][] = [];
    let currentLine: WordToken[] = [];
    let currentWidth = 0;

    for (const wt of words) {
      const needed =
        currentLine.length === 0 ? wt.width : currentWidth + spaceWidth + wt.width;
      if (needed > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [wt];
        currentWidth = wt.width;
      } else {
        currentLine.push(wt);
        currentWidth = needed;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    for (const line of lines) {
      const totalLineW =
        line.reduce((acc, item) => acc + item.width, 0) +
        Math.max(0, line.length - 1) * spaceWidth;
      widestLine = Math.max(widestLine, totalLineW);
      let wordX = align === 'center' ? x - totalLineW / 2 : x;

      if (!skipPaint) {
        for (let i = 0; i < line.length; i++) {
          const item = line[i];
          if (item.accent && isSerif) {
            ctx.font = `italic ${weight} ${baseTitlePx}px "${slide.fontFamily}", serif`;
          } else {
            ctx.font = `${weight} ${baseTitlePx}px "${slide.fontFamily}", sans-serif`;
          }
          ctx.fillStyle = item.accent ? slide.accentColor : slide.textColor;
          ctx.fillText(item.word, wordX, cursorY);
          wordX += item.width + spaceWidth;
        }
      }
      cursorY += lineHeight;
    }

    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        '0px';
    }
  }

  if (slide.showSubheadline && slide.subheadline.trim()) {
    if (slide.headline.trim()) {
      cursorY += 18 * unit;
    }
    const subPx = Math.round(30 * unit);
    const subLh = subPx * 1.42;
    ctx.font = `500 ${subPx}px Inter, "DM Sans", sans-serif`;
    ctx.fillStyle = hexWithAlpha(slide.textColor, isLightFg ? 0.72 : 0.68);
    ctx.textBaseline = 'top';
    ctx.textAlign = align;

    const subWords = slide.subheadline.trim().split(/\s+/);
    const subLines: string[] = [];
    let cur = '';
    const subMaxW = maxWidth * 0.92;
    for (const sw of subWords) {
      const test = cur ? `${cur} ${sw}` : sw;
      if (ctx.measureText(test).width > subMaxW && cur) {
        subLines.push(cur);
        cur = sw;
      } else {
        cur = test;
      }
    }
    if (cur) subLines.push(cur);

    for (const sl of subLines) {
      widestLine = Math.max(widestLine, ctx.measureText(sl).width);
      if (!skipPaint) {
        ctx.fillText(sl, x, cursorY);
      }
      cursorY += subLh;
    }
  }

  const totalH = Math.max(baseTitlePx * 1.1, cursorY - startY);
  const boxW = Math.max(maxWidth * 0.45, Math.min(maxWidth, widestLine + 28 * unit));
  const boxCx = align === 'center' ? x : x + boxW / 2;

  const hasAnyText =
    Boolean(slide.headline.trim()) ||
    (slide.showSubheadline && Boolean(slide.subheadline.trim()));

  return {
    bottomY: cursorY,
    box: hasAnyText
      ? {
          cx: boxCx,
          cy: startY + totalH / 2,
          width: boxW,
          height: totalH,
          rotationDeg: 0,
          align,
          fontPx: baseTitlePx,
        }
      : null,
  };
}

export function renderSlideToCanvas(
  canvas: HTMLCanvasElement,
  slide: SlideConfig,
  options: RenderOptions
): RenderedSceneBounds {
  const {
    width: w,
    height: h,
    platformSlot,
    showSafeZones,
    isPlayFeatureGraphic,
    previousSlide,
    hideTextForInlineEdit,
  } = options;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const bounds: RenderedSceneBounds = {
    text: null,
    device: null,
    overlays: [],
  };

  const ctx =
    canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
  if (!ctx) return bounds;

  ctx.save();
  drawBackground(ctx, w, h, slide);

  // 1. Overlays positioned BEHIND the device
  drawOverlayLayers(ctx, w, h, slide.overlays, 'behind', bounds.overlays);

  const isLandscape = w > h * 1.15;
  const unit = isLandscape ? h / 780 : Math.min(w / 1220, h / 2450);

  // Platform-independent device transform & model resolution
  const tf = slide.deviceTransforms[platformSlot] || slide.deviceTransforms.ios;
  let activeModel = slide.deviceModels[platformSlot] || 'iphone-16-pro';
  if (isPlayFeatureGraphic && activeModel === 'iphone-16-pro') {
    activeModel = 'pixel-9-pro';
  }

  const offX = (tf.offsetX / 100) * w;
  const offY = (tf.offsetY / 100) * h;
  const textOffX = (slide.textOffsetX / 100) * w;
  const textOffY = (slide.textOffsetY / 100) * h;

  if (
    slide.layout === 'banner-split' ||
    (isLandscape && slide.layout === 'editorial-top')
  ) {
    const safePadX = w * 0.085 + textOffX;
    const leftMaxW = w * 0.44;
    const startY = h * 0.24 + textOffY;

    const copyRes = drawEditorialCopy(ctx, {
      x: safePadX,
      y: startY,
      maxWidth: leftMaxW,
      align: 'left',
      slide,
      unit: unit * 0.94,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;

    const baseDevW =
      activeModel === 'browser-card'
        ? w * 0.46 * tf.scale
        : Math.min(w * 0.26, h * 0.58) * tf.scale;

    if (activeModel !== 'browser-card' && activeModel !== 'none') {
      drawDevice(ctx, {
        cx: w * 0.83 + offX,
        cy: h * 0.58 + offY,
        width: baseDevW * 0.88,
        rotationDeg: 8 + tf.rotation,
        model: activeModel,
        finish: slide.deviceFinish,
        screenshotUrl: slide.secondaryScreenshotUrl,
        sampleVariant: slide.secondarySampleVariant,
        accentColor: slide.accentColor,
        fit: slide.screenshotFit,
        shadowIntensity: slide.shadowIntensity * 0.85,
        glare: slide.glare,
      });
    }

    bounds.device = drawDevice(ctx, {
      cx: (activeModel === 'browser-card' ? w * 0.73 : w * 0.69) + offX,
      cy: (activeModel === 'browser-card' ? h * 0.52 : h * 0.56) + offY,
      width: baseDevW,
      rotationDeg:
        (activeModel === 'browser-card' ? -2 : -6) + tf.rotation,
      model: activeModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.screenshotUrl,
      sampleVariant: slide.sampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity,
      glare: slide.glare,
    });
  } else if (slide.layout === 'editorial-bottom') {
    const devW = Math.min(w * 0.76, h * 0.44) * tf.scale;
    bounds.device = drawDevice(ctx, {
      cx: w * 0.5 + offX,
      cy: h * 0.27 + offY,
      width: devW,
      rotationDeg: tf.rotation,
      model: activeModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.screenshotUrl,
      sampleVariant: slide.sampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity,
      glare: slide.glare,
    });

    const copyX =
      (slide.textAlign === 'center' ? w * 0.5 : w * 0.09) + textOffX;
    const copyRes = drawEditorialCopy(ctx, {
      x: copyX,
      y: h * 0.74 + textOffY,
      maxWidth: w * 0.82,
      align: slide.textAlign,
      slide,
      unit,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;
  } else if (slide.layout === 'angled-left' || slide.layout === 'angled-right') {
    const dir = slide.layout === 'angled-left' ? -1 : 1;
    const copyX =
      (slide.textAlign === 'center' ? w * 0.5 : w * 0.09) + textOffX;
    const copyRes = drawEditorialCopy(ctx, {
      x: copyX,
      y: (isLandscape ? h * 0.1 : h * 0.105) + textOffY,
      maxWidth: w * 0.82,
      align: slide.textAlign,
      slide,
      unit: isLandscape ? unit * 0.85 : unit,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;

    const devW =
      (isLandscape ? Math.min(w * 0.32, h * 0.6) : Math.min(w * 0.75, h * 0.46)) *
      tf.scale;

    bounds.device = drawDevice(ctx, {
      cx: w * (0.5 - dir * 0.03) + offX,
      cy: (isLandscape ? h * 0.68 : h * 0.66) + offY,
      width: devW,
      rotationDeg: dir * 8.5 + tf.rotation,
      model: activeModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.screenshotUrl,
      sampleVariant: slide.sampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity,
      glare: slide.glare,
    });
  } else if (
    slide.layout === 'panoramic-right' ||
    slide.layout === 'panoramic-left'
  ) {
    const copyX =
      (slide.textAlign === 'center' ? w * 0.5 : w * 0.09) + textOffX;
    const copyRes = drawEditorialCopy(ctx, {
      x: copyX,
      y: h * 0.105 + textOffY,
      maxWidth: w * 0.82,
      align: slide.textAlign,
      slide,
      unit,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;

    const sourceSlide =
      slide.layout === 'panoramic-left' &&
      previousSlide &&
      previousSlide.layout === 'panoramic-right'
        ? previousSlide
        : slide;

    const srcTf =
      sourceSlide.deviceTransforms[platformSlot] ||
      sourceSlide.deviceTransforms.ios;
    const srcModel = sourceSlide.deviceModels[platformSlot] || activeModel;

    const bridgeOffX = (srcTf.offsetX / 100) * w;
    const bridgeOffY = (srcTf.offsetY / 100) * h;
    const devW = Math.min(w * 0.76, h * 0.45) * srcTf.scale;
    const seamAnchorX = w * 0.98 + bridgeOffX;
    const actualCx =
      slide.layout === 'panoramic-right' ? seamAnchorX : seamAnchorX - w;

    const spanBox = drawDevice(ctx, {
      cx: actualCx,
      cy: h * 0.66 + bridgeOffY,
      width: devW,
      rotationDeg: -7 + srcTf.rotation,
      model: srcModel,
      finish: sourceSlide.deviceFinish,
      screenshotUrl: slide.screenshotUrl ?? sourceSlide.screenshotUrl,
      sampleVariant: sourceSlide.sampleVariant,
      accentColor: sourceSlide.accentColor,
      fit: sourceSlide.screenshotFit,
      shadowIntensity: sourceSlide.shadowIntensity,
      glare: sourceSlide.glare,
    });

    if (slide.layout === 'panoramic-left') {
      bounds.device = drawDevice(ctx, {
        cx: w * 0.73 + offX,
        cy: h * 0.71 + offY,
        width: Math.min(w * 0.76, h * 0.45) * tf.scale * 0.82,
        rotationDeg: 4 + tf.rotation,
        model: activeModel,
        finish: slide.deviceFinish,
        screenshotUrl: slide.secondaryScreenshotUrl ?? slide.screenshotUrl,
        sampleVariant: slide.secondarySampleVariant,
        accentColor: slide.accentColor,
        fit: slide.screenshotFit,
        shadowIntensity: slide.shadowIntensity * 0.9,
        glare: slide.glare,
      });
    } else {
      bounds.device = spanBox;
    }
  } else if (slide.layout === 'dual-showcase') {
    const copyX =
      (slide.textAlign === 'center' ? w * 0.5 : w * 0.09) + textOffX;
    const copyRes = drawEditorialCopy(ctx, {
      x: copyX,
      y: h * 0.1 + textOffY,
      maxWidth: w * 0.82,
      align: slide.textAlign,
      slide,
      unit,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;

    const devW = Math.min(w * 0.64, h * 0.41) * tf.scale;

    drawDevice(ctx, {
      cx: w * 0.64 + offX,
      cy: h * 0.67 + offY,
      width: devW * 0.9,
      rotationDeg: 7 + tf.rotation,
      model: activeModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.secondaryScreenshotUrl,
      sampleVariant: slide.secondarySampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity * 0.85,
      glare: slide.glare,
    });

    bounds.device = drawDevice(ctx, {
      cx: w * 0.39 + offX,
      cy: h * 0.65 + offY,
      width: devW,
      rotationDeg: -5 + tf.rotation,
      model: activeModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.screenshotUrl,
      sampleVariant: slide.sampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity,
      glare: slide.glare,
    });
  } else if (slide.layout === 'floating-card') {
    const copyX =
      (slide.textAlign === 'center' ? w * 0.5 : w * 0.09) + textOffX;
    const copyRes = drawEditorialCopy(ctx, {
      x: copyX,
      y: (isLandscape ? h * 0.1 : h * 0.105) + textOffY,
      maxWidth: isLandscape ? w * 0.76 : w * 0.84,
      align: slide.textAlign,
      slide,
      unit: isLandscape ? unit * 0.86 : unit,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;

    const cardModel =
      activeModel === 'iphone-16-pro' && isLandscape
        ? 'browser-card'
        : activeModel;
    const devW =
      (isLandscape ? w * 0.62 : Math.min(w * 0.82, h * 0.45)) * tf.scale;
    const cardCy = isLandscape
      ? Math.max(h * 0.66, copyRes.bottomY + devW * 0.34)
      : h * 0.63;

    bounds.device = drawDevice(ctx, {
      cx: w * 0.5 + offX,
      cy: cardCy + offY,
      width: devW,
      rotationDeg: tf.rotation,
      model: cardModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.screenshotUrl,
      sampleVariant: slide.sampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity * 1.1,
      glare: slide.glare,
    });
  } else {
    // 'editorial-top'
    const copyX =
      (slide.textAlign === 'center' ? w * 0.5 : w * 0.09) + textOffX;
    const copyRes = drawEditorialCopy(ctx, {
      x: copyX,
      y: h * 0.105 + textOffY,
      maxWidth: w * 0.82,
      align: slide.textAlign,
      slide,
      unit,
      skipPaint: hideTextForInlineEdit,
    });
    bounds.text = copyRes.box;

    const devW = Math.min(w * 0.77, h * 0.47) * tf.scale;
    bounds.device = drawDevice(ctx, {
      cx: w * 0.5 + offX,
      cy: h * 0.67 + offY,
      width: devW,
      rotationDeg: tf.rotation,
      model: activeModel,
      finish: slide.deviceFinish,
      screenshotUrl: slide.screenshotUrl,
      sampleVariant: slide.sampleVariant,
      accentColor: slide.accentColor,
      fit: slide.screenshotFit,
      shadowIntensity: slide.shadowIntensity,
      glare: slide.glare,
    });
  }

  // 2. Overlays positioned ABOVE the device
  drawOverlayLayers(ctx, w, h, slide.overlays, 'above', bounds.overlays);

  // Non-exported Store Safe-Zone Guides
  if (showSafeZones) {
    ctx.save();
    const marginX = isPlayFeatureGraphic ? w * 0.08 : w * 0.065;
    const marginY = isPlayFeatureGraphic ? h * 0.1 : h * 0.055;

    ctx.strokeStyle = 'rgba(13, 153, 255, 0.75)';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.0022);
    ctx.setLineDash([Math.max(8, w * 0.008), Math.max(6, w * 0.006)]);
    ctx.strokeRect(marginX, marginY, w - marginX * 2, h - marginY * 2);

    ctx.strokeStyle = 'rgba(13, 153, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  return bounds;
}

export async function exportSlideBlob(
  slide: SlideConfig,
  options: RenderOptions,
  format: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<Blob> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  const offscreen = document.createElement('canvas');
  renderSlideToCanvas(offscreen, slide, {
    ...options,
    showSafeZones: false,
    hideTextForInlineEdit: false,
  });
  return new Promise<Blob>((resolve, reject) => {
    offscreen.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      },
      format,
      0.96
    );
  });
}
