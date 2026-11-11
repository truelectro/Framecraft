import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CanvasSelection,
  DeviceTransform,
  OverlayLayer,
  PlatformSlot,
  RenderedSceneBounds,
  SceneBox,
  SlideConfig,
} from '../types';
import { SlideCanvas } from './SlideCanvas';

interface InteractiveArtboardProps {
  slide: SlideConfig;
  previousSlide: SlideConfig | null;
  frameLabel: string;
  isSelectedSlide: boolean;
  selection: CanvasSelection;
  onSelectSlideAndItem: (slideId: string, sel: CanvasSelection) => void;
  targetWidth: number;
  targetHeight: number;
  displayWidth: number;
  displayHeight: number;
  renderScale: number;
  platformSlot: PlatformSlot;
  showSafeZones: boolean;
  isPlayFeatureGraphic: boolean;
  panModeActive?: boolean;
  inlineEditRequestTick?: number;
  onUpdateSlide: (patch: Partial<SlideConfig>) => void;
  onUpdateDeviceTransform: (patch: Partial<DeviceTransform>) => void;
  onUpdateOverlay: (overlayId: string, patch: Partial<OverlayLayer>) => void;
  onRequestScreenshotUpload: () => void;
  onRequestOverlayReplace: (overlayId: string) => void;
  onDropImageFile: (file: File, asOverlay: boolean) => void;
}

type HitTarget =
  | { type: 'frame' }
  | { type: 'text'; box: SceneBox }
  | { type: 'device'; box: SceneBox }
  | { type: 'overlay'; id: string; box: SceneBox };

type DragSession =
  | {
      mode: 'move-device';
      startClientX: number;
      startClientY: number;
      startOffsetX: number;
      startOffsetY: number;
      moved: boolean;
    }
  | {
      mode: 'scale-device';
      centerClientX: number;
      centerClientY: number;
      startDist: number;
      startScale: number;
    }
  | {
      mode: 'rotate-device';
      centerClientX: number;
      centerClientY: number;
      startAngleRad: number;
      startRotation: number;
    }
  | {
      mode: 'move-overlay';
      id: string;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      mode: 'scale-overlay';
      id: string;
      centerClientX: number;
      centerClientY: number;
      startDist: number;
      startScale: number;
    }
  | {
      mode: 'rotate-overlay';
      id: string;
      centerClientX: number;
      centerClientY: number;
      startAngleRad: number;
      startRotation: number;
    }
  | {
      mode: 'move-text';
      startClientX: number;
      startClientY: number;
      startOffsetX: number;
      startOffsetY: number;
      moved: boolean;
    }
  | {
      mode: 'scale-text';
      centerClientX: number;
      centerClientY: number;
      startDist: number;
      startScale: number;
    };

function pointInsideRotatedBox(
  px: number,
  py: number,
  box: SceneBox,
  padding = 6
): boolean {
  const dx = px - box.cx;
  const dy = py - box.cy;
  const rad = (-box.rotationDeg * Math.PI) / 180;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return (
    Math.abs(lx) <= box.width / 2 + padding &&
    Math.abs(ly) <= box.height / 2 + padding
  );
}

export const InteractiveArtboard: React.FC<InteractiveArtboardProps> = ({
  slide,
  previousSlide,
  frameLabel,
  isSelectedSlide,
  selection,
  onSelectSlideAndItem,
  targetWidth,
  targetHeight,
  displayWidth,
  displayHeight,
  renderScale,
  platformSlot,
  showSafeZones,
  isPlayFeatureGraphic,
  panModeActive = false,
  inlineEditRequestTick = 0,
  onUpdateSlide,
  onUpdateDeviceTransform,
  onUpdateOverlay,
  onRequestScreenshotUpload,
  onRequestOverlayReplace,
  onDropImageFile,
}) => {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [scene, setScene] = useState<{
    bounds: RenderedSceneBounds;
    rw: number;
    rh: number;
  } | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<CanvasSelection | null>(null);
  const [editingTextInline, setEditingTextInline] = useState(false);
  const [snapGuideX, setSnapGuideX] = useState(false);
  const [snapGuideY, setSnapGuideY] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');

  const dragRef = useRef<DragSession | null>(null);
  const lastHandledInlineTickRef = useRef<number>(inlineEditRequestTick);

  useEffect(() => {
    if (!isSelectedSlide || selection.type !== 'text') {
      setEditingTextInline(false);
    }
  }, [isSelectedSlide, selection]);

  useEffect(() => {
    if (inlineEditRequestTick !== lastHandledInlineTickRef.current) {
      lastHandledInlineTickRef.current = inlineEditRequestTick;
      if (isSelectedSlide) {
        setEditingTextInline(true);
      }
    }
  }, [inlineEditRequestTick, isSelectedSlide]);

  useEffect(() => {
    if (panModeActive) {
      setHoveredTarget(null);
    }
  }, [panModeActive]);

  useEffect(() => {
    if (editingTextInline && inlineTextareaRef.current) {
      inlineTextareaRef.current.focus();
      inlineTextareaRef.current.select();
    }
  }, [editingTextInline]);

  const handleBoundsComputed = useCallback(
    (bounds: RenderedSceneBounds, rw: number, rh: number) => {
      setScene({ bounds, rw, rh });
    },
    []
  );

  const toSceneCoords = (clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el || !scene) return { sx: 0, sy: 0 };
    const rect = el.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * scene.rw;
    const sy = ((clientY - rect.top) / rect.height) * scene.rh;
    return { sx, sy };
  };

  const hitTest = (sx: number, sy: number): HitTarget => {
    if (!scene) return { type: 'frame' };
    const { bounds } = scene;

    // 1. Topmost 'above' overlays (reverse order)
    const above = bounds.overlays.filter((o) => o.layerOrder === 'above');
    for (let i = above.length - 1; i >= 0; i--) {
      const o = above[i];
      if (pointInsideRotatedBox(sx, sy, o)) {
        return { type: 'overlay', id: o.id, box: o };
      }
    }

    // 2. Text block
    if (bounds.text && pointInsideRotatedBox(sx, sy, bounds.text, 8)) {
      return { type: 'text', box: bounds.text };
    }

    // 3. Primary Device
    if (bounds.device && pointInsideRotatedBox(sx, sy, bounds.device, 4)) {
      return { type: 'device', box: bounds.device };
    }

    // 4. 'behind' overlays
    const behind = bounds.overlays.filter((o) => o.layerOrder === 'behind');
    for (let i = behind.length - 1; i >= 0; i--) {
      const o = behind[i];
      if (pointInsideRotatedBox(sx, sy, o)) {
        return { type: 'overlay', id: o.id, box: o };
      }
    }

    return { type: 'frame' };
  };

  const getSelectedBox = (): SceneBox | null => {
    if (!isSelectedSlide || !scene) return null;
    if (selection.type === 'device') return scene.bounds.device;
    if (selection.type === 'text') return scene.bounds.text;
    if (selection.type === 'overlay') {
      return scene.bounds.overlays.find((o) => o.id === selection.id) || null;
    }
    return null;
  };

  const getHoveredBox = (): SceneBox | null => {
    if (!scene || !hoveredTarget || editingTextInline) return null;
    // Skip if same as active selection
    if (
      isSelectedSlide &&
      hoveredTarget.type === selection.type &&
      (hoveredTarget.type !== 'overlay' ||
        (selection.type === 'overlay' && hoveredTarget.id === selection.id))
    ) {
      return null;
    }
    if (hoveredTarget.type === 'device') return scene.bounds.device;
    if (hoveredTarget.type === 'text') return scene.bounds.text;
    if (hoveredTarget.type === 'overlay') {
      return (
        scene.bounds.overlays.find((o) => o.id === hoveredTarget.id) || null
      );
    }
    return null;
  };

  const onSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panModeActive || e.button !== 0 || editingTextInline) return;
    const { sx, sy } = toSceneCoords(e.clientX, e.clientY);
    const hit = hitTest(sx, sy);

    if (hit.type === 'frame') {
      onSelectSlideAndItem(slide.id, { type: 'frame' });
      return;
    }

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    if (hit.type === 'device') {
      onSelectSlideAndItem(slide.id, { type: 'device' });
      const tf =
        slide.deviceTransforms[platformSlot] || slide.deviceTransforms.ios;
      dragRef.current = {
        mode: 'move-device',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: tf.offsetX,
        startOffsetY: tf.offsetY,
        moved: false,
      };
    } else if (hit.type === 'overlay') {
      onSelectSlideAndItem(slide.id, { type: 'overlay', id: hit.id });
      const ov = slide.overlays.find((o) => o.id === hit.id);
      if (ov) {
        dragRef.current = {
          mode: 'move-overlay',
          id: hit.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startX: ov.x,
          startY: ov.y,
          moved: false,
        };
      }
    } else if (hit.type === 'text') {
      onSelectSlideAndItem(slide.id, { type: 'text' });
      dragRef.current = {
        mode: 'move-text',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: slide.textOffsetX,
        startOffsetY: slide.textOffsetY,
        moved: false,
      };
    }
  };

  const startCornerScale = (e: React.PointerEvent, box: SceneBox) => {
    if (panModeActive || e.button !== 0 || !surfaceRef.current || !scene) return;
    e.stopPropagation();
    e.preventDefault();
    surfaceRef.current.setPointerCapture(e.pointerId);

    const rect = surfaceRef.current.getBoundingClientRect();
    const centerClientX = rect.left + (box.cx / scene.rw) * rect.width;
    const centerClientY = rect.top + (box.cy / scene.rh) * rect.height;
    const startDist = Math.max(
      16,
      Math.hypot(e.clientX - centerClientX, e.clientY - centerClientY)
    );

    if (selection.type === 'device') {
      const tf =
        slide.deviceTransforms[platformSlot] || slide.deviceTransforms.ios;
      dragRef.current = {
        mode: 'scale-device',
        centerClientX,
        centerClientY,
        startDist,
        startScale: tf.scale,
      };
    } else if (selection.type === 'overlay') {
      const ov = slide.overlays.find((o) => o.id === selection.id);
      if (ov) {
        dragRef.current = {
          mode: 'scale-overlay',
          id: ov.id,
          centerClientX,
          centerClientY,
          startDist,
          startScale: ov.scale,
        };
      }
    } else if (selection.type === 'text') {
      dragRef.current = {
        mode: 'scale-text',
        centerClientX,
        centerClientY,
        startDist,
        startScale: slide.titleSizeScale,
      };
    }
  };

  const startRotateHandle = (e: React.PointerEvent, box: SceneBox) => {
    if (panModeActive || e.button !== 0 || !surfaceRef.current || !scene) return;
    e.stopPropagation();
    e.preventDefault();
    surfaceRef.current.setPointerCapture(e.pointerId);

    const rect = surfaceRef.current.getBoundingClientRect();
    const centerClientX = rect.left + (box.cx / scene.rw) * rect.width;
    const centerClientY = rect.top + (box.cy / scene.rh) * rect.height;
    const startAngleRad = Math.atan2(
      e.clientY - centerClientY,
      e.clientX - centerClientX
    );

    if (selection.type === 'device') {
      const tf =
        slide.deviceTransforms[platformSlot] || slide.deviceTransforms.ios;
      dragRef.current = {
        mode: 'rotate-device',
        centerClientX,
        centerClientY,
        startAngleRad,
        startRotation: tf.rotation,
      };
    } else if (selection.type === 'overlay') {
      const ov = slide.overlays.find((o) => o.id === selection.id);
      if (ov) {
        dragRef.current = {
          mode: 'rotate-overlay',
          id: ov.id,
          centerClientX,
          centerClientY,
          startAngleRad,
          startRotation: ov.rotation,
        };
      }
    }
  };

  const onSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panModeActive) return;
    const el = surfaceRef.current;
    if (!el) return;

    if (!el.hasPointerCapture(e.pointerId) || !dragRef.current) {
      const { sx, sy } = toSceneCoords(e.clientX, e.clientY);
      const hit = hitTest(sx, sy);
      if (hit.type === 'frame') setHoveredTarget(null);
      else if (hit.type === 'overlay')
        setHoveredTarget({ type: 'overlay', id: hit.id });
      else setHoveredTarget({ type: hit.type });
      return;
    }

    const session = dragRef.current;
    const rect = el.getBoundingClientRect();

    if (session.mode === 'move-device') {
      const dxPx = e.clientX - session.startClientX;
      const dyPx = e.clientY - session.startClientY;
      if (!session.moved && Math.hypot(dxPx, dyPx) < 3) return;
      session.moved = true;

      let nextX = session.startOffsetX + (dxPx / rect.width) * 100;
      let nextY = session.startOffsetY + (dyPx / rect.height) * 100;

      if (!e.altKey && Math.abs(nextX) < 1.1) {
        nextX = 0;
        setSnapGuideX(true);
      } else {
        setSnapGuideX(false);
      }

      if (!e.altKey && Math.abs(nextY) < 1.1) {
        nextY = 0;
        setSnapGuideY(true);
      } else {
        setSnapGuideY(false);
      }

      onUpdateDeviceTransform({
        offsetX: Number(Math.max(-80, Math.min(80, nextX)).toFixed(2)),
        offsetY: Number(Math.max(-80, Math.min(80, nextY)).toFixed(2)),
      });
    } else if (session.mode === 'scale-device') {
      const dist = Math.max(
        10,
        Math.hypot(
          e.clientX - session.centerClientX,
          e.clientY - session.centerClientY
        )
      );
      const nextScale = Math.max(
        0.35,
        Math.min(2.2, session.startScale * (dist / session.startDist))
      );
      onUpdateDeviceTransform({ scale: Number(nextScale.toFixed(3)) });
    } else if (session.mode === 'rotate-device') {
      const curAngle = Math.atan2(
        e.clientY - session.centerClientY,
        e.clientX - session.centerClientX
      );
      let deg =
        session.startRotation + ((curAngle - session.startAngleRad) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = Math.max(-45, Math.min(45, deg));
      onUpdateDeviceTransform({ rotation: Number(deg.toFixed(1)) });
    } else if (session.mode === 'move-overlay') {
      const dxPx = e.clientX - session.startClientX;
      const dyPx = e.clientY - session.startClientY;
      if (!session.moved && Math.hypot(dxPx, dyPx) < 3) return;
      session.moved = true;

      let nextX = session.startX + (dxPx / rect.width) * 100;
      let nextY = session.startY + (dyPx / rect.height) * 100;

      if (!e.altKey && Math.abs(nextX - 50) < 1.1) {
        nextX = 50;
        setSnapGuideX(true);
      } else {
        setSnapGuideX(false);
      }

      if (!e.altKey && Math.abs(nextY - 50) < 1.1) {
        nextY = 50;
        setSnapGuideY(true);
      } else {
        setSnapGuideY(false);
      }

      onUpdateOverlay(session.id, {
        x: Number(Math.max(-20, Math.min(120, nextX)).toFixed(2)),
        y: Number(Math.max(-20, Math.min(120, nextY)).toFixed(2)),
      });
    } else if (session.mode === 'scale-overlay') {
      const dist = Math.max(
        10,
        Math.hypot(
          e.clientX - session.centerClientX,
          e.clientY - session.centerClientY
        )
      );
      const nextScale = Math.max(
        0.12,
        Math.min(3.5, session.startScale * (dist / session.startDist))
      );
      onUpdateOverlay(session.id, { scale: Number(nextScale.toFixed(3)) });
    } else if (session.mode === 'rotate-overlay') {
      const curAngle = Math.atan2(
        e.clientY - session.centerClientY,
        e.clientX - session.centerClientX
      );
      let deg =
        session.startRotation + ((curAngle - session.startAngleRad) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = Math.max(-180, Math.min(180, deg));
      onUpdateOverlay(session.id, { rotation: Number(deg.toFixed(1)) });
    } else if (session.mode === 'move-text') {
      const dxPx = e.clientX - session.startClientX;
      const dyPx = e.clientY - session.startClientY;
      if (!session.moved && Math.hypot(dxPx, dyPx) < 3) return;
      session.moved = true;

      let nextX = session.startOffsetX + (dxPx / rect.width) * 100;
      let nextY = session.startOffsetY + (dyPx / rect.height) * 100;

      if (!e.altKey && Math.abs(nextX) < 1.1) {
        nextX = 0;
        setSnapGuideX(true);
      } else {
        setSnapGuideX(false);
      }

      onUpdateSlide({
        textOffsetX: Number(Math.max(-45, Math.min(45, nextX)).toFixed(2)),
        textOffsetY: Number(Math.max(-45, Math.min(45, nextY)).toFixed(2)),
      });
    } else if (session.mode === 'scale-text') {
      const dist = Math.max(
        10,
        Math.hypot(
          e.clientX - session.centerClientX,
          e.clientY - session.centerClientY
        )
      );
      const nextScale = Math.max(
        0.55,
        Math.min(1.65, session.startScale * (dist / session.startDist))
      );
      onUpdateSlide({ titleSizeScale: Number(nextScale.toFixed(2)) });
    }
  };

  const endPointerSession = () => {
    if (dragRef.current) {
      setLiveStatus('Updated element transform');
    }
    dragRef.current = null;
    setSnapGuideX(false);
    setSnapGuideY(false);
  };

  const onSurfaceDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panModeActive) return;
    const { sx, sy } = toSceneCoords(e.clientX, e.clientY);
    const hit = hitTest(sx, sy);
    if (hit.type === 'text') {
      e.stopPropagation();
      onSelectSlideAndItem(slide.id, { type: 'text' });
      setEditingTextInline(true);
    } else if (hit.type === 'device') {
      e.stopPropagation();
      onSelectSlideAndItem(slide.id, { type: 'device' });
      onRequestScreenshotUpload();
    } else if (hit.type === 'overlay') {
      e.stopPropagation();
      onSelectSlideAndItem(slide.id, { type: 'overlay', id: hit.id });
      onRequestOverlayReplace(hit.id);
    }
  };

  const selectedBox = getSelectedBox();
  const hoveredBox = getHoveredBox();
  const scaleX = scene ? displayWidth / scene.rw : 1;
  const scaleY = scene ? displayHeight / scene.rh : 1;

  return (
    <div className="figma-frame-unit" data-frame-id={slide.id}>
      {/* Figma Frame Header Bar above artboard */}
      <div
        className={`figma-frame-caption ${isSelectedSlide ? 'is-selected' : ''}`}
        onClick={() => {
          if (!panModeActive) {
            onSelectSlideAndItem(slide.id, { type: 'frame' });
          }
        }}
      >
        <span className="figma-frame-name">{frameLabel}</span>
        <span className="figma-frame-dim tabular">
          {targetWidth} × {targetHeight}
        </span>
      </div>

      <div
        ref={surfaceRef}
        style={{ width: displayWidth, height: displayHeight }}
        className={`artboard-surface ${isSelectedSlide ? 'is-active-frame' : ''} ${
          dropActive ? 'is-drop-active' : ''
        }`}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={endPointerSession}
        onLostPointerCapture={endPointerSession}
        onPointerLeave={() => {
          if (!dragRef.current) setHoveredTarget(null);
        }}
        onDoubleClick={onSurfaceDoubleClick}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dropActive) setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file && file.type.startsWith('image/')) {
            onDropImageFile(file, e.shiftKey);
          }
        }}
      >
        <SlideCanvas
          slide={slide}
          previousSlide={previousSlide}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          platformSlot={platformSlot}
          renderScale={renderScale}
          showSafeZones={showSafeZones}
          isPlayFeatureGraphic={isPlayFeatureGraphic}
          hideTextForInlineEdit={editingTextInline}
          onBoundsComputed={handleBoundsComputed}
        />

        {/* Magnetic Center Snap Hairlines (#F24822) */}
        {snapGuideX ? <div className="snap-line-v" aria-hidden="true" /> : null}
        {snapGuideY ? <div className="snap-line-h" aria-hidden="true" /> : null}

        {/* Hover Outline */}
        {hoveredBox ? (
          <div
            className="figma-hover-box"
            style={{
              left: hoveredBox.cx * scaleX,
              top: hoveredBox.cy * scaleY,
              width: hoveredBox.width * scaleX,
              height: hoveredBox.height * scaleY,
              transform: `translate(-50%, -50%) rotate(${hoveredBox.rotationDeg}deg)`,
            }}
          />
        ) : null}

        {/* Selected Element Bounding Gizmo + Corner Scale + Rotation Handles */}
        {selectedBox && !editingTextInline ? (
          <div
            className="figma-selection-box"
            style={{
              left: selectedBox.cx * scaleX,
              top: selectedBox.cy * scaleY,
              width: selectedBox.width * scaleX,
              height: selectedBox.height * scaleY,
              transform: `translate(-50%, -50%) rotate(${selectedBox.rotationDeg}deg)`,
            }}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
              <div
                key={corner}
                className={`figma-corner-handle is-${corner}`}
                onPointerDown={(e) => startCornerScale(e, selectedBox)}
              />
            ))}

            {(selection.type === 'device' || selection.type === 'overlay') ? (
              <div
                className="figma-rotate-handle"
                title="Drag to rotate (Shift snaps 15°)"
                onPointerDown={(e) => startRotateHandle(e, selectedBox)}
              />
            ) : null}
          </div>
        ) : null}

        {/* Direct On-Canvas Inline Text Editor */}
        {editingTextInline && scene?.bounds.text ? (
          <textarea
            ref={inlineTextareaRef}
            aria-label="Edit headline directly on canvas"
            className="canvas-inline-editor"
            value={slide.headline}
            onChange={(e) => onUpdateSlide({ headline: e.target.value })}
            onBlur={() => setEditingTextInline(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
                e.preventDefault();
                setEditingTextInline(false);
              }
            }}
            style={{
              left: scene.bounds.text.cx * scaleX,
              top: scene.bounds.text.cy * scaleY,
              width: Math.max(140, scene.bounds.text.width * scaleX + 24),
              minHeight: Math.max(48, scene.bounds.text.height * scaleY + 16),
              fontFamily: `"${slide.fontFamily}", sans-serif`,
              fontSize: Math.max(13, scene.bounds.text.fontPx * scaleY),
              fontWeight: slide.fontFamily === 'Instrument Serif' ? 400 : 800,
              color: slide.textColor,
              textAlign: scene.bounds.text.align,
            }}
          />
        ) : null}

        {dropActive ? (
          <div className="drop-hint-overlay">
            Drop Screenshot · Hold Shift to Drop as Overlay
          </div>
        ) : null}

        <div className="sr-live" aria-live="polite">
          {liveStatus}
        </div>
      </div>
    </div>
  );
};
