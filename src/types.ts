export type StorePresetId =
  | 'ios-69'
  | 'ios-67'
  | 'ipad-13'
  | 'play-phone'
  | 'play-feature'
  | 'product-banner'
  | 'product-hunt';

export type PlatformSlot = 'ios' | 'android' | 'ipad' | 'banner';

export interface StorePreset {
  id: StorePresetId;
  store: 'App Store' | 'Google Play' | 'Web';
  label: string;
  shortLabel: string;
  platformSlot: PlatformSlot;
  width: number;
  height: number;
  aspectLabel: string;
  isLandscape: boolean;
}

export type LayoutTemplateId =
  | 'editorial-top'
  | 'editorial-bottom'
  | 'angled-left'
  | 'angled-right'
  | 'panoramic-right'
  | 'panoramic-left'
  | 'dual-showcase'
  | 'banner-split'
  | 'floating-card';

export interface LayoutTemplateMeta {
  id: LayoutTemplateId;
  name: string;
}

export type DeviceModel =
  | 'iphone-16-pro'
  | 'pixel-9-pro'
  | 'ipad-pro'
  | 'browser-card'
  | 'frameless'
  | 'none';

export type DeviceFinish =
  | 'titanium-dark'
  | 'titanium-natural'
  | 'titanium-silver'
  | 'clay-dark'
  | 'clay-light';

export type FontFamilyChoice =
  | 'Inter'
  | 'Plus Jakarta Sans'
  | 'Space Grotesk'
  | 'DM Sans'
  | 'Instrument Serif';

export type PatternType = 'none' | 'dots' | 'grid' | 'rings';

export type SampleScreenVariant =
  | 'analytics'
  | 'tasks'
  | 'fintech'
  | 'ai-notes'
  | 'fitness';

export interface BackgroundStyle {
  type: 'mesh' | 'linear' | 'solid';
  colorA: string;
  colorB: string;
  colorC: string;
  angle: number;
  pattern: PatternType;
  patternOpacity: number;
  noise: number;
  spotlight: boolean;
}

export interface ThemePalette {
  id: string;
  name: string;
  background: BackgroundStyle;
  textColor: string;
  accentColor: string;
  deviceFinish: DeviceFinish;
}

/**
 * Independent per-platform device placement & sizing.
 * Adjusting Android (Play Store) never alters iOS (App Store), iPad, or Banner transforms.
 */
export interface DeviceTransform {
  offsetX: number; // % of canvas width (-80 .. +80)
  offsetY: number; // % of canvas height (-80 .. +80)
  scale: number; // 0.35 .. 2.2
  rotation: number; // degrees (-45 .. +45)
}

export type PlatformDeviceTransforms = Record<PlatformSlot, DeviceTransform>;
export type PlatformDeviceModels = Record<PlatformSlot, DeviceModel>;

export interface OverlayLayer {
  id: string;
  name: string;
  imageUrl: string;
  x: number; // center X in % of canvas width (0 .. 100)
  y: number; // center Y in % of canvas height (0 .. 100)
  scale: number; // 0.15 .. 3.0 (1.0 = default width)
  rotation: number; // degrees (-180 .. 180)
  opacity: number; // 0.1 .. 1.0
  cornerRadius: number; // 0 .. 48
  shadow: number; // 0 .. 1.5
  layerOrder: 'above' | 'behind';
  visible: boolean;
}

export interface SlideConfig {
  id: string;
  name: string;
  layout: LayoutTemplateId;
  headline: string;
  subheadline: string;
  showSubheadline: boolean;
  textAlign: 'left' | 'center';
  fontFamily: FontFamilyChoice;
  titleSizeScale: number;
  textOffsetX: number; // % of canvas width (-50 .. +50)
  textOffsetY: number; // % of canvas height (-50 .. +50)
  textColor: string;
  accentColor: string;
  deviceFinish: DeviceFinish;
  deviceModels: PlatformDeviceModels;
  deviceTransforms: PlatformDeviceTransforms;
  shadowIntensity: number;
  glare: boolean;
  screenshotUrl: string | null;
  secondaryScreenshotUrl: string | null;
  screenshotFit: 'cover' | 'contain';
  sampleVariant: SampleScreenVariant;
  secondarySampleVariant: SampleScreenVariant;
  overlays: OverlayLayer[];
  background: BackgroundStyle;
}

export type CanvasSelection =
  | { type: 'frame' }
  | { type: 'text' }
  | { type: 'device' }
  | { type: 'overlay'; id: string };

export interface SceneBox {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export interface RenderedSceneBounds {
  text: (SceneBox & { align: 'left' | 'center'; fontPx: number }) | null;
  device: SceneBox | null;
  overlays: Array<SceneBox & { id: string; layerOrder: 'above' | 'behind' }>;
}

export interface ProjectState {
  projectName: string;
  presetId: StorePresetId;
  customWidth: number;
  customHeight: number;
  useCustomSize: boolean;
  slides: SlideConfig[];
}
