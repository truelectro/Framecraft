import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderArchive,
  Grid,
  HelpCircle,
  ImagePlus,
  Layers,
  Maximize2,
  Minus,
  Moon,
  PanelLeft,
  Plus,
  Redo2,
  RotateCcw,
  Smartphone,
  Square,
  Sun,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { exportSlideBlob } from './canvas/renderSlide';
import { BundleModal } from './components/BundleModal';
import { InteractiveArtboard } from './components/InteractiveArtboard';
import { ScrubInput } from './components/ScrubInput';
import { ShortcutsModal } from './components/ShortcutsModal';
import { SlideCanvas } from './components/SlideCanvas';
import { StorePreviewModal } from './components/StorePreviewModal';
import { ToolbarTooltip } from './components/ToolbarTooltip';
import {
  createDefaultDeviceModels,
  createDefaultSlides,
  createDefaultTransforms,
  LAYOUT_TEMPLATES,
  resolvePlatformSlot,
  STORE_PRESETS,
  THEME_PALETTES,
} from './presets';
import {
  CanvasSelection,
  DeviceFinish,
  DeviceModel,
  DeviceTransform,
  FontFamilyChoice,
  OverlayLayer,
  PatternType,
  PlatformSlot,
  ProjectState,
  SampleScreenVariant,
  SlideConfig,
  StorePresetId,
} from './types';
import {
  BundleExportOptions,
  DEFAULT_BUNDLE_OPTIONS,
  generateMultiStoreBundleZip,
} from './utils/bundleExport';
import { createZipBlob } from './utils/zip';

const STORAGE_KEY = 'framecraft_studio_project_v2';
const UI_LAYOUT_KEY = 'framecraft_ui_layout_v1';

const DEFAULT_LEFT_W = 212;
const MIN_LEFT_W = 156;
const MAX_LEFT_W = 380;

const DEFAULT_RIGHT_W = 268;
const MIN_RIGHT_W = 224;
const MAX_RIGHT_W = 440;

const DEFAULT_FRAMES_RATIO = 0.46;
const MIN_FRAMES_RATIO = 0.2;
const MAX_FRAMES_RATIO = 0.8;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;

interface UiLayoutPrefs {
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  framesPaneRatio: number;
  sidebarsHidden: boolean;
}

function clampLeftSidebar(width: number, rightW: number, viewportW: number): number {
  const maxAllowed = Math.max(MIN_LEFT_W, Math.min(MAX_LEFT_W, viewportW - rightW - 240));
  return Math.round(Math.max(MIN_LEFT_W, Math.min(maxAllowed, width)));
}

function clampRightSidebar(width: number, leftW: number, viewportW: number): number {
  const maxAllowed = Math.max(MIN_RIGHT_W, Math.min(MAX_RIGHT_W, viewportW - leftW - 240));
  return Math.round(Math.max(MIN_RIGHT_W, Math.min(maxAllowed, width)));
}

function clampFramesRatio(ratio: number): number {
  return Number(
    Math.max(MIN_FRAMES_RATIO, Math.min(MAX_FRAMES_RATIO, ratio)).toFixed(3)
  );
}

function loadInitialUiLayout(): UiLayoutPrefs {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  try {
    const raw = localStorage.getItem(UI_LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UiLayoutPrefs>;
      const rightW =
        typeof parsed.rightSidebarWidth === 'number'
          ? parsed.rightSidebarWidth
          : DEFAULT_RIGHT_W;
      const leftW = clampLeftSidebar(
        typeof parsed.leftSidebarWidth === 'number'
          ? parsed.leftSidebarWidth
          : DEFAULT_LEFT_W,
        rightW,
        vw
      );
      return {
        leftSidebarWidth: leftW,
        rightSidebarWidth: clampRightSidebar(rightW, leftW, vw),
        framesPaneRatio: clampFramesRatio(
          typeof parsed.framesPaneRatio === 'number'
            ? parsed.framesPaneRatio
            : DEFAULT_FRAMES_RATIO
        ),
        sidebarsHidden: Boolean(parsed.sidebarsHidden),
      };
    }
  } catch {
    // Ignore read error
  }
  return {
    leftSidebarWidth: DEFAULT_LEFT_W,
    rightSidebarWidth: DEFAULT_RIGHT_W,
    framesPaneRatio: DEFAULT_FRAMES_RATIO,
    sidebarsHidden: false,
  };
}

function migrateSlide(raw: Partial<SlideConfig>, idx: number): SlideConfig {
  const fallback = createDefaultSlides(false)[0];
  return {
    ...fallback,
    ...raw,
    id: raw.id || `frame-${idx + 1}`,
    name: raw.name || `Frame ${idx + 1}`,
    textOffsetX: typeof raw.textOffsetX === 'number' ? raw.textOffsetX : 0,
    textOffsetY: typeof raw.textOffsetY === 'number' ? raw.textOffsetY : 0,
    deviceModels: {
      ...createDefaultDeviceModels(),
      ...(raw.deviceModels || {}),
    },
    deviceTransforms: {
      ...createDefaultTransforms(),
      ...(raw.deviceTransforms || {}),
    },
    overlays: Array.isArray(raw.overlays) ? raw.overlays : [],
    background: {
      ...fallback.background,
      ...(raw.background || {}),
    },
  };
}

function loadInitialProject(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectState;
      if (parsed && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        return {
          ...parsed,
          slides: parsed.slides.map(migrateSlide),
        };
      }
    }
  } catch {
    // Ignore read error
  }
  return {
    projectName: 'Luminary',
    presetId: 'ios-69',
    customWidth: 1600,
    customHeight: 900,
    useCustomSize: false,
    slides: createDefaultSlides(false),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const SLOT_LABELS: Record<PlatformSlot, string> = {
  ios: 'iOS',
  android: 'Android',
  ipad: 'iPad',
  banner: 'Banner',
};

export const App: React.FC = () => {
  const [project, setProjectRaw] = useState<ProjectState>(loadInitialProject);
  const projectRef = useRef<ProjectState>(project);
  projectRef.current = project;

  const pastRef = useRef<ProjectState[]>([]);
  const futureRef = useRef<ProjectState[]>([]);
  const lastHistoryPushRef = useRef<number>(0);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

  const setProject = useCallback(
    (
      updater: ProjectState | ((prev: ProjectState) => ProjectState),
      options?: { discrete?: boolean }
    ) => {
      const prev = projectRef.current;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return;

      const now = performance.now();
      if (options?.discrete || now - lastHistoryPushRef.current > 420) {
        pastRef.current = [...pastRef.current.slice(-39), prev];
      }
      lastHistoryPushRef.current = options?.discrete ? 0 : now;
      futureRef.current = [];
      projectRef.current = next;
      setProjectRaw(next);
      setHistoryCounts({
        undo: pastRef.current.length,
        redo: 0,
      });
    },
    []
  );

  const [selectedSlideId, setSelectedSlideId] = useState<string>(
    () => project.slides[0]?.id || 'frame-1'
  );
  const [selection, setSelection] = useState<CanvasSelection>({
    type: 'device',
  });
  const [viewMode, setViewMode] = useState<'deck' | 'single'>('deck');
  const [seamlessJoin, setSeamlessJoin] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [stageSurface, setStageSurface] = useState<'dark' | 'light'>('dark');
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef<number>(1);
  zoomRef.current = zoom;

  const [uiLayout, setUiLayout] = useState<UiLayoutPrefs>(loadInitialUiLayout);
  const [draggingSash, setDraggingSash] = useState<
    'left' | 'right' | 'frames' | null
  >(null);
  const [uiLiveMessage, setUiLiveMessage] = useState('');

  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [inlineEditTick, setInlineEditTick] = useState(0);

  const [storePreviewOpen, setStorePreviewOpen] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [bundleOptions, setBundleOptions] = useState<BundleExportOptions>(
    DEFAULT_BUNDLE_OPTIONS
  );

  const [singleExportState, setSingleExportState] = useState<
    'idle' | 'rendering' | 'done'
  >('idle');
  const [singleMorphing, setSingleMorphing] = useState(false);
  const [bundleState, setBundleState] = useState<'idle' | 'rendering' | 'done'>(
    'idle'
  );
  const [bundleMorphing, setBundleMorphing] = useState(false);
  const [bundleProgress, setBundleProgress] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const leftSidebarRef = useRef<HTMLElement | null>(null);
  const sashSessionRef = useRef<{
    startCoord: number;
    startValue: number;
    containerHeight: number;
  } | null>(null);

  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasZoomPlaneRef = useRef<HTMLDivElement | null>(null);
  const zoomAnchorRef = useRef<{
    clientX: number;
    clientY: number;
    relX: number;
    relY: number;
  } | null>(null);
  const panSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const copiedOverlayRef = useRef<OverlayLayer | null>(null);

  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const secondaryInputRef = useRef<HTMLInputElement | null>(null);
  const addOverlayInputRef = useRef<HTMLInputElement | null>(null);
  const replaceOverlayInputRef = useRef<HTMLInputElement | null>(null);
  const replaceOverlayTargetIdRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const announceUi = useCallback((msg: string) => {
    setUiLiveMessage(msg);
  }, []);

  useEffect(() => {
    if (!uiLiveMessage) return;
    const t = window.setTimeout(() => setUiLiveMessage(''), 1200);
    return () => window.clearTimeout(t);
  }, [uiLiveMessage]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // Ignore quota exceeded when large images are loaded
    }
  }, [project]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_LAYOUT_KEY, JSON.stringify(uiLayout));
    } catch {
      // Ignore storage error
    }
  }, [uiLayout]);

  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      setUiLayout((prev) => {
        const leftW = clampLeftSidebar(
          prev.leftSidebarWidth,
          prev.rightSidebarWidth,
          vw
        );
        const rightW = clampRightSidebar(prev.rightSidebarWidth, leftW, vw);
        if (
          leftW === prev.leftSidebarWidth &&
          rightW === prev.rightSidebarWidth
        ) {
          return prev;
        }
        return { ...prev, leftSidebarWidth: leftW, rightSidebarWidth: rightW };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleUndo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [
      projectRef.current,
      ...futureRef.current.slice(0, 39),
    ];
    lastHistoryPushRef.current = 0;
    projectRef.current = previous;
    setProjectRaw(previous);
    setHistoryCounts({
      undo: pastRef.current.length,
      redo: futureRef.current.length,
    });
    if (!previous.slides.some((s) => s.id === selectedSlideId)) {
      setSelectedSlideId(previous.slides[0]?.id || 'frame-1');
    }
  }, [selectedSlideId]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-39), projectRef.current];
    lastHistoryPushRef.current = 0;
    projectRef.current = next;
    setProjectRaw(next);
    setHistoryCounts({
      undo: pastRef.current.length,
      redo: futureRef.current.length,
    });
    if (!next.slides.some((s) => s.id === selectedSlideId)) {
      setSelectedSlideId(next.slides[0]?.id || 'frame-1');
    }
  }, [selectedSlideId]);

  const activePreset = useMemo(
    () =>
      STORE_PRESETS.find((p) => p.id === project.presetId) || STORE_PRESETS[0],
    [project.presetId]
  );

  const targetWidth = project.useCustomSize
    ? Math.max(320, Math.min(4096, project.customWidth))
    : activePreset.width;
  const targetHeight = project.useCustomSize
    ? Math.max(320, Math.min(4096, project.customHeight))
    : activePreset.height;
  const isLandscape = targetWidth > targetHeight * 1.15;

  const platformSlot: PlatformSlot = useMemo(
    () =>
      resolvePlatformSlot(
        project.presetId,
        project.useCustomSize,
        targetWidth,
        targetHeight
      ),
    [project.presetId, project.useCustomSize, targetWidth, targetHeight]
  );

  const selectedIndex = useMemo(() => {
    const idx = project.slides.findIndex((s) => s.id === selectedSlideId);
    return idx >= 0 ? idx : 0;
  }, [project.slides, selectedSlideId]);

  const activeSlide = project.slides[selectedIndex] || project.slides[0];

  const activeDeviceTransform =
    activeSlide?.deviceTransforms[platformSlot] || createDefaultTransforms().ios;
  const activeDeviceModel =
    activeSlide?.deviceModels[platformSlot] || 'iphone-16-pro';

  const selectedOverlay = useMemo(() => {
    if (!activeSlide || selection.type !== 'overlay') return null;
    return activeSlide.overlays.find((o) => o.id === selection.id) || null;
  }, [activeSlide, selection]);

  const updateSlide = useCallback(
    (slideId: string, patch: Partial<SlideConfig>) => {
      setProject((prev) => ({
        ...prev,
        slides: prev.slides.map((s) =>
          s.id === slideId ? { ...s, ...patch } : s
        ),
      }));
    },
    []
  );

  const updateActiveSlide = useCallback(
    (patch: Partial<SlideConfig>) => {
      if (!activeSlide) return;
      updateSlide(activeSlide.id, patch);
    },
    [activeSlide, updateSlide]
  );

  const updatePlatformDeviceTransform = useCallback(
    (slideId: string, slot: PlatformSlot, patch: Partial<DeviceTransform>) => {
      setProject((prev) => ({
        ...prev,
        slides: prev.slides.map((s) => {
          if (s.id !== slideId) return s;
          const cur = s.deviceTransforms[slot] || {
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            rotation: 0,
          };
          return {
            ...s,
            deviceTransforms: {
              ...s.deviceTransforms,
              [slot]: { ...cur, ...patch },
            },
          };
        }),
      }));
    },
    []
  );

  const updateActiveDeviceModel = (nextModel: DeviceModel) => {
    if (!activeSlide) return;
    updateSlide(activeSlide.id, {
      deviceModels: {
        ...activeSlide.deviceModels,
        [platformSlot]: nextModel,
      },
    });
  };

  const updateActiveBackground = (patch: Partial<SlideConfig['background']>) => {
    if (!activeSlide) return;
    updateSlide(activeSlide.id, {
      background: { ...activeSlide.background, ...patch },
    });
  };

  const addOverlayImageToSlide = useCallback(
    (slideId: string, dataUrl: string, rawName?: string) => {
      const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setProject(
        (prev) => ({
          ...prev,
          slides: prev.slides.map((s) => {
            if (s.id !== slideId) return s;
            const idx = s.overlays.length + 1;
            const cleanName = rawName
              ? rawName.replace(/\.[^.]+$/, '').slice(0, 22)
              : `Overlay ${idx}`;
            const newOv: OverlayLayer = {
              id,
              name: cleanName,
              imageUrl: dataUrl,
              x: Math.min(82, 50 + (idx - 1) * 6),
              y: Math.min(82, 48 + (idx - 1) * 5),
              scale: 0.9,
              rotation: 0,
              opacity: 1,
              cornerRadius: 0,
              shadow: 0.6,
              layerOrder: 'above',
              visible: true,
            };
            return { ...s, overlays: [...s.overlays, newOv] };
          }),
        }),
        { discrete: true }
      );
      setSelectedSlideId(slideId);
      setSelection({ type: 'overlay', id });
    },
    [setProject]
  );

  const duplicateOverlayOnSlide = useCallback(
    (slideId: string, srcOverlay: OverlayLayer, offset = 4) => {
      const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setProject(
        (prev) => ({
          ...prev,
          slides: prev.slides.map((s) => {
            if (s.id !== slideId) return s;
            const copy: OverlayLayer = {
              ...srcOverlay,
              id,
              name: `${srcOverlay.name} Copy`.slice(0, 24),
              x: Number(Math.min(110, srcOverlay.x + offset).toFixed(2)),
              y: Number(Math.min(110, srcOverlay.y + offset).toFixed(2)),
            };
            return { ...s, overlays: [...s.overlays, copy] };
          }),
        }),
        { discrete: true }
      );
      setSelectedSlideId(slideId);
      setSelection({ type: 'overlay', id });
    },
    [setProject]
  );

  const updateOverlayOnSlide = useCallback(
    (slideId: string, overlayId: string, patch: Partial<OverlayLayer>) => {
      setProject((prev) => ({
        ...prev,
        slides: prev.slides.map((s) => {
          if (s.id !== slideId) return s;
          return {
            ...s,
            overlays: s.overlays.map((o) =>
              o.id === overlayId ? { ...o, ...patch } : o
            ),
          };
        }),
      }));
    },
    [setProject]
  );

  const deleteOverlayFromSlide = useCallback(
    (slideId: string, overlayId: string) => {
      setProject(
        (prev) => ({
          ...prev,
          slides: prev.slides.map((s) =>
            s.id === slideId
              ? { ...s, overlays: s.overlays.filter((o) => o.id !== overlayId) }
              : s
          ),
        }),
        { discrete: true }
      );
      setSelection((sel) =>
        sel.type === 'overlay' && sel.id === overlayId ? { type: 'frame' } : sel
      );
    },
    [setProject]
  );

  const handlePresetChange = (nextId: StorePresetId) => {
    const nextPreset = STORE_PRESETS.find((p) => p.id === nextId);
    if (!nextPreset) return;
    const wasLandscape = isLandscape;
    const nowLandscape = nextPreset.isLandscape;

    setProject(
      (prev) => ({
        ...prev,
        presetId: nextId,
        useCustomSize: false,
        slides: prev.slides.map((s) => {
          if (!wasLandscape && nowLandscape && s.layout !== 'floating-card') {
            return { ...s, layout: 'banner-split', textAlign: 'left' };
          }
          if (wasLandscape && !nowLandscape && s.layout === 'banner-split') {
            return { ...s, layout: 'editorial-top', textAlign: 'center' };
          }
          return s;
        }),
      }),
      { discrete: true }
    );
  };

  const addFrame = useCallback(() => {
    const base = activeSlide || createDefaultSlides(isLandscape)[0];
    const nextNum = project.slides.length + 1;
    const newId = `frame-${Date.now()}`;
    const nextSlide: SlideConfig = {
      ...base,
      id: newId,
      name: `Frame ${nextNum}`,
      headline: 'Built for *speed*.',
      deviceModels: { ...base.deviceModels },
      deviceTransforms: {
        ios: { ...base.deviceTransforms.ios },
        android: { ...base.deviceTransforms.android },
        ipad: { ...base.deviceTransforms.ipad },
        banner: { ...base.deviceTransforms.banner },
      },
      overlays: base.overlays.map((o) => ({
        ...o,
        id: `ov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      })),
      background: { ...base.background },
    };
    setProject(
      (prev) => ({ ...prev, slides: [...prev.slides, nextSlide] }),
      { discrete: true }
    );
    setSelectedSlideId(newId);
  }, [activeSlide, isLandscape, project.slides.length, setProject]);

  const duplicateFrame = useCallback(
    (targetId?: string) => {
      const id = targetId || activeSlide?.id;
      const idx = project.slides.findIndex((s) => s.id === id);
      if (idx === -1) return;
      const src = project.slides[idx];
      const newId = `frame-${Date.now()}`;
      const copy: SlideConfig = {
        ...src,
        id: newId,
        name: `${src.name} Copy`,
        deviceModels: { ...src.deviceModels },
        deviceTransforms: {
          ios: { ...src.deviceTransforms.ios },
          android: { ...src.deviceTransforms.android },
          ipad: { ...src.deviceTransforms.ipad },
          banner: { ...src.deviceTransforms.banner },
        },
        overlays: src.overlays.map((o) => ({
          ...o,
          id: `ov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        })),
        background: { ...src.background },
      };
      setProject(
        (prev) => {
          const next = [...prev.slides];
          next.splice(idx + 1, 0, copy);
          return { ...prev, slides: next };
        },
        { discrete: true }
      );
      setSelectedSlideId(newId);
    },
    [activeSlide?.id, project.slides, setProject]
  );

  const deleteFrame = useCallback(
    (id: string) => {
      if (project.slides.length <= 1) return;
      const idx = project.slides.findIndex((s) => s.id === id);
      const remaining = project.slides.filter((s) => s.id !== id);
      setProject((prev) => ({ ...prev, slides: remaining }), {
        discrete: true,
      });
      if (selectedSlideId === id) {
        setSelectedSlideId(
          (remaining[Math.max(0, idx - 1)] || remaining[0]).id
        );
      }
    },
    [project.slides, selectedSlideId, setProject]
  );

  const moveFrame = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= project.slides.length) return;
    setProject(
      (prev) => {
        const next = [...prev.slides];
        const [item] = next.splice(idx, 1);
        next.splice(nextIdx, 0, item);
        return { ...prev, slides: next };
      },
      { discrete: true }
    );
  };

  const syncStyleAcrossFrames = () => {
    if (!activeSlide) return;
    setProject(
      (prev) => ({
        ...prev,
        slides: prev.slides.map((s) => ({
          ...s,
          fontFamily: activeSlide.fontFamily,
          textColor: activeSlide.textColor,
          accentColor: activeSlide.accentColor,
          deviceFinish: activeSlide.deviceFinish,
          glare: activeSlide.glare,
          shadowIntensity: activeSlide.shadowIntensity,
          background: { ...activeSlide.background },
        })),
      }),
      { discrete: true }
    );
    showToast('Synced style across frames');
  };

  const sanitizeSlug = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'app';

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const morphLabelTransition = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    update: () => void
  ) => {
    setter(true);
    window.setTimeout(() => {
      update();
      setter(false);
    }, 100);
  };

  const handleExportCurrent = useCallback(async () => {
    if (!activeSlide || singleExportState === 'rendering') return;
    morphLabelTransition(setSingleMorphing, () =>
      setSingleExportState('rendering')
    );
    try {
      const prevSlide =
        selectedIndex > 0 ? project.slides[selectedIndex - 1] : null;
      const blob = await exportSlideBlob(activeSlide, {
        width: targetWidth,
        height: targetHeight,
        platformSlot,
        isPlayFeatureGraphic:
          !project.useCustomSize && project.presetId === 'play-feature',
        previousSlide: prevSlide,
      });
      const slug = sanitizeSlug(project.projectName);
      const num = String(selectedIndex + 1).padStart(2, '0');
      const fname = `${num}-${slug}-${targetWidth}x${targetHeight}.png`;
      triggerDownload(blob, fname);

      morphLabelTransition(setSingleMorphing, () =>
        setSingleExportState('done')
      );
      showToast(`Saved ${fname}`);
      window.setTimeout(() => {
        morphLabelTransition(setSingleMorphing, () =>
          setSingleExportState('idle')
        );
      }, 1600);
    } catch {
      setSingleExportState('idle');
    }
  }, [
    activeSlide,
    platformSlot,
    project.presetId,
    project.projectName,
    project.slides,
    project.useCustomSize,
    selectedIndex,
    singleExportState,
    showToast,
    targetHeight,
    targetWidth,
  ]);

  const handleExportCurrentSetZip = async () => {
    const slug = sanitizeSlug(project.projectName);
    const entries = [];
    for (let i = 0; i < project.slides.length; i++) {
      const s = project.slides[i];
      const prev = i > 0 ? project.slides[i - 1] : null;
      const blob = await exportSlideBlob(s, {
        width: targetWidth,
        height: targetHeight,
        platformSlot,
        isPlayFeatureGraphic:
          !project.useCustomSize && project.presetId === 'play-feature',
        previousSlide: prev,
      });
      const num = String(i + 1).padStart(2, '0');
      entries.push({
        filename: `${num}-${slug}-${targetWidth}x${targetHeight}.png`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    const zipBlob = createZipBlob(entries);
    const zipName = `${slug}-${activePreset.id}-${targetWidth}x${targetHeight}.zip`;
    triggerDownload(zipBlob, zipName);
    showToast(`Exported ${entries.length} frames`);
  };

  const handleExportBothStores = async () => {
    if (bundleState === 'rendering') return;
    morphLabelTransition(setBundleMorphing, () => {
      setBundleState('rendering');
      setBundleProgress('Exporting…');
    });
    try {
      const { blob, filename, assetCount } = await generateMultiStoreBundleZip(
        project.projectName,
        project.slides,
        bundleOptions,
        (done, total) => setBundleProgress(`${done}/${total}`)
      );
      triggerDownload(blob, filename);
      setBundleModalOpen(false);
      morphLabelTransition(setBundleMorphing, () => {
        setBundleState('done');
        setBundleProgress(null);
      });
      showToast(`Exported ${assetCount} store PNGs`);
      window.setTimeout(() => {
        morphLabelTransition(setBundleMorphing, () => setBundleState('idle'));
      }, 1800);
    } catch {
      setBundleState('idle');
      setBundleProgress(null);
    }
  };

  const baseStageHeight = isLandscape
    ? viewMode === 'deck'
      ? 320
      : 440
    : viewMode === 'deck'
    ? 490
    : 580;

  const applyAnchoredZoom = useCallback(
    (nextZoomRaw: number, anchorClientX?: number, anchorClientY?: number) => {
      const clamped = Number(
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoomRaw)).toFixed(3)
      );
      if (clamped === zoomRef.current) return;

      const scrollEl = canvasScrollRef.current;
      const planeEl = canvasZoomPlaneRef.current;
      if (scrollEl && planeEl) {
        const scrollRect = scrollEl.getBoundingClientRect();
        const cx =
          anchorClientX !== undefined
            ? anchorClientX
            : scrollRect.left + scrollRect.width / 2;
        const cy =
          anchorClientY !== undefined
            ? anchorClientY
            : scrollRect.top + scrollRect.height / 2;
        const planeRect = planeEl.getBoundingClientRect();
        zoomAnchorRef.current = {
          clientX: cx,
          clientY: cy,
          relX: (cx - planeRect.left) / Math.max(1, planeRect.width),
          relY: (cy - planeRect.top) / Math.max(1, planeRect.height),
        };
      }
      zoomRef.current = clamped;
      setZoom(clamped);
    },
    []
  );

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const scrollEl = canvasScrollRef.current;
    const planeEl = canvasZoomPlaneRef.current;
    if (!anchor || !scrollEl || !planeEl) return;
    zoomAnchorRef.current = null;

    const newRect = planeEl.getBoundingClientRect();
    const pointClientX = newRect.left + anchor.relX * newRect.width;
    const pointClientY = newRect.top + anchor.relY * newRect.height;
    scrollEl.scrollLeft += pointClientX - anchor.clientX;
    scrollEl.scrollTop += pointClientY - anchor.clientY;
  }, [zoom]);

  const handleZoomToFit = useCallback(() => {
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) {
      applyAnchoredZoom(1);
      return;
    }
    const rect = scrollEl.getBoundingClientRect();
    const availW = Math.max(180, rect.width - 104);
    const availH = Math.max(180, rect.height - 96);
    const baseW = (targetWidth / targetHeight) * baseStageHeight;

    let fitZoom = availH / baseStageHeight;
    if (viewMode === 'deck') {
      const count = project.slides.length;
      const gapTotal = seamlessJoin ? 0 : Math.max(0, count - 1) * 28;
      const deckZoomW = (availW - gapTotal) / Math.max(1, count * baseW);
      fitZoom = Math.min(fitZoom, Math.max(0.42, deckZoomW));
    } else {
      fitZoom = Math.min(fitZoom, availW / Math.max(1, baseW));
    }

    zoomAnchorRef.current = null;
    const clamped = Number(
      Math.max(MIN_ZOOM, Math.min(2.0, fitZoom)).toFixed(2)
    );
    zoomRef.current = clamped;
    setZoom(clamped);
    requestAnimationFrame(() => {
      if (canvasScrollRef.current) {
        canvasScrollRef.current.scrollLeft = 0;
        canvasScrollRef.current.scrollTop = 0;
      }
    });
  }, [
    applyAnchoredZoom,
    baseStageHeight,
    project.slides.length,
    seamlessJoin,
    targetHeight,
    targetWidth,
    viewMode,
  ]);

  const selectFrameAndReveal = useCallback((slideId: string) => {
    setSelectedSlideId(slideId);
    requestAnimationFrame(() => {
      const el = canvasScrollRef.current?.querySelector<HTMLElement>(
        `[data-frame-id="${slideId}"]`
      );
      el?.scrollIntoView({
        behavior: 'instant' as ScrollBehavior,
        block: 'nearest',
        inline: 'nearest',
      });
    });
  }, []);

  // Cursor-anchored mouse wheel zoom & trackpad pinch-to-zoom ({ passive: false })
  useEffect(() => {
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return;

    const onCanvasWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const normDelta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
        const factor = Math.exp(-normDelta * 0.0085);
        applyAnchoredZoom(zoomRef.current * factor, e.clientX, e.clientY);
        return;
      }

      if (e.shiftKey) {
        e.preventDefault();
        const delta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        scrollEl.scrollLeft += e.deltaMode === 1 ? delta * 28 : delta;
        return;
      }

      // Allow natural horizontal trackpad two-finger swipe across frames
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.15) {
        return;
      }

      if (e.deltaY !== 0) {
        e.preventDefault();
        const normDelta = e.deltaMode === 1 ? e.deltaY * 28 : e.deltaY;
        const factor = Math.exp(-normDelta * 0.0018);
        applyAnchoredZoom(zoomRef.current * factor, e.clientX, e.clientY);
      }
    };

    const preventBrowserPinchOutsideCanvas = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    scrollEl.addEventListener('wheel', onCanvasWheel, { passive: false });
    window.addEventListener('wheel', preventBrowserPinchOutsideCanvas, {
      passive: false,
    });
    return () => {
      scrollEl.removeEventListener('wheel', onCanvasWheel);
      window.removeEventListener('wheel', preventBrowserPinchOutsideCanvas);
    };
  }, [applyAnchoredZoom]);

  // Clipboard copy/paste & Figma keyboard shortcuts (0ms instant response)
  useEffect(() => {
    const isInputElement = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        node.isContentEditable
      );
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isInputElement(e.target) || !activeSlide) return;
      if (selection.type === 'overlay') {
        const ov = activeSlide.overlays.find((o) => o.id === selection.id);
        if (ov) {
          copiedOverlayRef.current = { ...ov };
          showToast(`Copied ${ov.name}`);
        }
      }
    };

    const onPaste = async (e: ClipboardEvent) => {
      if (isInputElement(e.target) || !activeSlide) return;
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              const dataUrl = await readFileAsDataUrl(file);
              if (selection.type === 'overlay') {
                updateOverlayOnSlide(activeSlide.id, selection.id, {
                  imageUrl: dataUrl,
                });
                showToast('Replaced overlay image');
              } else {
                updateSlide(activeSlide.id, { screenshotUrl: dataUrl });
                showToast('Pasted screenshot');
              }
              return;
            }
          }
        }
      }

      if (copiedOverlayRef.current) {
        e.preventDefault();
        const src = copiedOverlayRef.current;
        const collides = activeSlide.overlays.some(
          (o) => Math.abs(o.x - src.x) < 0.5 && Math.abs(o.y - src.y) < 0.5
        );
        duplicateOverlayOnSlide(activeSlide.id, src, collides ? 4 : 0);
        showToast(`Pasted ${src.name}`);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const anyModalOpen =
        storePreviewOpen || bundleModalOpen || shortcutsModalOpen;
      if (anyModalOpen) {
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
          e.preventDefault();
          setShortcutsModalOpen((v) => !v);
        }
        return;
      }

      const targetNode = e.target as HTMLElement | null;
      const isEditingInput = isInputElement(e.target);
      const role = targetNode?.getAttribute('role');
      const isSeparatorFocused = role === 'separator';
      const isButtonFocused =
        targetNode?.tagName === 'BUTTON' || role === 'button';

      // Toggle Sidebars: Cmd+\ / Ctrl+\
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setUiLayout((prev) => ({
          ...prev,
          sidebarsHidden: !prev.sidebarsHidden,
        }));
        return;
      }

      // Toggle Shortcuts Modal: Cmd+/ or Ctrl+/
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsModalOpen((v) => !v);
        return;
      }

      // Export PNG (Cmd+E) / Multi-Store Bundle Modal (Cmd+Shift+E)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (e.shiftKey) {
          setBundleModalOpen(true);
        } else {
          handleExportCurrent();
        }
        return;
      }

      if (!isEditingInput) {
        // Undo / Redo
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          return;
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }

        // Duplicate Overlay or Active Frame (Cmd+D)
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          if (activeSlide && selection.type === 'overlay') {
            const ov = activeSlide.overlays.find((o) => o.id === selection.id);
            if (ov) {
              duplicateOverlayOnSlide(activeSlide.id, ov, 4);
              return;
            }
          }
          duplicateFrame();
          return;
        }

        // Cmd+0 / Cmd+= / Cmd+- Zoom
        if ((e.metaKey || e.ctrlKey) && (e.key === '0' || e.code === 'Digit0')) {
          e.preventDefault();
          applyAnchoredZoom(1);
          return;
        }
        if (
          (e.metaKey || e.ctrlKey) &&
          (e.key === '=' || e.key === '+')
        ) {
          e.preventDefault();
          applyAnchoredZoom(zoomRef.current * 1.2);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === '-') {
          e.preventDefault();
          applyAnchoredZoom(zoomRef.current / 1.2);
          return;
        }
      }

      if (isEditingInput || isSeparatorFocused || !activeSlide) {
        return;
      }

      // Spacebar Hold for Canvas Hand Pan (skip if a button has keyboard focus)
      if (e.code === 'Space' && !isButtonFocused) {
        e.preventDefault();
        if (!e.repeat) {
          setIsSpaceHeld(true);
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen(true);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        applyAnchoredZoom(zoomRef.current * 1.2);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        applyAnchoredZoom(zoomRef.current / 1.2);
        return;
      }

      if (e.shiftKey && (e.code === 'Digit0' || e.key === ')')) {
        e.preventDefault();
        applyAnchoredZoom(1);
        return;
      }

      if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) {
        e.preventDefault();
        handleZoomToFit();
        return;
      }

      if (e.key === 'Escape') {
        setSelection({ type: 'frame' });
        return;
      }

      // Direct Text Edit on Canvas (T)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setSelection({ type: 'text' });
        setInlineEditTick((n) => n + 1);
        return;
      }

      // Enter edits selected canvas item when not activating a focused button
      if (e.key === 'Enter' && !isButtonFocused) {
        if (selection.type === 'text') {
          e.preventDefault();
          setInlineEditTick((n) => n + 1);
          return;
        }
        if (selection.type === 'device') {
          e.preventDefault();
          screenshotInputRef.current?.click();
          return;
        }
        if (selection.type === 'overlay') {
          e.preventDefault();
          replaceOverlayTargetIdRef.current = selection.id;
          replaceOverlayInputRef.current?.click();
          return;
        }
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setSelection({ type: 'device' });
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSelection({ type: 'frame' });
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addFrame();
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setStorePreviewOpen(true);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setShowSafeZones((v) => !v);
        return;
      }

      // [ and ]: Stack order when overlay is selected, otherwise switch frame
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        if (selection.type === 'overlay') {
          const nextOrder = e.key === ']' ? 'above' : 'behind';
          updateOverlayOnSlide(activeSlide.id, selection.id, {
            layerOrder: nextOrder,
          });
          showToast(
            nextOrder === 'above'
              ? 'Overlay in front of device'
              : 'Overlay behind device'
          );
          return;
        }
        const nextIdx =
          e.key === '['
            ? Math.max(0, selectedIndex - 1)
            : Math.min(project.slides.length - 1, selectedIndex + 1);
        selectFrameAndReveal(project.slides[nextIdx].id);
        return;
      }

      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const nextIdx =
          e.key === 'PageUp'
            ? Math.max(0, selectedIndex - 1)
            : Math.min(project.slides.length - 1, selectedIndex + 1);
        selectFrameAndReveal(project.slides[nextIdx].id);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < project.slides.length) {
          e.preventDefault();
          selectFrameAndReveal(project.slides[idx].id);
        }
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selection.type === 'overlay') {
          e.preventDefault();
          deleteOverlayFromSlide(activeSlide.id, selection.id);
          return;
        }
        if (e.shiftKey && project.slides.length > 1) {
          e.preventDefault();
          deleteFrame(activeSlide.id);
          showToast('Deleted frame');
          return;
        }
        if (selection.type === 'device' && activeSlide.screenshotUrl) {
          e.preventDefault();
          updateSlide(activeSlide.id, { screenshotUrl: null });
          showToast('Cleared screenshot');
          return;
        }
      }

      // Arrow-key nudging of selected canvas element (0.5%, Shift = 2.5%), or switch frame if frame selected
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        const step = e.shiftKey ? 2.5 : 0.5;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        if (selection.type === 'device') {
          e.preventDefault();
          const cur =
            activeSlide.deviceTransforms[platformSlot] ||
            createDefaultTransforms().ios;
          updatePlatformDeviceTransform(activeSlide.id, platformSlot, {
            offsetX: Number(
              Math.max(-80, Math.min(80, cur.offsetX + dx)).toFixed(2)
            ),
            offsetY: Number(
              Math.max(-80, Math.min(80, cur.offsetY + dy)).toFixed(2)
            ),
          });
        } else if (selection.type === 'overlay') {
          e.preventDefault();
          const ov = activeSlide.overlays.find((o) => o.id === selection.id);
          if (ov) {
            updateOverlayOnSlide(activeSlide.id, ov.id, {
              x: Number(Math.max(-20, Math.min(120, ov.x + dx)).toFixed(2)),
              y: Number(Math.max(-20, Math.min(120, ov.y + dy)).toFixed(2)),
            });
          }
        } else if (selection.type === 'text') {
          e.preventDefault();
          updateSlide(activeSlide.id, {
            textOffsetX: Number(
              Math.max(-45, Math.min(45, activeSlide.textOffsetX + dx)).toFixed(2)
            ),
            textOffsetY: Number(
              Math.max(-45, Math.min(45, activeSlide.textOffsetY + dy)).toFixed(2)
            ),
          });
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const nextIdx =
            e.key === 'ArrowLeft'
              ? Math.max(0, selectedIndex - 1)
              : Math.min(project.slides.length - 1, selectedIndex + 1);
          selectFrameAndReveal(project.slides[nextIdx].id);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
      }
    };

    const onWindowBlur = () => {
      setIsSpaceHeld(false);
    };

    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    activeSlide,
    addFrame,
    applyAnchoredZoom,
    bundleModalOpen,
    deleteFrame,
    deleteOverlayFromSlide,
    duplicateFrame,
    duplicateOverlayOnSlide,
    handleExportCurrent,
    handleRedo,
    handleUndo,
    handleZoomToFit,
    platformSlot,
    project.slides,
    selectFrameAndReveal,
    selectedIndex,
    selection,
    shortcutsModalOpen,
    showToast,
    storePreviewOpen,
    updateOverlayOnSlide,
    updatePlatformDeviceTransform,
    updateSlide,
  ]);
  const displayH = Math.round(baseStageHeight * zoom);
  const displayW = Math.round((targetWidth / targetHeight) * displayH);
  const previewRenderScale = Math.min(1, (displayH * 2) / targetHeight);

  const usesSecondaryScreen =
    activeSlide?.layout === 'dual-showcase' ||
    activeSlide?.layout === 'banner-split' ||
    activeSlide?.layout === 'panoramic-left';

  return (
    <div className="figma-shell">
      {/* Hidden File Inputs */}
      <input
        ref={screenshotInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f && activeSlide) {
            const url = await readFileAsDataUrl(f);
            updateSlide(activeSlide.id, { screenshotUrl: url });
          }
          e.target.value = '';
        }}
      />
      <input
        ref={secondaryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f && activeSlide) {
            const url = await readFileAsDataUrl(f);
            updateSlide(activeSlide.id, { secondaryScreenshotUrl: url });
          }
          e.target.value = '';
        }}
      />
      <input
        ref={addOverlayInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (activeSlide && files.length > 0) {
            for (const f of files) {
              const url = await readFileAsDataUrl(f);
              addOverlayImageToSlide(activeSlide.id, url, f.name);
            }
          }
          e.target.value = '';
        }}
      />
      <input
        ref={replaceOverlayInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          const ovId = replaceOverlayTargetIdRef.current;
          if (f && activeSlide && ovId) {
            const url = await readFileAsDataUrl(f);
            updateOverlayOnSlide(activeSlide.id, ovId, { imageUrl: url });
          }
          e.target.value = '';
        }}
      />

      {/* Top 40px Figma Bar */}
      <header className="figma-topbar">
        <div className="topbar-left">
          <div className="figma-logo-badge" aria-hidden="true">
            <Square size={12} fill="currentColor" />
          </div>
          <input
            type="text"
            className="file-title-input"
            aria-label="Project title"
            value={project.projectName}
            onChange={(e) =>
              setProject((p) => ({ ...p, projectName: e.target.value }))
            }
          />

          <ToolbarTooltip label="Toggle Sidebars" shortcut="⌘\">
            <button
              type="button"
              aria-label="Toggle sidebars"
              className={`f-icon-btn ${!uiLayout.sidebarsHidden ? 'is-on' : ''}`}
              onClick={() =>
                setUiLayout((prev) => ({
                  ...prev,
                  sidebarsHidden: !prev.sidebarsHidden,
                }))
              }
            >
              <PanelLeft size={13} />
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip label="Undo" shortcut="⌘Z">
            <button
              type="button"
              aria-label="Undo"
              className="f-icon-btn"
              disabled={historyCounts.undo === 0}
              onClick={handleUndo}
            >
              <Undo2 size={13} />
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip label="Redo" shortcut="⌘⇧Z">
            <button
              type="button"
              aria-label="Redo"
              className="f-icon-btn"
              disabled={historyCounts.redo === 0}
              onClick={handleRedo}
            >
              <Redo2 size={13} />
            </button>
          </ToolbarTooltip>

          <div className="topbar-divider" />

          <ToolbarTooltip label="Upload Screenshot">
            <button
              type="button"
              className="f-btn f-btn-ghost"
              onClick={() => screenshotInputRef.current?.click()}
            >
              <Upload size={13} />
              <span>Screenshot</span>
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip label="Add Overlay Image">
            <button
              type="button"
              className="f-btn f-btn-ghost"
              onClick={() => addOverlayInputRef.current?.click()}
            >
              <ImagePlus size={13} />
              <span>Overlay</span>
            </button>
          </ToolbarTooltip>
        </div>

        <div className="topbar-center">
          <div className="platform-select-pill">
            <select
              aria-label="Target platform and canvas size"
              className="platform-select"
              value={project.useCustomSize ? 'custom' : project.presetId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setProject((p) => ({ ...p, useCustomSize: true }));
                } else {
                  handlePresetChange(val as StorePresetId);
                }
              }}
            >
              <optgroup label="App Store">
                {STORE_PRESETS.filter((p) => p.store === 'App Store').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Play">
                {STORE_PRESETS.filter((p) => p.store === 'Google Play').map(
                  (p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label="Web & Launch">
                {STORE_PRESETS.filter((p) => p.store === 'Web').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Custom">
                <option value="custom">Custom Size</option>
              </optgroup>
            </select>
            <span className="platform-dim-tag tabular">
              {targetWidth}×{targetHeight}
            </span>
          </div>

          <div className="topbar-divider" />

          <ToolbarTooltip label="Deck / Single View">
            <button
              type="button"
              aria-label="Toggle deck or single view"
              className={`f-icon-btn ${viewMode === 'single' ? 'is-on' : ''}`}
              onClick={() =>
                setViewMode((m) => (m === 'deck' ? 'single' : 'deck'))
              }
            >
              {viewMode === 'deck' ? (
                <Maximize2 size={13} />
              ) : (
                <Layers size={13} />
              )}
            </button>
          </ToolbarTooltip>

          {viewMode === 'deck' && project.slides.length > 1 ? (
            <button
              type="button"
              className={`f-btn ${seamlessJoin ? 'f-btn-active' : 'f-btn-ghost'}`}
              onClick={() => setSeamlessJoin((v) => !v)}
            >
              0px Seam
            </button>
          ) : null}

          <ToolbarTooltip label="Safe Guides" shortcut="G">
            <button
              type="button"
              aria-label="Toggle safe guides"
              className={`f-icon-btn ${showSafeZones ? 'is-on' : ''}`}
              onClick={() => setShowSafeZones((v) => !v)}
            >
              <Grid size={13} />
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip label="Canvas Theme">
            <button
              type="button"
              aria-label="Toggle canvas theme"
              className="f-icon-btn"
              onClick={() =>
                setStageSurface((s) => (s === 'dark' ? 'light' : 'dark'))
              }
            >
              {stageSurface === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </ToolbarTooltip>

          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <ToolbarTooltip label="Zoom Out" shortcut="-">
              <button
                type="button"
                aria-label="Zoom out"
                className="f-icon-btn"
                onClick={() => applyAnchoredZoom(zoomRef.current / 1.2)}
              >
                <Minus size={12} />
              </button>
            </ToolbarTooltip>
            <ToolbarTooltip label="Reset 100% · Double-click Fit" shortcut="⌘0">
              <button
                type="button"
                className="f-btn f-btn-ghost tabular"
                style={{ padding: '0 5px', minWidth: 44 }}
                onClick={() => applyAnchoredZoom(1)}
                onDoubleClick={handleZoomToFit}
              >
                {Math.round(zoom * 100)}%
              </button>
            </ToolbarTooltip>
            <ToolbarTooltip label="Zoom In" shortcut="+">
              <button
                type="button"
                aria-label="Zoom in"
                className="f-icon-btn"
                onClick={() => applyAnchoredZoom(zoomRef.current * 1.2)}
              >
                <Plus size={12} />
              </button>
            </ToolbarTooltip>
          </div>
        </div>

        <div className="topbar-right">
          <ToolbarTooltip label="Keyboard Shortcuts" shortcut="?">
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              className="f-icon-btn"
              onClick={() => setShortcutsModalOpen(true)}
            >
              <HelpCircle size={14} />
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip label="Store Listing Preview" shortcut="P">
            <button
              type="button"
              className="f-btn f-btn-ghost"
              onClick={() => setStorePreviewOpen(true)}
            >
              <Eye size={13} />
              <span>Preview</span>
            </button>
          </ToolbarTooltip>

          <button
            type="button"
            className="f-btn"
            onClick={handleExportCurrent}
            disabled={singleExportState === 'rendering'}
          >
            <span
              className={`btn-label-morph ${
                singleMorphing ? 'is-transitioning' : ''
              }`}
            >
              {singleExportState === 'done' ? (
                <>
                  <Check size={13} color="var(--success)" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span>PNG</span>
                </>
              )}
            </span>
          </button>

          <div className="split-btn-group">
            <button
              type="button"
              className="f-btn f-btn-primary split-main"
              onClick={handleExportBothStores}
              disabled={bundleState === 'rendering'}
            >
              <span
                className={`btn-label-morph ${
                  bundleMorphing ? 'is-transitioning' : ''
                }`}
              >
                {bundleState === 'done' ? (
                  <>
                    <Check size={13} />
                    <span>Done</span>
                  </>
                ) : (
                  <>
                    <FolderArchive size={13} />
                    <span className="tabular">
                      {bundleState === 'rendering'
                        ? bundleProgress || '…'
                        : 'Both Stores'}
                    </span>
                  </>
                )}
              </span>
            </button>
            <button
              type="button"
              className="f-btn f-btn-primary split-trigger"
              aria-label="Bundle export options"
              onClick={() => setBundleModalOpen(true)}
              disabled={bundleState === 'rendering'}
            >
              <ChevronDown size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Main 3-Pane Workspace */}
      <div
        className="figma-workspace"
        style={{
          gridTemplateColumns: uiLayout.sidebarsHidden
            ? '1fr'
            : `${uiLayout.leftSidebarWidth}px 1fr ${uiLayout.rightSidebarWidth}px`,
        }}
      >
        {/* Left Sidebar: Frames + Layers */}
        {!uiLayout.sidebarsHidden ? (
          <aside
            ref={leftSidebarRef}
            className="left-sidebar"
            aria-label="Frames and layers"
            style={{
              gridTemplateRows: `${(uiLayout.framesPaneRatio * 100).toFixed(
                1
              )}% 1fr`,
            }}
          >
            <div className="sidebar-pane">
              <div className="pane-header">
                <span>Frames</span>
                <ToolbarTooltip label="New Frame" shortcut="N">
                  <button
                    type="button"
                    className="f-icon-btn"
                    style={{ width: 22, height: 22 }}
                    aria-label="Add frame"
                    onClick={addFrame}
                  >
                    <Plus size={13} />
                  </button>
                </ToolbarTooltip>
              </div>

            <div className="pane-scroll">
              {project.slides.map((s, idx) => {
                const active = s.id === activeSlide?.id;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className={`frame-row ${active ? 'is-active' : ''}`}
                    onClick={() => setSelectedSlideId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSlideId(s.id);
                      }
                    }}
                  >
                    <div
                      className={`frame-mini-thumb ${
                        isLandscape ? 'is-landscape' : ''
                      }`}
                    >
                      <SlideCanvas
                        slide={s}
                        previousSlide={idx > 0 ? project.slides[idx - 1] : null}
                        targetWidth={targetWidth}
                        targetHeight={targetHeight}
                        platformSlot={platformSlot}
                        renderScale={isLandscape ? 0.08 : 0.05}
                      />
                    </div>

                    <span className="frame-row-title">
                      {String(idx + 1).padStart(2, '0')} ·{' '}
                      {s.headline.replace(/\*/g, '') || s.name}
                    </span>

                    <div
                      className="row-hover-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="tiny-btn"
                        aria-label="Move up"
                        disabled={idx === 0}
                        onClick={() => moveFrame(idx, -1)}
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        className="tiny-btn"
                        aria-label="Move down"
                        disabled={idx === project.slides.length - 1}
                        onClick={() => moveFrame(idx, 1)}
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        type="button"
                        className="tiny-btn"
                        aria-label="Duplicate frame"
                        onClick={() => duplicateFrame(s.id)}
                      >
                        <Copy size={11} />
                      </button>
                      {project.slides.length > 1 ? (
                        <button
                          type="button"
                          className="tiny-btn"
                          aria-label="Delete frame"
                          onClick={() => deleteFrame(s.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Internal Horizontal Sash between Frames and Layers */}
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-label="Resize frames and layers panes. Use Up and Down arrow keys to resize, or double-click to reset."
              aria-valuemin={20}
              aria-valuemax={80}
              aria-valuenow={Math.round(uiLayout.framesPaneRatio * 100)}
              className={`resize-sash resize-sash-horizontal ${
                draggingSash === 'frames' ? 'is-dragging' : ''
              }`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const sidebarH =
                  leftSidebarRef.current?.getBoundingClientRect().height || 600;
                sashSessionRef.current = {
                  startCoord: e.clientY,
                  startValue: uiLayout.framesPaneRatio,
                  containerHeight: Math.max(200, sidebarH),
                };
                setDraggingSash('frames');
              }}
              onPointerMove={(e) => {
                if (
                  !e.currentTarget.hasPointerCapture(e.pointerId) ||
                  !sashSessionRef.current
                ) {
                  return;
                }
                const dy = e.clientY - sashSessionRef.current.startCoord;
                const nextRatio = clampFramesRatio(
                  sashSessionRef.current.startValue +
                    dy / sashSessionRef.current.containerHeight
                );
                setUiLayout((prev) => ({
                  ...prev,
                  framesPaneRatio: nextRatio,
                }));
              }}
              onLostPointerCapture={() => {
                sashSessionRef.current = null;
                setDraggingSash(null);
              }}
              onDoubleClick={() => {
                setUiLayout((prev) => ({
                  ...prev,
                  framesPaneRatio: DEFAULT_FRAMES_RATIO,
                }));
                announceUi('Frames and layers split reset');
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.stopPropagation();
                  const delta = e.key === 'ArrowUp' ? -0.05 : 0.05;
                  setUiLayout((prev) => ({
                    ...prev,
                    framesPaneRatio: clampFramesRatio(
                      prev.framesPaneRatio + delta
                    ),
                  }));
                  announceUi('Frames pane resized');
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  e.stopPropagation();
                  setUiLayout((prev) => ({
                    ...prev,
                    framesPaneRatio: DEFAULT_FRAMES_RATIO,
                  }));
                  announceUi('Frames and layers split reset');
                }
              }}
            />
          </div>

          {/* Layers Tree of Active Frame */}
          <div className="sidebar-pane">
            <div className="pane-header">
              <span>Layers</span>
              <ToolbarTooltip label="Add Overlay Image">
                <button
                  type="button"
                  className="f-icon-btn"
                  style={{ width: 22, height: 22 }}
                  aria-label="Add overlay layer"
                  onClick={() => addOverlayInputRef.current?.click()}
                >
                  <ImagePlus size={13} />
                </button>
              </ToolbarTooltip>
            </div>

            {activeSlide ? (
              <div className="pane-scroll">
                {/* Above-device overlays (topmost first) */}
                {[...activeSlide.overlays]
                  .filter((o) => o.layerOrder === 'above')
                  .reverse()
                  .map((ov) => {
                    const isSel =
                      selection.type === 'overlay' && selection.id === ov.id;
                    return (
                      <div
                        key={ov.id}
                        role="button"
                        tabIndex={0}
                        className={`layer-row ${isSel ? 'is-selected' : ''}`}
                        onClick={() =>
                          setSelection({ type: 'overlay', id: ov.id })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelection({ type: 'overlay', id: ov.id });
                          }
                        }}
                      >
                        <ImagePlus size={12} />
                        <span className="layer-name">{ov.name}</span>
                        <div
                          className="row-hover-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="tiny-btn"
                            aria-label="Toggle visibility"
                            onClick={() =>
                              updateOverlayOnSlide(activeSlide.id, ov.id, {
                                visible: !ov.visible,
                              })
                            }
                          >
                            {ov.visible ? (
                              <Eye size={11} />
                            ) : (
                              <EyeOff size={11} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="tiny-btn"
                            aria-label="Delete overlay"
                            onClick={() =>
                              deleteOverlayFromSlide(activeSlide.id, ov.id)
                            }
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {/* Text Layer */}
                <div
                  role="button"
                  tabIndex={0}
                  className={`layer-row ${
                    selection.type === 'text' ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelection({ type: 'text' })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelection({ type: 'text' });
                    }
                  }}
                >
                  <Type size={12} />
                  <span className="layer-name">
                    {activeSlide.headline.replace(/\*/g, '') || 'Text'}
                  </span>
                </div>

                {/* Device Layer (Platform-Independent!) */}
                <div
                  role="button"
                  tabIndex={0}
                  className={`layer-row ${
                    selection.type === 'device' ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelection({ type: 'device' })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelection({ type: 'device' });
                    }
                  }}
                >
                  <Smartphone size={12} />
                  <span className="layer-name">
                    Device ({SLOT_LABELS[platformSlot]})
                  </span>
                </div>

                {/* Behind-device overlays */}
                {[...activeSlide.overlays]
                  .filter((o) => o.layerOrder === 'behind')
                  .reverse()
                  .map((ov) => {
                    const isSel =
                      selection.type === 'overlay' && selection.id === ov.id;
                    return (
                      <div
                        key={ov.id}
                        role="button"
                        tabIndex={0}
                        className={`layer-row ${isSel ? 'is-selected' : ''}`}
                        onClick={() =>
                          setSelection({ type: 'overlay', id: ov.id })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelection({ type: 'overlay', id: ov.id });
                          }
                        }}
                      >
                        <ImagePlus size={12} />
                        <span className="layer-name">{ov.name}</span>
                        <div
                          className="row-hover-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="tiny-btn"
                            aria-label="Toggle visibility"
                            onClick={() =>
                              updateOverlayOnSlide(activeSlide.id, ov.id, {
                                visible: !ov.visible,
                              })
                            }
                          >
                            {ov.visible ? (
                              <Eye size={11} />
                            ) : (
                              <EyeOff size={11} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="tiny-btn"
                            aria-label="Delete overlay"
                            onClick={() =>
                              deleteOverlayFromSlide(activeSlide.id, ov.id)
                            }
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {/* Background Layer */}
                <div
                  role="button"
                  tabIndex={0}
                  className={`layer-row ${
                    selection.type === 'frame' ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelection({ type: 'frame' })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelection({ type: 'frame' });
                    }
                  }}
                >
                  <Square size={12} />
                  <span className="layer-name">Background</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Left Sidebar Vertical Resize Sash */}
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize left sidebar. Use Left and Right arrow keys to resize, or double-click to reset."
            aria-valuemin={MIN_LEFT_W}
            aria-valuemax={MAX_LEFT_W}
            aria-valuenow={uiLayout.leftSidebarWidth}
            className={`resize-sash resize-sash-left ${
              draggingSash === 'left' ? 'is-dragging' : ''
            }`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              sashSessionRef.current = {
                startCoord: e.clientX,
                startValue: uiLayout.leftSidebarWidth,
                containerHeight: 0,
              };
              setDraggingSash('left');
            }}
            onPointerMove={(e) => {
              if (
                !e.currentTarget.hasPointerCapture(e.pointerId) ||
                !sashSessionRef.current
              ) {
                return;
              }
              const dx = e.clientX - sashSessionRef.current.startCoord;
              setUiLayout((prev) => ({
                ...prev,
                leftSidebarWidth: clampLeftSidebar(
                  sashSessionRef.current!.startValue + dx,
                  prev.rightSidebarWidth,
                  window.innerWidth
                ),
              }));
            }}
            onLostPointerCapture={() => {
              sashSessionRef.current = null;
              setDraggingSash(null);
            }}
            onDoubleClick={() => {
              setUiLayout((prev) => ({
                ...prev,
                leftSidebarWidth: clampLeftSidebar(
                  DEFAULT_LEFT_W,
                  prev.rightSidebarWidth,
                  window.innerWidth
                ),
              }));
              announceUi('Left sidebar width reset');
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                const step = (e.shiftKey ? 32 : 16) * (e.key === 'ArrowRight' ? 1 : -1);
                setUiLayout((prev) => ({
                  ...prev,
                  leftSidebarWidth: clampLeftSidebar(
                    prev.leftSidebarWidth + step,
                    prev.rightSidebarWidth,
                    window.innerWidth
                  ),
                }));
                announceUi('Left sidebar resized');
              } else if (e.key === 'Home') {
                e.preventDefault();
                e.stopPropagation();
                setUiLayout((prev) => ({
                  ...prev,
                  leftSidebarWidth: DEFAULT_LEFT_W,
                }));
                announceUi('Left sidebar width reset');
              }
            }}
          />
        </aside>
        ) : null}

        {/* Center Direct-Manipulation Canvas */}
        <main
          className="canvas-stage"
          data-surface={stageSurface}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && !isSpaceHeld) {
              setSelection({ type: 'frame' });
            }
          }}
        >
          <div
            ref={canvasScrollRef}
            className={`canvas-scroll ${
              isPanningCanvas
                ? 'is-panning'
                : isSpaceHeld
                ? 'is-pan-ready'
                : ''
            }`}
            onPointerDown={(e) => {
              if (e.button === 1 || (e.button === 0 && isSpaceHeld)) {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                panSessionRef.current = {
                  pointerId: e.pointerId,
                  startX: e.clientX,
                  startY: e.clientY,
                  scrollLeft: e.currentTarget.scrollLeft,
                  scrollTop: e.currentTarget.scrollTop,
                };
                setIsPanningCanvas(true);
                return;
              }
              if (
                e.target === e.currentTarget ||
                e.target === canvasZoomPlaneRef.current
              ) {
                setSelection({ type: 'frame' });
              }
            }}
            onPointerMove={(e) => {
              const session = panSessionRef.current;
              if (!session || !e.currentTarget.hasPointerCapture(e.pointerId)) {
                return;
              }
              e.currentTarget.scrollLeft =
                session.scrollLeft - (e.clientX - session.startX);
              e.currentTarget.scrollTop =
                session.scrollTop - (e.clientY - session.startY);
            }}
            onLostPointerCapture={() => {
              panSessionRef.current = null;
              setIsPanningCanvas(false);
            }}
          >
            <div ref={canvasZoomPlaneRef} className="canvas-zoom-plane">
              {viewMode === 'deck' ? (
                <div
                  className={`frames-deck ${seamlessJoin ? 'is-seamless' : ''}`}
                >
                  {project.slides.map((s, idx) => (
                    <InteractiveArtboard
                      key={s.id}
                      slide={s}
                      previousSlide={idx > 0 ? project.slides[idx - 1] : null}
                      frameLabel={`Frame ${String(idx + 1).padStart(2, '0')}`}
                      isSelectedSlide={s.id === activeSlide?.id}
                      selection={selection}
                      onSelectSlideAndItem={(sid, sel) => {
                        setSelectedSlideId(sid);
                        setSelection(sel);
                      }}
                      targetWidth={targetWidth}
                      targetHeight={targetHeight}
                      displayWidth={displayW}
                      displayHeight={displayH}
                      renderScale={previewRenderScale}
                      platformSlot={platformSlot}
                      showSafeZones={showSafeZones}
                      isPlayFeatureGraphic={
                        !project.useCustomSize &&
                        project.presetId === 'play-feature'
                      }
                      panModeActive={isSpaceHeld || isPanningCanvas}
                      inlineEditRequestTick={inlineEditTick}
                      onUpdateSlide={(patch) => updateSlide(s.id, patch)}
                      onUpdateDeviceTransform={(patch) =>
                        updatePlatformDeviceTransform(s.id, platformSlot, patch)
                      }
                      onUpdateOverlay={(ovId, patch) =>
                        updateOverlayOnSlide(s.id, ovId, patch)
                      }
                      onRequestScreenshotUpload={() => {
                        setSelectedSlideId(s.id);
                        screenshotInputRef.current?.click();
                      }}
                      onRequestOverlayReplace={(ovId) => {
                        setSelectedSlideId(s.id);
                        replaceOverlayTargetIdRef.current = ovId;
                        replaceOverlayInputRef.current?.click();
                      }}
                      onDropImageFile={async (file, asOverlay) => {
                        const url = await readFileAsDataUrl(file);
                        if (asOverlay) {
                          addOverlayImageToSlide(s.id, url, file.name);
                        } else {
                          updateSlide(s.id, { screenshotUrl: url });
                          setSelectedSlideId(s.id);
                          setSelection({ type: 'device' });
                        }
                      }}
                    />
                  ))}
                </div>
              ) : activeSlide ? (
                <InteractiveArtboard
                  slide={activeSlide}
                  previousSlide={
                    selectedIndex > 0 ? project.slides[selectedIndex - 1] : null
                  }
                  frameLabel={`Frame ${String(selectedIndex + 1).padStart(2, '0')}`}
                  isSelectedSlide={true}
                  selection={selection}
                  onSelectSlideAndItem={(sid, sel) => {
                    setSelectedSlideId(sid);
                    setSelection(sel);
                  }}
                  targetWidth={targetWidth}
                  targetHeight={targetHeight}
                  displayWidth={displayW}
                  displayHeight={displayH}
                  renderScale={previewRenderScale}
                  platformSlot={platformSlot}
                  showSafeZones={showSafeZones}
                  isPlayFeatureGraphic={
                    !project.useCustomSize &&
                    project.presetId === 'play-feature'
                  }
                  panModeActive={isSpaceHeld || isPanningCanvas}
                  inlineEditRequestTick={inlineEditTick}
                  onUpdateSlide={updateActiveSlide}
                  onUpdateDeviceTransform={(patch) =>
                    updatePlatformDeviceTransform(
                      activeSlide.id,
                      platformSlot,
                      patch
                    )
                  }
                  onUpdateOverlay={(ovId, patch) =>
                    updateOverlayOnSlide(activeSlide.id, ovId, patch)
                  }
                  onRequestScreenshotUpload={() =>
                    screenshotInputRef.current?.click()
                  }
                  onRequestOverlayReplace={(ovId) => {
                    replaceOverlayTargetIdRef.current = ovId;
                    replaceOverlayInputRef.current?.click();
                  }}
                  onDropImageFile={async (file, asOverlay) => {
                    const url = await readFileAsDataUrl(file);
                    if (asOverlay) {
                      addOverlayImageToSlide(activeSlide.id, url, file.name);
                    } else {
                      updateSlide(activeSlide.id, { screenshotUrl: url });
                      setSelection({ type: 'device' });
                    }
                  }}
                />
              ) : null}
            </div>
          </div>
        </main>

        {/* Right Figma Design Inspector */}
        {!uiLayout.sidebarsHidden ? (
          <aside className="right-inspector" aria-label="Design properties">
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize right inspector sidebar. Use Left and Right arrow keys to resize, or double-click to reset."
              aria-valuemin={MIN_RIGHT_W}
              aria-valuemax={MAX_RIGHT_W}
              aria-valuenow={uiLayout.rightSidebarWidth}
              className={`resize-sash resize-sash-right ${
                draggingSash === 'right' ? 'is-dragging' : ''
              }`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                sashSessionRef.current = {
                  startCoord: e.clientX,
                  startValue: uiLayout.rightSidebarWidth,
                  containerHeight: 0,
                };
                setDraggingSash('right');
              }}
              onPointerMove={(e) => {
                if (
                  !e.currentTarget.hasPointerCapture(e.pointerId) ||
                  !sashSessionRef.current
                ) {
                  return;
                }
                const dx = sashSessionRef.current.startCoord - e.clientX;
                setUiLayout((prev) => ({
                  ...prev,
                  rightSidebarWidth: clampRightSidebar(
                    sashSessionRef.current!.startValue + dx,
                    prev.leftSidebarWidth,
                    window.innerWidth
                  ),
                }));
              }}
              onLostPointerCapture={() => {
                sashSessionRef.current = null;
                setDraggingSash(null);
              }}
              onDoubleClick={() => {
                setUiLayout((prev) => ({
                  ...prev,
                  rightSidebarWidth: clampRightSidebar(
                    DEFAULT_RIGHT_W,
                    prev.leftSidebarWidth,
                    window.innerWidth
                  ),
                }));
                announceUi('Right sidebar width reset');
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  e.stopPropagation();
                  const step =
                    (e.shiftKey ? 32 : 16) * (e.key === 'ArrowLeft' ? 1 : -1);
                  setUiLayout((prev) => ({
                    ...prev,
                    rightSidebarWidth: clampRightSidebar(
                      prev.rightSidebarWidth + step,
                      prev.leftSidebarWidth,
                      window.innerWidth
                    ),
                  }));
                  announceUi('Right sidebar resized');
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  e.stopPropagation();
                  setUiLayout((prev) => ({
                    ...prev,
                    rightSidebarWidth: DEFAULT_RIGHT_W,
                  }));
                  announceUi('Right sidebar width reset');
                }
              }}
            />

            <div className="inspector-scroll">
              {activeSlide ? (
            <>
              {/* Contextual Selected Overlay Inspector (shown right on top when an overlay is selected!) */}
              {selectedOverlay ? (
                <section className="prop-section is-highlighted">
                  <div className="prop-header">
                    <span className="prop-title">
                      Overlay · {selectedOverlay.name}
                    </span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button
                        type="button"
                        className="f-btn f-btn-ghost"
                        style={{ height: 22, padding: '0 6px', fontSize: 10.5 }}
                        onClick={() => {
                          replaceOverlayTargetIdRef.current = selectedOverlay.id;
                          replaceOverlayInputRef.current?.click();
                        }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="tiny-btn"
                        aria-label="Delete overlay"
                        onClick={() =>
                          deleteOverlayFromSlide(
                            activeSlide.id,
                            selectedOverlay.id
                          )
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="prop-grid-2">
                    <ScrubInput
                      label="X"
                      ariaLabel="Overlay X position"
                      value={selectedOverlay.x}
                      min={-20}
                      max={120}
                      step={0.5}
                      suffix="%"
                      defaultValue={50}
                      decimals={1}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          x: v,
                        })
                      }
                    />
                    <ScrubInput
                      label="Y"
                      ariaLabel="Overlay Y position"
                      value={selectedOverlay.y}
                      min={-20}
                      max={120}
                      step={0.5}
                      suffix="%"
                      defaultValue={50}
                      decimals={1}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          y: v,
                        })
                      }
                    />
                    <ScrubInput
                      label="S"
                      ariaLabel="Overlay scale"
                      value={selectedOverlay.scale}
                      min={0.12}
                      max={3.5}
                      step={0.02}
                      displayMultiplier={100}
                      suffix="%"
                      defaultValue={1}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          scale: v,
                        })
                      }
                    />
                    <ScrubInput
                      label="∠"
                      ariaLabel="Overlay rotation"
                      value={selectedOverlay.rotation}
                      min={-180}
                      max={180}
                      step={1}
                      suffix="°"
                      defaultValue={0}
                      decimals={1}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          rotation: v,
                        })
                      }
                    />
                    <ScrubInput
                      label="R"
                      ariaLabel="Overlay corner radius"
                      value={selectedOverlay.cornerRadius}
                      min={0}
                      max={50}
                      step={1}
                      defaultValue={0}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          cornerRadius: v,
                        })
                      }
                    />
                    <ScrubInput
                      label="Op"
                      ariaLabel="Overlay opacity"
                      value={selectedOverlay.opacity}
                      min={0.1}
                      max={1}
                      step={0.02}
                      displayMultiplier={100}
                      suffix="%"
                      defaultValue={1}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          opacity: v,
                        })
                      }
                    />
                  </div>

                  <div className="prop-grid-2">
                    <ScrubInput
                      label="Sh"
                      ariaLabel="Overlay shadow"
                      value={selectedOverlay.shadow}
                      min={0}
                      max={1.5}
                      step={0.05}
                      displayMultiplier={100}
                      suffix="%"
                      defaultValue={0.6}
                      onChange={(v) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          shadow: v,
                        })
                      }
                    />
                    <select
                      aria-label="Overlay stack order"
                      className="f-select"
                      value={selectedOverlay.layerOrder}
                      onChange={(e) =>
                        updateOverlayOnSlide(activeSlide.id, selectedOverlay.id, {
                          layerOrder: e.target.value as 'above' | 'behind',
                        })
                      }
                    >
                      <option value="above">In Front of Device</option>
                      <option value="behind">Behind Device</option>
                    </select>
                  </div>
                </section>
              ) : null}

              {/* Frame & Layout */}
              <section className="prop-section">
                <div className="prop-header">
                  <span className="prop-title">Layout</span>
                  {project.useCustomSize ? (
                    <span className="slot-pill">Custom</span>
                  ) : null}
                </div>

                {project.useCustomSize ? (
                  <div className="prop-grid-2">
                    <ScrubInput
                      label="W"
                      ariaLabel="Custom width"
                      value={project.customWidth}
                      min={320}
                      max={4096}
                      step={10}
                      onChange={(v) =>
                        setProject((p) => ({ ...p, customWidth: Math.round(v) }))
                      }
                    />
                    <ScrubInput
                      label="H"
                      ariaLabel="Custom height"
                      value={project.customHeight}
                      min={320}
                      max={4096}
                      step={10}
                      onChange={(v) =>
                        setProject((p) => ({
                          ...p,
                          customHeight: Math.round(v),
                        }))
                      }
                    />
                  </div>
                ) : null}

                <div className="prop-grid-3">
                  {LAYOUT_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`layout-chip ${
                        activeSlide.layout === tpl.id ? 'is-selected' : ''
                      }`}
                      onClick={() => updateActiveSlide({ layout: tpl.id })}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </section>

              {/* Device (Platform-Independent Transform & Model!) */}
              <section
                className={`prop-section ${
                  selection.type === 'device' ? 'is-highlighted' : ''
                }`}
              >
                <div className="prop-header">
                  <span className="prop-title">
                    Device
                    <span
                      className="slot-pill"
                      title="Placement & scale saved independently for this platform"
                    >
                      {SLOT_LABELS[platformSlot]}
                    </span>
                  </span>
                  <ToolbarTooltip
                    label={`Reset ${SLOT_LABELS[platformSlot]} placement`}
                  >
                    <button
                      type="button"
                      className="tiny-btn"
                      aria-label="Reset platform device placement"
                      onClick={() =>
                        updatePlatformDeviceTransform(
                          activeSlide.id,
                          platformSlot,
                          { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }
                        )
                      }
                    >
                      <RotateCcw size={11} />
                    </button>
                  </ToolbarTooltip>
                </div>

                <div className="prop-grid-2">
                  <select
                    aria-label="Hardware model for platform"
                    className="f-select"
                    value={activeDeviceModel}
                    onChange={(e) =>
                      updateActiveDeviceModel(e.target.value as DeviceModel)
                    }
                  >
                    <option value="iphone-16-pro">iPhone 16 Pro</option>
                    <option value="pixel-9-pro">Pixel 9 Pro</option>
                    <option value="ipad-pro">iPad Pro 13"</option>
                    <option value="browser-card">Window</option>
                    <option value="frameless">Frameless</option>
                    <option value="none">Hidden</option>
                  </select>

                  <select
                    aria-label="Device finish"
                    className="f-select"
                    value={activeSlide.deviceFinish}
                    onChange={(e) =>
                      updateActiveSlide({
                        deviceFinish: e.target.value as DeviceFinish,
                      })
                    }
                  >
                    <option value="titanium-dark">Dark Titanium</option>
                    <option value="titanium-natural">Natural</option>
                    <option value="titanium-silver">Silver</option>
                    <option value="clay-dark">Clay Dark</option>
                    <option value="clay-light">Clay Light</option>
                  </select>
                </div>

                <div className="prop-grid-2">
                  <ScrubInput
                    label="X"
                    ariaLabel="Device X offset"
                    value={activeDeviceTransform.offsetX}
                    min={-80}
                    max={80}
                    step={0.5}
                    defaultValue={0}
                    decimals={1}
                    onChange={(v) =>
                      updatePlatformDeviceTransform(
                        activeSlide.id,
                        platformSlot,
                        { offsetX: v }
                      )
                    }
                  />
                  <ScrubInput
                    label="Y"
                    ariaLabel="Device Y offset"
                    value={activeDeviceTransform.offsetY}
                    min={-80}
                    max={80}
                    step={0.5}
                    defaultValue={0}
                    decimals={1}
                    onChange={(v) =>
                      updatePlatformDeviceTransform(
                        activeSlide.id,
                        platformSlot,
                        { offsetY: v }
                      )
                    }
                  />
                  <ScrubInput
                    label="S"
                    ariaLabel="Device scale"
                    value={activeDeviceTransform.scale}
                    min={0.35}
                    max={2.2}
                    step={0.02}
                    displayMultiplier={100}
                    suffix="%"
                    defaultValue={1}
                    onChange={(v) =>
                      updatePlatformDeviceTransform(
                        activeSlide.id,
                        platformSlot,
                        { scale: v }
                      )
                    }
                  />
                  <ScrubInput
                    label="∠"
                    ariaLabel="Device angle"
                    value={activeDeviceTransform.rotation}
                    min={-45}
                    max={45}
                    step={0.5}
                    suffix="°"
                    defaultValue={0}
                    decimals={1}
                    onChange={(v) =>
                      updatePlatformDeviceTransform(
                        activeSlide.id,
                        platformSlot,
                        { rotation: v }
                      )
                    }
                  />
                </div>

                {/* Screenshot Upload & Fit */}
                <div className="prop-grid-2">
                  <button
                    type="button"
                    className="f-btn"
                    onClick={() => screenshotInputRef.current?.click()}
                  >
                    <Upload size={12} />
                    <span>
                      {activeSlide.screenshotUrl ? 'Replace Img' : 'Upload Img'}
                    </span>
                  </button>

                  {activeSlide.screenshotUrl ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <select
                        aria-label="Screenshot fit"
                        className="f-select"
                        value={activeSlide.screenshotFit}
                        onChange={(e) =>
                          updateActiveSlide({
                            screenshotFit: e.target.value as 'cover' | 'contain',
                          })
                        }
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                      </select>
                      <button
                        type="button"
                        className="f-icon-btn"
                        aria-label="Clear screenshot"
                        onClick={() =>
                          updateActiveSlide({ screenshotUrl: null })
                        }
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  ) : (
                    <select
                      aria-label="Demo screen placeholder"
                      className="f-select"
                      value={activeSlide.sampleVariant}
                      onChange={(e) =>
                        updateActiveSlide({
                          sampleVariant: e.target.value as SampleScreenVariant,
                        })
                      }
                    >
                      <option value="analytics">Demo: Metrics</option>
                      <option value="tasks">Demo: Tasks</option>
                      <option value="fintech">Demo: Cards</option>
                      <option value="ai-notes">Demo: Notes</option>
                      <option value="fitness">Demo: Rings</option>
                    </select>
                  )}
                </div>

                {usesSecondaryScreen ? (
                  <div className="prop-grid-2">
                    <button
                      type="button"
                      className="f-btn"
                      onClick={() => secondaryInputRef.current?.click()}
                    >
                      <Upload size={12} />
                      <span>
                        {activeSlide.secondaryScreenshotUrl
                          ? 'Replace 2nd'
                          : '2nd Screen'}
                      </span>
                    </button>
                    {activeSlide.secondaryScreenshotUrl ? (
                      <button
                        type="button"
                        className="f-btn f-btn-ghost"
                        onClick={() =>
                          updateActiveSlide({ secondaryScreenshotUrl: null })
                        }
                      >
                        Reset 2nd
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <ScrubInput
                    label="Sh"
                    ariaLabel="Device shadow intensity"
                    value={activeSlide.shadowIntensity}
                    min={0}
                    max={1.5}
                    step={0.05}
                    displayMultiplier={100}
                    suffix="%"
                    defaultValue={1}
                    onChange={(v) => updateActiveSlide({ shadowIntensity: v })}
                  />
                  <label className="check-row" style={{ flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={activeSlide.glare}
                      onChange={(e) =>
                        updateActiveSlide({ glare: e.target.checked })
                      }
                    />
                    <span>Glare</span>
                  </label>
                </div>
              </section>

              {/* Text */}
              <section
                className={`prop-section ${
                  selection.type === 'text' ? 'is-highlighted' : ''
                }`}
              >
                <div className="prop-header">
                  <span className="prop-title">Text</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      aria-label="Align left"
                      className={`tiny-btn ${
                        activeSlide.textAlign === 'left' ? 'is-on' : ''
                      }`}
                      style={
                        activeSlide.textAlign === 'left'
                          ? { color: 'var(--figma-blue)' }
                          : undefined
                      }
                      onClick={() => updateActiveSlide({ textAlign: 'left' })}
                    >
                      <AlignLeft size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="Align center"
                      className="tiny-btn"
                      style={
                        activeSlide.textAlign === 'center'
                          ? { color: 'var(--figma-blue)' }
                          : undefined
                      }
                      onClick={() => updateActiveSlide({ textAlign: 'center' })}
                    >
                      <AlignCenter size={12} />
                    </button>
                    <ToolbarTooltip label="Reset text offset">
                      <button
                        type="button"
                        className="tiny-btn"
                        aria-label="Reset text offset"
                        onClick={() =>
                          updateActiveSlide({
                            textOffsetX: 0,
                            textOffsetY: 0,
                            titleSizeScale: 1,
                          })
                        }
                      >
                        <RotateCcw size={11} />
                      </button>
                    </ToolbarTooltip>
                  </div>
                </div>

                <textarea
                  aria-label="Headline (*word* for accent color)"
                  className="f-textarea"
                  placeholder="Headline (*accent* word)"
                  value={activeSlide.headline}
                  onChange={(e) =>
                    updateActiveSlide({ headline: e.target.value })
                  }
                />

                <div className="prop-grid-2">
                  <select
                    aria-label="Font family"
                    className="f-select"
                    value={activeSlide.fontFamily}
                    onChange={(e) =>
                      updateActiveSlide({
                        fontFamily: e.target.value as FontFamilyChoice,
                      })
                    }
                  >
                    <option value="Inter">Inter</option>
                    <option value="Plus Jakarta Sans">Jakarta Sans</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value="DM Sans">DM Sans</option>
                    <option value="Instrument Serif">Instrument Serif</option>
                  </select>

                  <ScrubInput
                    label="S"
                    ariaLabel="Text scale"
                    value={activeSlide.titleSizeScale}
                    min={0.55}
                    max={1.65}
                    step={0.02}
                    displayMultiplier={100}
                    suffix="%"
                    defaultValue={1}
                    onChange={(v) => updateActiveSlide({ titleSizeScale: v })}
                  />
                </div>

                <div className="prop-grid-2">
                  <ScrubInput
                    label="X"
                    ariaLabel="Text X offset"
                    value={activeSlide.textOffsetX}
                    min={-45}
                    max={45}
                    step={0.5}
                    defaultValue={0}
                    decimals={1}
                    onChange={(v) => updateActiveSlide({ textOffsetX: v })}
                  />
                  <ScrubInput
                    label="Y"
                    ariaLabel="Text Y offset"
                    value={activeSlide.textOffsetY}
                    min={-45}
                    max={45}
                    step={0.5}
                    defaultValue={0}
                    decimals={1}
                    onChange={(v) => updateActiveSlide({ textOffsetY: v })}
                  />
                </div>

                <div className="prop-grid-2">
                  <label className="color-chip-field">
                    <input
                      type="color"
                      value={activeSlide.textColor}
                      onChange={(e) =>
                        updateActiveSlide({ textColor: e.target.value })
                      }
                    />
                    <span>Text</span>
                  </label>
                  <label className="color-chip-field">
                    <input
                      type="color"
                      value={activeSlide.accentColor}
                      onChange={(e) =>
                        updateActiveSlide({ accentColor: e.target.value })
                      }
                    />
                    <span>*Accent*</span>
                  </label>
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={activeSlide.showSubheadline}
                    onChange={(e) =>
                      updateActiveSlide({ showSubheadline: e.target.checked })
                    }
                  />
                  <span>Subtitle</span>
                </label>

                {activeSlide.showSubheadline ? (
                  <textarea
                    aria-label="Subtitle"
                    className="f-textarea"
                    placeholder="Optional subtitle"
                    value={activeSlide.subheadline}
                    onChange={(e) =>
                      updateActiveSlide({ subheadline: e.target.value })
                    }
                  />
                ) : null}
              </section>

              {/* Overlays Quick Add */}
              <section className="prop-section">
                <div className="prop-header">
                  <span className="prop-title tabular">
                    Overlays ({activeSlide.overlays.length})
                  </span>
                  <button
                    type="button"
                    className="f-btn f-btn-ghost"
                    style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                    onClick={() => addOverlayInputRef.current?.click()}
                  >
                    <Plus size={12} />
                    <span>Add</span>
                  </button>
                </div>
                {activeSlide.overlays.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {activeSlide.overlays.map((ov) => {
                      const sel =
                        selection.type === 'overlay' && selection.id === ov.id;
                      return (
                        <div
                          key={ov.id}
                          role="button"
                          tabIndex={0}
                          className={`layer-row ${sel ? 'is-selected' : ''}`}
                          style={{ height: 25 }}
                          onClick={() =>
                            setSelection({ type: 'overlay', id: ov.id })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelection({ type: 'overlay', id: ov.id });
                            }
                          }}
                        >
                          <span className="layer-name">{ov.name}</span>
                          <span className="tabular" style={{ fontSize: 10.5, opacity: 0.7 }}>
                            {Math.round(ov.scale * 100)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              {/* Fill / Background */}
              <section className="prop-section">
                <div className="prop-header">
                  <span className="prop-title">Fill</span>
                  <button
                    type="button"
                    className="f-btn f-btn-ghost"
                    style={{ height: 22, padding: '0 6px', fontSize: 10.5 }}
                    onClick={syncStyleAcrossFrames}
                  >
                    Apply to All
                  </button>
                </div>

                <div className="swatch-dots">
                  {THEME_PALETTES.map((pal) => (
                    <button
                      key={pal.id}
                      type="button"
                      className="swatch-dot-btn"
                      title={pal.name}
                      aria-label={pal.name}
                      style={{
                        background: `linear-gradient(135deg, ${pal.background.colorA}, ${pal.background.colorC})`,
                      }}
                      onClick={() =>
                        updateActiveSlide({
                          textColor: pal.textColor,
                          accentColor: pal.accentColor,
                          deviceFinish: pal.deviceFinish,
                          background: { ...pal.background },
                        })
                      }
                    />
                  ))}
                </div>

                <div className="prop-grid-2">
                  <select
                    aria-label="Fill type"
                    className="f-select"
                    value={activeSlide.background.type}
                    onChange={(e) =>
                      updateActiveBackground({
                        type: e.target.value as 'mesh' | 'linear' | 'solid',
                      })
                    }
                  >
                    <option value="mesh">Mesh</option>
                    <option value="linear">Linear</option>
                    <option value="solid">Solid</option>
                  </select>

                  <select
                    aria-label="Pattern overlay"
                    className="f-select"
                    value={activeSlide.background.pattern}
                    onChange={(e) =>
                      updateActiveBackground({
                        pattern: e.target.value as PatternType,
                      })
                    }
                  >
                    <option value="none">No Pattern</option>
                    <option value="grid">Grid</option>
                    <option value="dots">Dots</option>
                    <option value="rings">Rings</option>
                  </select>
                </div>

                <div className="prop-grid-3">
                  <label className="color-chip-field">
                    <input
                      type="color"
                      value={activeSlide.background.colorA}
                      onChange={(e) =>
                        updateActiveBackground({ colorA: e.target.value })
                      }
                    />
                    <span>A</span>
                  </label>
                  {activeSlide.background.type !== 'solid' ? (
                    <>
                      <label className="color-chip-field">
                        <input
                          type="color"
                          value={activeSlide.background.colorB}
                          onChange={(e) =>
                            updateActiveBackground({ colorB: e.target.value })
                          }
                        />
                        <span>B</span>
                      </label>
                      <label className="color-chip-field">
                        <input
                          type="color"
                          value={activeSlide.background.colorC}
                          onChange={(e) =>
                            updateActiveBackground({ colorC: e.target.value })
                          }
                        />
                        <span>C</span>
                      </label>
                    </>
                  ) : null}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <ScrubInput
                    label="Gr"
                    ariaLabel="Film grain"
                    value={activeSlide.background.noise}
                    min={0}
                    max={0.12}
                    step={0.005}
                    displayMultiplier={100}
                    suffix="%"
                    defaultValue={0.035}
                    onChange={(v) => updateActiveBackground({ noise: v })}
                  />
                  <label className="check-row" style={{ flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={activeSlide.background.spotlight}
                      onChange={(e) =>
                        updateActiveBackground({
                          spotlight: e.target.checked,
                        })
                      }
                    />
                    <span>Glow</span>
                  </label>
                </div>
              </section>

              {/* Figma-style Bottom Export Section */}
              <section className="prop-section" style={{ borderBottom: 'none' }}>
                <div className="prop-header">
                  <span className="prop-title">Export</span>
                  <span className="platform-dim-tag tabular">
                    {targetWidth}×{targetHeight}
                  </span>
                </div>
                <div className="prop-grid-2">
                  <button
                    type="button"
                    className="f-btn"
                    onClick={handleExportCurrent}
                  >
                    <Download size={12} />
                    <span>Frame PNG</span>
                  </button>
                  <button
                    type="button"
                    className="f-btn"
                    onClick={handleExportCurrentSetZip}
                  >
                    <FolderArchive size={12} />
                    <span>Set (.zip)</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="f-btn f-btn-primary"
                  style={{ width: '100%' }}
                  onClick={handleExportBothStores}
                  disabled={bundleState === 'rendering'}
                >
                  <FolderArchive size={12} />
                  <span>
                    {bundleState === 'rendering'
                      ? `Exporting ${bundleProgress || ''}…`
                      : 'Export App Store + Play Store (.zip)'}
                  </span>
                </button>
              </section>
            </>
          ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <StorePreviewModal
        open={storePreviewOpen}
        onClose={() => setStorePreviewOpen(false)}
        projectName={project.projectName}
        preset={activePreset}
        platformSlot={platformSlot}
        width={targetWidth}
        height={targetHeight}
        slides={project.slides}
      />

      <BundleModal
        open={bundleModalOpen}
        onClose={() => setBundleModalOpen(false)}
        slideCount={project.slides.length}
        options={bundleOptions}
        onChangeOptions={setBundleOptions}
        onExportBundle={handleExportBothStores}
        isExporting={bundleState === 'rendering'}
        progressText={bundleProgress}
      />

      <ShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      <div className="sr-live" aria-live="polite">
        {uiLiveMessage}
      </div>

      {toastMessage ? (
        <div className="studio-toast" role="status" aria-live="polite">
          <Check size={13} color="var(--success)" />
          <span>{toastMessage}</span>
        </div>
      ) : null}
    </div>
  );
};
