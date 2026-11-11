import React, { useEffect, useRef, useState } from 'react';

// Shared warm-state tracker across all toolbar tooltips (Emil Kowalski pattern:
// delay the first tooltip, open subsequent adjacent tooltips with 0ms delay & 0ms transition)
let tooltipGroupWarm = false;
let coolDownTimer: number | null = null;

interface ToolbarTooltipProps {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
}

export const ToolbarTooltip: React.FC<ToolbarTooltipProps> = ({
  label,
  shortcut,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const openTimer = useRef<number | null>(null);

  const show = () => {
    if (coolDownTimer) {
      window.clearTimeout(coolDownTimer);
      coolDownTimer = null;
    }
    if (tooltipGroupWarm) {
      setInstant(true);
      setOpen(true);
    } else {
      setInstant(false);
      openTimer.current = window.setTimeout(() => {
        tooltipGroupWarm = true;
        setOpen(true);
      }, 360);
    }
  };

  const hide = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    setOpen(false);
    coolDownTimer = window.setTimeout(() => {
      tooltipGroupWarm = false;
    }, 320);
  };

  useEffect(() => {
    return () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
    };
  }, []);

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <span
        role="tooltip"
        className="studio-tooltip"
        data-open={open ? 'true' : 'false'}
        data-instant={instant ? 'true' : 'false'}
      >
        {label}
        {shortcut ? (
          <span style={{ marginLeft: 6, opacity: 0.65, fontFamily: 'JetBrains Mono, monospace' }}>
            {shortcut}
          </span>
        ) : null}
      </span>
    </span>
  );
};
