import { SampleScreenVariant } from '../types';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

/**
 * Draws crisp, resolution-independent vector demo UI inside a device screen
 * when the user hasn't dropped in their own screenshot yet.
 */
export function drawSampleScreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: SampleScreenVariant,
  accentColor: string,
  isWide = false
) {
  ctx.save();
  ctx.translate(x, y);

  const isLight = variant === 'tasks' || variant === 'fitness';
  const bg = isLight ? '#F8FAFC' : '#0B0E14';
  const cardBg = isLight ? '#FFFFFF' : '#131822';
  const cardBorder = isLight ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.08)';
  const fg = isLight ? '#0F172A' : '#F8FAFC';
  const muted = isLight ? '#64748B' : '#94A3B8';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle top ambient wash inside app
  const wash = ctx.createLinearGradient(0, 0, 0, h * 0.42);
  wash.addColorStop(0, hexWithAlpha(accentColor, isLight ? 0.12 : 0.22));
  wash.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h * 0.42);

  const u = w / 390; // Normalized unit based on 390pt logical width
  const pad = 22 * u;

  // Status bar (skip on wide desktop browser card)
  let cursorY = isWide ? 22 * u : 54 * u;
  if (!isWide) {
    ctx.fillStyle = fg;
    ctx.font = `600 ${Math.round(13 * u)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('9:41', pad + 4 * u, 28 * u);

    // Signal + battery glyphs
    const bx = w - pad - 24 * u;
    const by = 18 * u;
    roundRectPath(ctx, bx, by, 22 * u, 11 * u, 3 * u);
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
    roundRectPath(ctx, bx + 2 * u, by + 2 * u, 15 * u, 7 * u, 1.5 * u);
    ctx.fillStyle = fg;
    ctx.fill();
  }

  if (variant === 'analytics') {
    // Header
    ctx.fillStyle = muted;
    ctx.font = `500 ${Math.round(12 * u)}px Inter, sans-serif`;
    ctx.fillText('MONTHLY RECURRING', pad, cursorY);

    cursorY += 32 * u;
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(30 * u)}px "Plus Jakarta Sans", Inter, sans-serif`;
    ctx.fillText('$148,920', pad, cursorY);

    // Pill delta
    const pillX = pad + 152 * u;
    roundRectPath(ctx, pillX, cursorY - 19 * u, 68 * u, 22 * u, 11 * u);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.16)';
    ctx.fill();
    ctx.fillStyle = '#34D399';
    ctx.font = `600 ${Math.round(11 * u)}px Inter, sans-serif`;
    ctx.fillText('+24.8%', pillX + 12 * u, cursorY - 4 * u);

    cursorY += 24 * u;
    // Chart Card
    const chartH = isWide ? h * 0.44 : 185 * u;
    roundRectPath(ctx, pad, cursorY, w - pad * 2, chartH, 18 * u);
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 1 * u;
    ctx.stroke();

    // Smooth Bezier area chart
    const pts = [0.72, 0.65, 0.68, 0.5, 0.54, 0.36, 0.28, 0.16];
    const cx0 = pad + 16 * u;
    const cw = w - pad * 2 - 32 * u;
    const cy0 = cursorY + 28 * u;
    const ch = chartH - 52 * u;

    ctx.save();
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const px = cx0 + (cw * idx) / (pts.length - 1);
      const py = cy0 + ch * p;
      if (idx === 0) ctx.moveTo(px, py);
      else {
        const prevX = cx0 + (cw * (idx - 1)) / (pts.length - 1);
        const prevY = cy0 + ch * pts[idx - 1];
        const midX = (prevX + px) / 2;
        ctx.bezierCurveTo(midX, prevY, midX, py, px, py);
      }
    });
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3 * u;
    ctx.stroke();

    // Area fill under curve
    ctx.lineTo(cx0 + cw, cy0 + ch);
    ctx.lineTo(cx0, cy0 + ch);
    ctx.closePath();
    const areaGrad = ctx.createLinearGradient(0, cy0, 0, cy0 + ch);
    areaGrad.addColorStop(0, hexWithAlpha(accentColor, 0.35));
    areaGrad.addColorStop(1, hexWithAlpha(accentColor, 0.0));
    ctx.fillStyle = areaGrad;
    ctx.fill();
    ctx.restore();

    cursorY += chartH + 16 * u;

    // 2 Metric Bento tiles
    const tileW = (w - pad * 2 - 12 * u) / 2;
    const tileH = 92 * u;
    const metrics = [
      { label: 'Net Retention', val: '118.4%', sub: 'Top 5% SaaS' },
      { label: 'Active Paid', val: '4,812', sub: '+312 this wk' },
    ];
    metrics.forEach((m, i) => {
      const tx = pad + i * (tileW + 12 * u);
      roundRectPath(ctx, tx, cursorY, tileW, tileH, 16 * u);
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.strokeStyle = cardBorder;
      ctx.stroke();

      ctx.fillStyle = muted;
      ctx.font = `500 ${Math.round(11 * u)}px Inter, sans-serif`;
      ctx.fillText(m.label, tx + 14 * u, cursorY + 26 * u);

      ctx.fillStyle = fg;
      ctx.font = `700 ${Math.round(20 * u)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(m.val, tx + 14 * u, cursorY + 54 * u);

      ctx.fillStyle = accentColor;
      ctx.font = `500 ${Math.round(10.5 * u)}px Inter, sans-serif`;
      ctx.fillText(m.sub, tx + 14 * u, cursorY + 75 * u);
    });

    cursorY += tileH + 16 * u;
    // Activity rows
    const rows = [
      { title: 'Linear Enterprise', tag: 'Annual · $2,400', dot: '#818CF8' },
      { title: 'Raycast Teams', tag: 'Monthly · $480', dot: '#34D399' },
      { title: 'Vercel Pro Plan', tag: 'Expansion · $920', dot: '#38BDF8' },
    ];
    rows.forEach((r, idx) => {
      const ry = cursorY + idx * 58 * u;
      if (ry + 48 * u > h) return;
      roundRectPath(ctx, pad, ry, w - pad * 2, 48 * u, 13 * u);
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.strokeStyle = cardBorder;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pad + 20 * u, ry + 24 * u, 6 * u, 0, Math.PI * 2);
      ctx.fillStyle = r.dot;
      ctx.fill();

      ctx.fillStyle = fg;
      ctx.font = `600 ${Math.round(12.5 * u)}px Inter, sans-serif`;
      ctx.fillText(r.title, pad + 36 * u, ry + 28 * u);

      ctx.textAlign = 'right';
      ctx.fillStyle = muted;
      ctx.font = `500 ${Math.round(11.5 * u)}px Inter, sans-serif`;
      ctx.fillText(r.tag, w - pad - 14 * u, ry + 28 * u);
      ctx.textAlign = 'left';
    });
  } else if (variant === 'tasks') {
    ctx.fillStyle = muted;
    ctx.font = `600 ${Math.round(11.5 * u)}px Inter, sans-serif`;
    ctx.fillText('THURSDAY · FOCUS SPRINT', pad, cursorY);

    cursorY += 30 * u;
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(26 * u)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Today’s Priorities', pad, cursorY);

    cursorY += 22 * u;
    // Progress summary card
    roundRectPath(ctx, pad, cursorY, w - pad * 2, 78 * u, 16 * u);
    ctx.fillStyle = '#0F172A';
    ctx.fill();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = `600 ${Math.round(13.5 * u)}px Inter, sans-serif`;
    ctx.fillText('Release v3.0 Launch Assets', pad + 16 * u, cursorY + 28 * u);
    ctx.fillStyle = '#94A3B8';
    ctx.font = `500 ${Math.round(11 * u)}px Inter, sans-serif`;
    ctx.fillText('6 of 8 milestones complete', pad + 16 * u, cursorY + 47 * u);

    // Progress bar
    roundRectPath(ctx, pad + 16 * u, cursorY + 57 * u, w - pad * 2 - 32 * u, 7 * u, 4 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    roundRectPath(ctx, pad + 16 * u, cursorY + 57 * u, (w - pad * 2 - 32 * u) * 0.76, 7 * u, 4 * u);
    ctx.fillStyle = accentColor;
    ctx.fill();

    cursorY += 96 * u;
    const tasks = [
      { label: 'Finalize App Store 6.9" set', time: '10:00', done: true },
      { label: 'Export Play Feature Graphic', time: '11:30', done: true },
      { label: 'Review motion curves & spring', time: '14:00', done: false },
      { label: 'Publish Product Hunt gallery', time: '16:00', done: false },
      { label: 'Sync release changelog', time: '17:15', done: false },
    ];
    tasks.forEach((t, i) => {
      const ty = cursorY + i * 62 * u;
      if (ty + 52 * u > h) return;
      roundRectPath(ctx, pad, ty, w - pad * 2, 52 * u, 14 * u);
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.strokeStyle = cardBorder;
      ctx.lineWidth = 1 * u;
      ctx.stroke();

      // Check circle
      ctx.beginPath();
      ctx.arc(pad + 22 * u, ty + 26 * u, 9 * u, 0, Math.PI * 2);
      if (t.done) {
        ctx.fillStyle = accentColor;
        ctx.fill();
      } else {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.8 * u;
        ctx.stroke();
      }

      ctx.fillStyle = t.done ? muted : fg;
      ctx.font = `600 ${Math.round(13 * u)}px Inter, sans-serif`;
      ctx.fillText(t.label, pad + 42 * u, ty + 30 * u);

      ctx.textAlign = 'right';
      ctx.fillStyle = muted;
      ctx.font = `500 ${Math.round(11 * u)}px "JetBrains Mono", monospace`;
      ctx.fillText(t.time, w - pad - 14 * u, ty + 30 * u);
      ctx.textAlign = 'left';
    });
  } else if (variant === 'fintech') {
    // Sleek virtual card + FX list
    ctx.fillStyle = muted;
    ctx.font = `500 ${Math.round(12 * u)}px Inter, sans-serif`;
    ctx.fillText('TREASURY · MULTI-CURRENCY', pad, cursorY);
    cursorY += 22 * u;

    // Metallic Dark Card
    const cardH = 192 * u;
    const grad = ctx.createLinearGradient(pad, cursorY, w - pad, cursorY + cardH);
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(0.5, '#0F172A');
    grad.addColorStop(1, hexWithAlpha(accentColor, 0.65));
    roundRectPath(ctx, pad, cursorY, w - pad * 2, cardH, 22 * u);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `500 ${Math.round(12 * u)}px Inter, sans-serif`;
    ctx.fillText('AVAILABLE BALANCE', pad + 22 * u, cursorY + 34 * u);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(29 * u)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('€84,250.00', pad + 22 * u, cursorY + 70 * u);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `500 ${Math.round(13 * u)}px "JetBrains Mono", monospace`;
    ctx.fillText('••••  ••••  ••••  4829', pad + 22 * u, cursorY + 158 * u);

    cursorY += cardH + 20 * u;
    const fx = [
      { ccy: 'USD Account', amt: '$52,190.00', rate: '0% FX Markup' },
      { ccy: 'GBP Vault', amt: '£19,400.00', rate: '4.85% APY' },
      { ccy: 'JPY Reserve', amt: '¥2,410,000', rate: 'Instant Wire' },
    ];
    fx.forEach((item, i) => {
      const ry = cursorY + i * 68 * u;
      if (ry + 58 * u > h) return;
      roundRectPath(ctx, pad, ry, w - pad * 2, 58 * u, 15 * u);
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.strokeStyle = cardBorder;
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.font = `600 ${Math.round(13.5 * u)}px Inter, sans-serif`;
      ctx.fillText(item.ccy, pad + 16 * u, ry + 25 * u);

      ctx.fillStyle = muted;
      ctx.font = `500 ${Math.round(11 * u)}px Inter, sans-serif`;
      ctx.fillText(item.rate, pad + 16 * u, ry + 43 * u);

      ctx.textAlign = 'right';
      ctx.fillStyle = fg;
      ctx.font = `700 ${Math.round(14 * u)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(item.amt, w - pad - 16 * u, ry + 34 * u);
      ctx.textAlign = 'left';
    });
  } else if (variant === 'ai-notes') {
    ctx.fillStyle = accentColor;
    ctx.font = `600 ${Math.round(11.5 * u)}px Inter, sans-serif`;
    ctx.fillText('✦ AI SUMMARY · READY', pad, cursorY);

    cursorY += 30 * u;
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(24 * u)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Q4 Product Architecture', pad, cursorY);

    cursorY += 22 * u;
    roundRectPath(ctx, pad, cursorY, w - pad * 2, 138 * u, 18 * u);
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = hexWithAlpha(accentColor, 0.35);
    ctx.lineWidth = 1.2 * u;
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.font = `600 ${Math.round(11.5 * u)}px Inter, sans-serif`;
    ctx.fillText('KEY TAKEAWAYS', pad + 16 * u, cursorY + 26 * u);

    const bullets = [
      '• Edge sync latency reduced from 180ms → 28ms',
      '• Offline-first queue ready for iOS & Android',
      '• Zero-alpha store export pipeline verified',
    ];
    ctx.fillStyle = fg;
    ctx.font = `500 ${Math.round(12 * u)}px Inter, sans-serif`;
    bullets.forEach((b, idx) => {
      ctx.fillText(b, pad + 16 * u, cursorY + 54 * u + idx * 28 * u);
    });

    cursorY += 158 * u;
    // Voice waveform pill
    roundRectPath(ctx, pad, cursorY, w - pad * 2, 64 * u, 16 * u);
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = cardBorder;
    ctx.stroke();

    const bars = 24;
    const startBarX = pad + 20 * u;
    const barGap = (w - pad * 2 - 40 * u) / bars;
    for (let i = 0; i < bars; i++) {
      const bh = (10 + Math.abs(Math.sin(i * 0.65)) * 26) * u;
      roundRectPath(
        ctx,
        startBarX + i * barGap,
        cursorY + 32 * u - bh / 2,
        3.5 * u,
        bh,
        2 * u
      );
      ctx.fillStyle = i < 15 ? accentColor : 'rgba(148,163,184,0.3)';
      ctx.fill();
    }
  } else {
    // fitness
    ctx.fillStyle = muted;
    ctx.font = `600 ${Math.round(11.5 * u)}px Inter, sans-serif`;
    ctx.fillText('DAILY RECOVERY SCORE', pad, cursorY);

    cursorY += 32 * u;
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(28 * u)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('94% Optimal', pad, cursorY);

    cursorY += 24 * u;
    // Activity ring card
    const ringCardH = 190 * u;
    roundRectPath(ctx, pad, cursorY, w - pad * 2, ringCardH, 20 * u);
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = cardBorder;
    ctx.stroke();

    const rcx = w / 2;
    const rcy = cursorY + ringCardH / 2;
    [64, 48, 32].forEach((rad, i) => {
      ctx.beginPath();
      ctx.arc(rcx, rcy, rad * u, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15,23,42,0.08)';
      ctx.lineWidth = 10 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        rcx,
        rcy,
        rad * u,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (0.88 - i * 0.12)
      );
      ctx.strokeStyle = i === 0 ? accentColor : i === 1 ? '#10B981' : '#F59E0B';
      ctx.lineCap = 'round';
      ctx.lineWidth = 10 * u;
      ctx.stroke();
    });
  }

  // Home indicator on mobile
  if (!isWide) {
    roundRectPath(ctx, w / 2 - 58 * u, h - 14 * u, 116 * u, 4.5 * u, 3 * u);
    ctx.fillStyle = isLight ? 'rgba(15,23,42,0.22)' : 'rgba(255,255,255,0.28)';
    ctx.fill();
  }

  ctx.restore();
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(129, 140, 248, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
