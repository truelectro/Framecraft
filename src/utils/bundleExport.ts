import { exportSlideBlob } from '../canvas/renderSlide';
import { PlatformSlot, SlideConfig } from '../types';
import { createZipBlob, ZipEntryInput } from './zip';

export interface BundleExportOptions {
  includeAppStoreIphone: boolean;
  includeAppStoreIpad: boolean;
  includePlayStorePhone: boolean;
  includePlayFeatureGraphic: boolean;
  includeProductBanner: boolean;
}

export const DEFAULT_BUNDLE_OPTIONS: BundleExportOptions = {
  includeAppStoreIphone: true,
  includeAppStoreIpad: false,
  includePlayStorePhone: true,
  includePlayFeatureGraphic: true,
  includeProductBanner: true,
};

function adaptSlideForPortrait(slide: SlideConfig): SlideConfig {
  const isBannerLayout = slide.layout === 'banner-split';
  if (!isBannerLayout) return slide;
  return {
    ...slide,
    layout: 'editorial-top',
    textAlign: 'center',
  };
}

function buildHeroBannerSlide(slides: SlideConfig[]): SlideConfig {
  const existingBanner = slides.find((s) => s.layout === 'banner-split');
  const primary = existingBanner || slides[0];
  const secondSlide = slides[1];

  return {
    ...primary,
    layout: 'banner-split',
    textAlign: 'left',
    secondaryScreenshotUrl:
      primary.secondaryScreenshotUrl ?? secondSlide?.screenshotUrl ?? null,
    secondarySampleVariant:
      primary.secondarySampleVariant ??
      secondSlide?.sampleVariant ??
      'fintech',
  };
}

export function countBundleAssets(
  slideCount: number,
  opts: BundleExportOptions
): number {
  let total = 0;
  if (opts.includeAppStoreIphone) total += slideCount;
  if (opts.includeAppStoreIpad) total += slideCount;
  if (opts.includePlayStorePhone) total += slideCount;
  if (opts.includePlayFeatureGraphic) total += 1;
  if (opts.includeProductBanner) total += 1;
  return total;
}

async function renderSetForPlatform(
  slides: SlideConfig[],
  width: number,
  height: number,
  platformSlot: PlatformSlot,
  folder: string,
  slug: string,
  entries: ZipEntryInput[],
  tick: () => void
) {
  const adapted = slides.map(adaptSlideForPortrait);
  for (let i = 0; i < adapted.length; i++) {
    const png = await exportSlideBlob(adapted[i], {
      width,
      height,
      platformSlot,
      previousSlide: i > 0 ? adapted[i - 1] : null,
    });
    const num = String(i + 1).padStart(2, '0');
    entries.push({
      filename: `${folder}/${num}-${slug}-${width}x${height}.png`,
      data: new Uint8Array(await png.arrayBuffer()),
    });
    tick();
  }
}

export async function generateMultiStoreBundleZip(
  projectName: string,
  slides: SlideConfig[],
  opts: BundleExportOptions,
  onProgress?: (completed: number, total: number) => void
): Promise<{ blob: Blob; filename: string; assetCount: number }> {
  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'app';

  const entries: ZipEntryInput[] = [];
  const total = Math.max(1, countBundleAssets(slides.length, opts));
  let done = 0;

  const tick = () => {
    done += 1;
    onProgress?.(done, total);
  };

  if (opts.includeAppStoreIphone) {
    await renderSetForPlatform(
      slides,
      1320,
      2868,
      'ios',
      'apple-app-store/iphone-6.9-1320x2868',
      slug,
      entries,
      tick
    );
  }

  if (opts.includeAppStoreIpad) {
    await renderSetForPlatform(
      slides,
      2064,
      2752,
      'ipad',
      'apple-app-store/ipad-pro-13-2064x2752',
      slug,
      entries,
      tick
    );
  }

  if (opts.includePlayStorePhone) {
    await renderSetForPlatform(
      slides,
      1080,
      1920,
      'android',
      'google-play-store/phone-1080x1920',
      slug,
      entries,
      tick
    );
  }

  if (opts.includePlayFeatureGraphic && slides.length > 0) {
    const bannerSlide = buildHeroBannerSlide(slides);
    const png = await exportSlideBlob(bannerSlide, {
      width: 1024,
      height: 500,
      platformSlot: 'banner',
      isPlayFeatureGraphic: true,
      previousSlide: null,
    });
    entries.push({
      filename: `google-play-store/feature-graphic-1024x500/${slug}-feature-graphic-1024x500.png`,
      data: new Uint8Array(await png.arrayBuffer()),
    });
    tick();
  }

  if (opts.includeProductBanner && slides.length > 0) {
    const webBanner = buildHeroBannerSlide(slides);
    const png = await exportSlideBlob(webBanner, {
      width: 1600,
      height: 900,
      platformSlot: 'banner',
      previousSlide: null,
    });
    entries.push({
      filename: `web/product-banner-1600x900/${slug}-banner-1600x900.png`,
      data: new Uint8Array(await png.arrayBuffer()),
    });
    tick();
  }

  return {
    blob: createZipBlob(entries),
    filename: `${slug}-store-bundle.zip`,
    assetCount: done,
  };
}
