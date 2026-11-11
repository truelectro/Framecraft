import React, { useEffect, useRef, useState } from 'react';

interface ScrubInputProps {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  defaultValue?: number;
  displayMultiplier?: number;
  decimals?: number;
  onChange: (next: number) => void;
}

/**
 * Figma-style compact numeric field with horizontal drag-to-scrub on its prefix label.
 */
export const ScrubInput: React.FC<ScrubInputProps> = ({
  label,
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  defaultValue,
  displayMultiplier = 1,
  decimals = 0,
  onChange,
}) => {
  const formatVal = (v: number) =>
    Number((v * displayMultiplier).toFixed(decimals)).toString();

  const [draft, setDraft] = useState(() => formatVal(value));
  const [focused, setFocused] = useState(false);
  const scrubStartRef = useRef<{ startX: number; startVal: number } | null>(null);

  useEffect(() => {
    if (!focused) {
      setDraft(formatVal(value));
    }
  }, [value, focused, displayMultiplier, decimals]);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const commitDraft = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    if (!Number.isNaN(parsed)) {
      onChange(clamp(parsed / displayMultiplier));
    } else {
      setDraft(formatVal(value));
    }
  };

  const onPrefixPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubStartRef.current = { startX: e.clientX, startVal: value };
  };

  const onPrefixPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !scrubStartRef.current) {
      return;
    }
    const dx = e.clientX - scrubStartRef.current.startX;
    const mult = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
    const next = clamp(scrubStartRef.current.startVal + dx * step * 0.5 * mult);
    const rounded = Number(next.toFixed(4));
    onChange(rounded);
  };

  const onPrefixLostCapture = () => {
    scrubStartRef.current = null;
  };

  return (
    <div className="scrub-field">
      <span
        className="scrub-prefix"
        onPointerDown={onPrefixPointerDown}
        onPointerMove={onPrefixPointerMove}
        onLostPointerCapture={onPrefixLostCapture}
        onDoubleClick={() => {
          if (defaultValue !== undefined) onChange(defaultValue);
        }}
        title="Drag to scrub · Double-click to reset"
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        className="scrub-input tabular"
        value={focused ? draft : `${formatVal(value)}${suffix}`}
        onFocus={(e) => {
          setFocused(true);
          setDraft(formatVal(value));
          window.requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          commitDraft(draft);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft(draft);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const dir = e.key === 'ArrowUp' ? 1 : -1;
            const mult = e.shiftKey ? 10 : 1;
            const next = clamp(value + dir * step * mult);
            onChange(Number(next.toFixed(4)));
          }
        }}
      />
    </div>
  );
};
