import React, { useEffect, useRef, useState } from 'react';
import {
  renderSlideToCanvas,
  subscribeImageLoads,
} from '../canvas/renderSlide';
import { PlatformSlot, RenderedSceneBounds, SlideConfig } from '../types';

interface SlideCanvasProps {
  slide: SlideConfig;
  previousSlide?: SlideConfig | null;
  targetWidth: number;
  targetHeight: number;
  platformSlot: PlatformSlot;
  renderScale?: number;
  showSafeZones?: boolean;
  isPlayFeatureGraphic?: boolean;
  hideTextForInlineEdit?: boolean;
  onBoundsComputed?: (bounds: RenderedSceneBounds, renderedW: number, renderedH: number) => void;
  className?: string;
}

export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  slide,
  previousSlide = null,
  targetWidth,
  targetHeight,
  platformSlot,
  renderScale = 1,
  showSafeZones = false,
  isPlayFeatureGraphic = false,
  hideTextForInlineEdit = false,
  onBoundsComputed,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageTick, setImageTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeImageLoads(() => {
      setImageTick((t) => t + 1);
    });
    let active = true;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (active) setImageTick((t) => t + 1);
      });
    }
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = Math.max(64, Math.round(targetWidth * renderScale));
    const h = Math.max(64, Math.round(targetHeight * renderScale));
    const bounds = renderSlideToCanvas(canvas, slide, {
      width: w,
      height: h,
      platformSlot,
      showSafeZones,
      isPlayFeatureGraphic,
      previousSlide,
      hideTextForInlineEdit,
    });
    onBoundsComputed?.(bounds, w, h);
  }, [
    slide,
    previousSlide,
    targetWidth,
    targetHeight,
    platformSlot,
    renderScale,
    showSafeZones,
    isPlayFeatureGraphic,
    hideTextForInlineEdit,
    imageTick,
    onBoundsComputed,
  ]);

  return <canvas ref={canvasRef} className={className} />;
};
