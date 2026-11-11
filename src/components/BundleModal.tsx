import React, { useEffect, useRef } from 'react';
import { FolderArchive, X } from 'lucide-react';
import {
  BundleExportOptions,
  countBundleAssets,
} from '../utils/bundleExport';

interface BundleModalProps {
  open: boolean;
  onClose: () => void;
  slideCount: number;
  options: BundleExportOptions;
  onChangeOptions: (next: BundleExportOptions) => void;
  onExportBundle: () => void;
  isExporting: boolean;
  progressText: string | null;
}

export const BundleModal: React.FC<BundleModalProps> = ({
  open,
  onClose,
  slideCount,
  options,
  onChangeOptions,
  onExportBundle,
  isExporting,
  progressText,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

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

  const totalAssets = countBundleAssets(slideCount, options);
  const toggle = (key: keyof BundleExportOptions) =>
    onChangeOptions({ ...options, [key]: !options[key] });

  const targets: Array<{
    key: keyof BundleExportOptions;
    label: string;
    dim: string;
  }> = [
    { key: 'includeAppStoreIphone', label: 'App Store · iPhone 6.9"', dim: '1320 × 2868' },
    { key: 'includePlayStorePhone', label: 'Google Play · Phone', dim: '1080 × 1920' },
    { key: 'includePlayFeatureGraphic', label: 'Google Play · Feature Graphic', dim: '1024 × 500' },
    { key: 'includeAppStoreIpad', label: 'App Store · iPad 13"', dim: '2064 × 2752' },
    { key: 'includeProductBanner', label: 'Web · Feature Banner', dim: '1600 × 900' },
  ];

  return (
    <dialog
      ref={dialogRef}
      className="store-modal bundle-modal"
      aria-labelledby="bundle-modal-heading"
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
    >
      <div className="modal-header">
        <h2
          id="bundle-modal-heading"
          style={{ margin: 0, fontSize: 13, fontWeight: 600 }}
        >
          Export Multi-Store Bundle
        </h2>
        <form method="dialog" style={{ margin: 0 }}>
          <button
            type="submit"
            value="close"
            className="f-icon-btn"
            aria-label="Close bundle options"
          >
            <X size={14} />
          </button>
        </form>
      </div>

      <div className="modal-body" style={{ gap: 12 }}>
        <div className="bundle-option-grid">
          {targets.map((item) => (
            <label key={item.key} className="bundle-check-card">
              <input
                type="checkbox"
                checked={options[item.key]}
                onChange={() => toggle(item.key)}
              />
              <span className="bundle-card-title">{item.label}</span>
              <span className="bundle-dim tabular">{item.dim}</span>
            </label>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 8,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            Uses each platform’s independent device sizing & position
          </span>
          <button
            type="button"
            className="f-btn f-btn-primary"
            disabled={totalAssets === 0 || isExporting}
            onClick={onExportBundle}
            autoFocus
          >
            <FolderArchive size={13} />
            <span className="tabular">
              {isExporting
                ? progressText || 'Exporting…'
                : `Export ${totalAssets} PNGs (.zip)`}
            </span>
          </button>
        </div>
      </div>
    </dialog>
  );
};
