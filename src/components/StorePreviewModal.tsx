import React, { useEffect, useRef, useState } from 'react';
import { Moon, Sun, X } from 'lucide-react';
import { PlatformSlot, SlideConfig, StorePreset } from '../types';
import { SlideCanvas } from './SlideCanvas';

interface StorePreviewModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  preset: StorePreset;
  platformSlot: PlatformSlot;
  width: number;
  height: number;
  slides: SlideConfig[];
}

export const StorePreviewModal: React.FC<StorePreviewModalProps> = ({
  open,
  onClose,
  projectName,
  preset,
  platformSlot,
  width,
  height,
  slides,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [darkStore, setDarkStore] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dialog.close();
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  const isLandscape = width > height * 1.15;
  const previewH = isLandscape ? 230 : 340;
  const previewW = Math.round((width / height) * previewH);

  return (
    <dialog
      ref={dialogRef}
      className="store-modal"
      aria-labelledby="store-preview-heading"
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
    >
      <div className="modal-header">
        <h2
          id="store-preview-heading"
          style={{ margin: 0, fontSize: 13, fontWeight: 600 }}
        >
          Store Preview · {preset.store}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="f-btn"
            onClick={() => setDarkStore((d) => !d)}
          >
            {darkStore ? <Sun size={13} /> : <Moon size={13} />}
            <span>{darkStore ? 'Light' : 'Dark'}</span>
          </button>
          <form method="dialog" style={{ margin: 0 }}>
            <button
              type="submit"
              value="close"
              className="f-icon-btn"
              aria-label="Close preview"
              autoFocus
            >
              <X size={14} />
            </button>
          </form>
        </div>
      </div>

      <div className="modal-body">
        <div className={`store-card-mockup ${darkStore ? 'is-dark' : ''}`}>
          <div className="store-app-row">
            <div className="store-app-meta">
              <div className="store-app-icon" />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {projectName || 'Untitled App'}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 1 }}>
                  4.9 ★★★★★
                </div>
              </div>
            </div>
            <div
              className="store-get-btn"
              style={{
                background:
                  preset.store === 'Google Play' ? '#01875f' : '#007aff',
              }}
            >
              {preset.store === 'Google Play' ? 'Install' : 'GET'}
            </div>
          </div>

          <div
            className="store-screenshots-scroller"
            role="region"
            aria-label="Store gallery preview"
            tabIndex={0}
          >
            {slides.map((s, idx) => (
              <div
                key={s.id}
                style={{
                  width: previewW,
                  height: previewH,
                  borderRadius: preset.store === 'Google Play' ? 10 : 14,
                  overflow: 'hidden',
                  border: darkStore
                    ? '1px solid rgba(255,255,255,0.12)'
                    : '1px solid rgba(15,23,42,0.09)',
                }}
              >
                <SlideCanvas
                  slide={s}
                  previousSlide={idx > 0 ? slides[idx - 1] : null}
                  targetWidth={width}
                  targetHeight={height}
                  platformSlot={platformSlot}
                  renderScale={Math.min(0.45, previewH / height)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
};
