import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  label: string;
  keys: string[];
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const SHIFT = isMac ? '⇧' : 'Shift';

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Canvas & Zoom',
    items: [
      { label: 'Zoom at cursor', keys: ['Wheel / Pinch'] },
      { label: 'Pan canvas', keys: ['Space', 'Drag'] },
      { label: 'Pan horizontally', keys: [SHIFT, 'Wheel'] },
      { label: 'Zoom in / out', keys: ['+', '-'] },
      { label: 'Zoom to 100%', keys: [MOD, '0'] },
      { label: 'Zoom to fit', keys: [SHIFT, '1'] },
      { label: 'Toggle sidebars', keys: [MOD, '\\'] },
      { label: 'Safe guides', keys: ['G'] },
    ],
  },
  {
    title: 'Edit & Layers',
    items: [
      { label: 'Undo', keys: [MOD, 'Z'] },
      { label: 'Redo', keys: [MOD, SHIFT, 'Z'] },
      { label: 'Edit text on canvas', keys: ['T'] },
      { label: 'Select device / frame', keys: ['D', 'F'] },
      { label: 'Duplicate frame / layer', keys: [MOD, 'D'] },
      { label: 'Copy / paste image or layer', keys: [MOD, 'C / V'] },
      { label: 'Delete overlay / clear image', keys: ['⌫'] },
      { label: 'Deselect', keys: ['Esc'] },
    ],
  },
  {
    title: 'Arrange & Frames',
    items: [
      { label: 'Nudge 0.5%', keys: ['←', '↑', '↓', '→'] },
      { label: 'Nudge 2.5%', keys: [SHIFT, 'Arrows'] },
      { label: 'Overlay front / back', keys: [']', '['] },
      { label: 'Prev / next frame', keys: ['[', ']'] },
      { label: 'Jump to frame 1–9', keys: ['1–9'] },
      { label: 'New frame', keys: ['N'] },
    ],
  },
  {
    title: 'Preview & Export',
    items: [
      { label: 'Store preview', keys: ['P'] },
      { label: 'Export frame PNG', keys: [MOD, 'E'] },
      { label: 'Multi-store bundle', keys: [MOD, SHIFT, 'E'] },
      { label: 'Keyboard shortcuts', keys: ['?'] },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  open,
  onClose,
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

  return (
    <dialog
      ref={dialogRef}
      className="store-modal shortcuts-modal"
      aria-labelledby="shortcuts-heading"
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
    >
      <div className="modal-header">
        <h2
          id="shortcuts-heading"
          style={{ margin: 0, fontSize: 13, fontWeight: 600 }}
        >
          Shortcuts & Navigation
        </h2>
        <form method="dialog" style={{ margin: 0 }}>
          <button
            type="submit"
            value="close"
            className="f-icon-btn"
            aria-label="Close keyboard shortcuts"
            autoFocus
          >
            <X size={14} />
          </button>
        </form>
      </div>

      <div className="modal-body">
        <div className="shortcuts-grid">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcut-section">
              <div className="shortcut-section-title">{group.title}</div>
              <div className="shortcut-list">
                {group.items.map((item) => (
                  <div key={item.label} className="shortcut-row">
                    <span className="shortcut-label">{item.label}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((k) => (
                        <kbd key={k} className="kbd-cap">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
};
