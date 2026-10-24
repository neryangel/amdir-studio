// Abstract SVG "painters" for DEMO media only (no people, no logos, no text, no stock).
// Every frame is generated locally; the site labels it with the "חומר זמני" badge.
// Used by scripts/gen-demo-media.mjs.

export function rnd(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const palettes = {
  magenta: { bg: '#121318', mid: '#2a1d2a', a: '#e5397f', b: '#f1e6e9', c: '#6b2bd9' },
  ember: { bg: '#12161d', mid: '#2b2f3a', a: '#ff8a4c', b: '#f3e9df', c: '#2a5bd7' },
  dusk: { bg: '#1b1611', mid: '#4a3524', a: '#e2a54a', b: '#f6ead6', c: '#7a3b2e' },
  sea: { bg: '#0c1a1d', mid: '#19393d', a: '#39c8b2', b: '#e1f3f0', c: '#2b6fd6' },
  violet: { bg: '#110f1c', mid: '#241d3d', a: '#8a5cff', b: '#ece7ff', c: '#ff4f8b' },
  amber: { bg: '#15120e', mid: '#2e261c', a: '#ffb547', b: '#f7efe2', c: '#b8432f' },
  rose: { bg: '#1a1216', mid: '#3a2530', a: '#f08aa6', b: '#fbeef1', c: '#6d4a8f' },
  paper: { bg: '#e9edf2', mid: '#cfd6df', a: '#c2410c', b: '#0e1b2c', c: '#2f6fb0' },
  ink: { bg: '#0d0f12', mid: '#1f242b', a: '#f4c430', b: '#f2f2ee', c: '#e5397f' },
};

const f = (n) => Math.round(n * 10) / 10;

function vignette(w, h, p, strength = 0.8) {
  return `<defs><radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="${p.bg}" stop-opacity="0"/><stop offset="1" stop-color="${p.bg}" stop-opacity="${strength}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#vig)"/>`;
}

/** Stage: haze, floor glow; with fx: light beams + sources + dust. */
function stage(w, h, p, R, o) {
  const fx = o.fx !== false;
  const m = Math.min(w, h);
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/><defs>
<radialGradient id="floor" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="${p.a}" stop-opacity="${fx ? 0.45 : 0.18}"/><stop offset="1" stop-color="${p.bg}" stop-opacity="0"/></radialGradient>
<filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m / 9)}"/></filter>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m / 90)}"/></filter>
<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="${f(m / 60)}"/></filter>`;
  for (let i = 0; i < 5; i++) {
    const col = i % 2 ? p.b : i === 2 ? p.c : p.a;
    s += `<linearGradient id="beam${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="${i === 0 ? 0.8 : 0.42}"/><stop offset=".85" stop-color="${col}" stop-opacity="0"/></linearGradient>`;
  }
  s += `<linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.c}" stop-opacity="${fx ? 0.12 : 0.28}"/><stop offset=".8" stop-color="${p.mid}" stop-opacity="${fx ? 0.2 : 0.5}"/></linearGradient>`;
  s += `</defs><rect width="${w}" height="${h}" fill="url(#wash)"/><rect width="${w}" height="${h}" fill="url(#floor)"/>`;
  s += `<g filter="url(#haze)" opacity=".55"><ellipse cx="${f(w * (0.3 + 0.4 * R()))}" cy="${f(h * 0.55)}" rx="${f(w * 0.45)}" ry="${f(h * 0.25)}" fill="${p.mid}"/><ellipse cx="${f(w * R())}" cy="${f(h * 0.35)}" rx="${f(w * 0.3)}" ry="${f(h * 0.2)}" fill="${p.c}" opacity=".35"/></g>`;
  // floor plane
  s += `<rect x="0" y="${f(h * 0.78)}" width="${w}" height="${f(h * 0.22)}" fill="${p.bg}" opacity=".55"/>`;
  s += `<rect x="0" y="${f(h * 0.78)}" width="${w}" height="${f(Math.max(1, h * 0.003))}" fill="${p.b}" opacity=".12"/>`;
  if (fx) {
    s += `<g filter="url(#soft)">`;
    for (let i = 0; i < 5; i++) {
      const x = w * (0.1 + 0.8 * R());
      const spread = w * (0.08 + 0.16 * R());
      const lean = w * (R() - 0.5) * 0.3;
      s += `<polygon points="${f(x - w * 0.008)},0 ${f(x + w * 0.008)},0 ${f(x + lean + spread)},${f(h * 0.95)} ${f(x + lean - spread)},${f(h * 0.95)}" fill="url(#beam${i})"/>`;
      s += `<circle cx="${f(x)}" cy="${f(h * 0.01)}" r="${f(m * 0.03)}" fill="${i % 2 ? p.b : p.a}" filter="url(#glow)"/>`;
    }
    s += `</g>`;
    s += `<g opacity=".7">`;
    for (let i = 0; i < 70; i++) {
      s += `<circle cx="${f(w * R())}" cy="${f(h * R() * 0.8)}" r="${f(m * (0.001 + 0.003 * R()))}" fill="${p.b}" opacity="${f(0.2 + 0.6 * R())}"/>`;
    }
    s += `</g>`;
  }
  return s + vignette(w, h, p);
}

/** Landscape at dusk: sky, sun, ridges, mist. fx adds lens flare + rays. */
function horizon(w, h, p, R, o) {
  const fx = o.fx === true;
  const m = Math.min(w, h);
  const sunX = w * (0.25 + 0.5 * R());
  const sunY = h * 0.52;
  let s = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg}"/><stop offset=".45" stop-color="${p.c}"/><stop offset=".62" stop-color="${p.a}"/><stop offset=".7" stop-color="${p.b}"/></linearGradient>
<radialGradient id="sun"><stop offset="0" stop-color="${p.b}"/><stop offset=".25" stop-color="${p.b}" stop-opacity=".9"/><stop offset="1" stop-color="${p.a}" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.b}" stop-opacity="0"/><stop offset=".5" stop-color="${p.b}" stop-opacity=".22"/><stop offset="1" stop-color="${p.b}" stop-opacity="0"/></linearGradient>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m / 40)}"/></filter>
</defs><rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  s += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(m * 0.32)}" fill="url(#sun)"/>`;
  const layers = [
    { y: 0.6, amp: 0.08, col: p.mid, op: 0.75 },
    { y: 0.7, amp: 0.1, col: p.c, op: 0.85 },
    { y: 0.8, amp: 0.07, col: p.bg, op: 0.92 },
    { y: 0.9, amp: 0.05, col: p.bg, op: 1 },
  ];
  layers.forEach((L, li) => {
    let pts = `0,${h} `;
    let y = h * L.y;
    for (let i = 0; i <= 24; i++) {
      const x = (w * i) / 24;
      y = Math.min(h, Math.max(h * (L.y - L.amp), y + (R() - 0.5) * h * L.amp * 0.9));
      pts += `${f(x)},${f(y)} `;
    }
    pts += `${w},${h}`;
    s += `<polygon points="${pts}" fill="${L.col}" opacity="${L.op}"/>`;
    if (li === 1) s += `<rect x="0" y="${f(h * 0.62)}" width="${w}" height="${f(h * 0.18)}" fill="url(#mist)"/>`;
  });
  if (fx) {
    s += `<g filter="url(#blur)" opacity=".9">`;
    for (let i = 0; i < 7; i++) {
      const ang = (-Math.PI / 2) * (0.2 + 1.6 * (i / 6)) - Math.PI / 4;
      const len = m * 1.2;
      const x2 = sunX + Math.cos(ang) * len;
      const y2 = sunY + Math.sin(ang) * len;
      s += `<line x1="${f(sunX)}" y1="${f(sunY)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${p.b}" stroke-width="${f(m * 0.03)}" opacity=".35"/>`;
    }
    s += `</g>`;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const cx = sunX + (w / 2 - sunX) * 2 * t;
      const cy = sunY + (h / 2 - sunY) * 2 * t;
      s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(m * (0.02 + 0.03 * R()))}" fill="${i % 2 ? p.a : p.c}" opacity=".35"/>`;
    }
  }
  return s + vignette(w, h, p, 0.6);
}

/** Night bokeh: soft discs of light. */
function bokeh(w, h, p, R) {
  const m = Math.min(w, h);
  let s = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg}"/><stop offset="1" stop-color="${p.mid}"/></linearGradient>
<filter id="b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m / 160)}"/></filter>
<filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m / 50)}"/></filter></defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>`;
  const cols = [p.a, p.b, p.c, p.a];
  s += `<g filter="url(#b2)">`;
  for (let i = 0; i < 16; i++) {
    s += `<circle cx="${f(w * R())}" cy="${f(h * R())}" r="${f(m * (0.06 + 0.12 * R()))}" fill="${cols[i % 4]}" opacity="${f(0.15 + 0.3 * R())}"/>`;
  }
  s += `</g><g filter="url(#b1)">`;
  for (let i = 0; i < 26; i++) {
    const r = m * (0.015 + 0.05 * R());
    const c = cols[(i + 1) % 4];
    s += `<circle cx="${f(w * R())}" cy="${f(h * (0.2 + 0.7 * R()))}" r="${f(r)}" fill="${c}" opacity="${f(0.25 + 0.45 * R())}"/>`;
    if (i % 3 === 0) s += `<circle cx="${f(w * R())}" cy="${f(h * R())}" r="${f(r * 1.4)}" fill="none" stroke="${c}" stroke-width="${f(m * 0.004)}" opacity=".5"/>`;
  }
  s += `</g>`;
  return s + vignette(w, h, p, 0.7);
}

/** Motion design frame: rings, bars, dots grid. */
function geo(w, h, p, R, o) {
  const m = Math.min(w, h);
  const cx = w * (o.cx ?? 0.62);
  const cy = h * 0.5;
  const t = o.t ?? 0;
  const rot = Math.round(R() * 60 - 30) + t * 120;
  const wave = (i) => (o.t === undefined ? 1 : 0.55 + 0.45 * Math.sin(2 * Math.PI * (t * 2 + i / 7)));
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  s += `<g opacity=".18">`;
  const step = m / 16;
  for (let x = step / 2; x < w; x += step) for (let y = step / 2; y < h; y += step) s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(m * 0.002)}" fill="${p.b}"/>`;
  s += `</g>`;
  s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(m * 0.36)}" fill="${p.a}"/>`;
  s += `<path d="M ${f(cx - m * 0.36)} ${f(cy)} A ${f(m * 0.36)} ${f(m * 0.36)} 0 0 0 ${f(cx + m * 0.36)} ${f(cy)} Z" fill="${p.c}" transform="rotate(${rot} ${f(cx)} ${f(cy)})"/>`;
  for (let i = 1; i <= 6; i++) {
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(m * (0.36 + i * 0.06))}" fill="none" stroke="${p.b}" stroke-width="${f(m * 0.003)}" opacity="${f(0.5 - i * 0.07)}" stroke-dasharray="${i % 2 ? `${f(m * 0.02)} ${f(m * 0.012)}` : 'none'}" stroke-dashoffset="${f(t * m * 0.32 * (i % 4 === 1 ? 1 : -1))}"/>`;
  }
  s += `<g transform="rotate(${rot} ${f(cx)} ${f(cy)})">`;
  for (let i = 0; i < 7; i++) {
    const bw = m * (0.02 + 0.05 * R());
    s += `<rect x="${f(w * 0.06 + i * m * 0.09)}" y="${f(cy - m * 0.5)}" width="${f(bw)}" height="${f(m * (0.3 + 0.7 * R()) * wave(i))}" fill="${i % 3 ? p.b : p.a}" opacity="${f(0.1 + 0.5 * R())}"/>`;
  }
  s += `</g>`;
  s += `<rect x="${f(w * 0.06)}" y="${f(h * 0.82)}" width="${f(w * 0.3 * (o.t === undefined ? 1 : Math.min(1, t * 2.5)))}" height="${f(m * 0.012)}" fill="${p.b}"/>`;
  s += `<rect x="${f(w * 0.06)}" y="${f(h * 0.86)}" width="${f(w * 0.18)}" height="${f(m * 0.012)}" fill="${p.b}" opacity=".5"/>`;
  return s;
}

/** Website screen (desktop). variant: home | section */
function ui(w, h, p, R, o) {
  const pad = w * 0.04;
  const variant = o.variant ?? 'home';
  const dark = o.dark === true;
  const surf = dark ? p.mid : '#ffffff';
  const ink = dark ? p.b : p.b;
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  s += `<rect x="${f(pad)}" y="${f(pad)}" width="${f(w - 2 * pad)}" height="${f(h - pad)}" rx="${f(w * 0.008)}" fill="${surf}"/>`;
  s += `<rect x="${f(pad)}" y="${f(pad)}" width="${f(w - 2 * pad)}" height="${f(h * 0.06)}" rx="${f(w * 0.008)}" fill="${ink}" opacity=".08"/>`;
  for (let i = 0; i < 3; i++) s += `<circle cx="${f(pad * 1.6 + i * w * 0.016)}" cy="${f(pad + h * 0.03)}" r="${f(w * 0.005)}" fill="${ink}" opacity=".3"/>`;
  const x0 = pad * 2.2;
  const top = pad + h * 0.06;
  // nav
  s += `<rect x="${f(x0)}" y="${f(top + h * 0.04)}" width="${f(w * 0.08)}" height="${f(h * 0.022)}" fill="${ink}" opacity=".85"/>`;
  for (let i = 0; i < 4; i++) s += `<rect x="${f(w - x0 - w * 0.06 - i * w * 0.075)}" y="${f(top + h * 0.045)}" width="${f(w * 0.05)}" height="${f(h * 0.013)}" fill="${ink}" opacity=".35"/>`;
  if (variant === 'home') {
    s += `<defs><linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.c}"/></linearGradient></defs>`;
    s += `<rect x="${f(w * 0.5)}" y="${f(top + h * 0.12)}" width="${f(w - x0 - w * 0.5)}" height="${f(h * 0.42)}" rx="${f(w * 0.006)}" fill="url(#hero)"/>`;
    s += `<rect x="${f(x0)}" y="${f(top + h * 0.16)}" width="${f(w * 0.36)}" height="${f(h * 0.06)}" fill="${ink}"/>`;
    s += `<rect x="${f(x0)}" y="${f(top + h * 0.24)}" width="${f(w * 0.28)}" height="${f(h * 0.06)}" fill="${ink}"/>`;
    s += `<rect x="${f(x0)}" y="${f(top + h * 0.34)}" width="${f(w * 0.3)}" height="${f(h * 0.016)}" fill="${ink}" opacity=".4"/>`;
    s += `<rect x="${f(x0)}" y="${f(top + h * 0.37)}" width="${f(w * 0.24)}" height="${f(h * 0.016)}" fill="${ink}" opacity=".4"/>`;
    s += `<rect x="${f(x0)}" y="${f(top + h * 0.43)}" width="${f(w * 0.11)}" height="${f(h * 0.055)}" rx="${f(h * 0.01)}" fill="${p.a}"/>`;
    const cw = (w - 2 * x0 - 2 * w * 0.02) / 3;
    for (let c = 0; c < 3; c++) {
      const cx = x0 + c * (cw + w * 0.02);
      s += `<rect x="${f(cx)}" y="${f(top + h * 0.6)}" width="${f(cw)}" height="${f(h * 0.2)}" rx="${f(w * 0.004)}" fill="${ink}" opacity="${c === 1 ? 0.14 : 0.07}"/>`;
      s += `<rect x="${f(cx)}" y="${f(top + h * 0.82)}" width="${f(cw * 0.6)}" height="${f(h * 0.018)}" fill="${ink}" opacity=".6"/>`;
    }
  } else {
    for (let r = 0; r < 3; r++) {
      const y = top + h * (0.12 + r * 0.26);
      const flip = r % 2 === 1;
      const imgX = flip ? x0 : w * 0.52;
      const txtX = flip ? w * 0.52 : x0;
      s += `<rect x="${f(imgX)}" y="${f(y)}" width="${f(w * 0.4 - x0 + pad)}" height="${f(h * 0.2)}" rx="${f(w * 0.004)}" fill="${r === 1 ? p.a : p.c}" opacity="${r === 1 ? 0.85 : 0.55}"/>`;
      s += `<rect x="${f(txtX)}" y="${f(y + h * 0.03)}" width="${f(w * 0.25)}" height="${f(h * 0.035)}" fill="${ink}" opacity=".85"/>`;
      for (let l = 0; l < 3; l++) s += `<rect x="${f(txtX)}" y="${f(y + h * (0.09 + l * 0.03))}" width="${f(w * (0.3 - l * 0.04))}" height="${f(h * 0.012)}" fill="${ink}" opacity=".35"/>`;
    }
  }
  return s;
}

/** Phones side by side (mobile screens). */
function mobile(w, h, p, R, o) {
  const dark = o.dark === true;
  const surf = dark ? p.mid : '#ffffff';
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  const ph = h * 0.84;
  const pw = ph * 0.48;
  const n = 3;
  const gap = (w - n * pw) / (n + 1);
  for (let i = 0; i < n; i++) {
    const x = gap + i * (pw + gap);
    const y = (h - ph) / 2 + (i === 1 ? -h * 0.02 : h * 0.02);
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}" rx="${f(pw * 0.12)}" fill="${p.b}" opacity=".9"/>`;
    s += `<rect x="${f(x + pw * 0.04)}" y="${f(y + pw * 0.04)}" width="${f(pw * 0.92)}" height="${f(ph - pw * 0.08)}" rx="${f(pw * 0.09)}" fill="${surf}"/>`;
    const ix = x + pw * 0.1;
    const iw = pw * 0.8;
    const top = y + ph * 0.08;
    s += `<rect x="${f(ix)}" y="${f(top)}" width="${f(iw)}" height="${f(ph * 0.3)}" rx="${f(pw * 0.03)}" fill="${i === 1 ? p.a : p.c}" opacity="${i === 1 ? 0.9 : 0.6}"/>`;
    s += `<rect x="${f(ix)}" y="${f(top + ph * 0.34)}" width="${f(iw * 0.8)}" height="${f(ph * 0.03)}" fill="${p.b}" opacity="${dark ? 0.9 : 0.85}"/>`;
    for (let l = 0; l < 4; l++) s += `<rect x="${f(ix)}" y="${f(top + ph * (0.4 + l * 0.035))}" width="${f(iw * (0.95 - l * 0.12))}" height="${f(ph * 0.012)}" fill="${p.b}" opacity=".35"/>`;
    s += `<rect x="${f(ix)}" y="${f(top + ph * 0.6)}" width="${f(iw)}" height="${f(ph * 0.06)}" rx="${f(ph * 0.012)}" fill="${p.a}"/>`;
  }
  return s;
}

/** Wireframe sketch. */
function wire(w, h, p, R, o) {
  const ink = o.dark ? p.b : p.b;
  const sw = Math.max(1.5, w * 0.0015);
  let s = `<rect width="${w}" height="${h}" fill="${o.dark ? p.bg : p.bg}"/>`;
  const box = (x, y, bw, bh, cross = false, dash = false) => {
    let b = `<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="${ink}" stroke-opacity=".55" stroke-width="${f(sw)}"${dash ? ` stroke-dasharray="${f(sw * 5)} ${f(sw * 4)}"` : ''}/>`;
    if (cross) b += `<path d="M${f(x)} ${f(y)} L${f(x + bw)} ${f(y + bh)} M${f(x + bw)} ${f(y)} L${f(x)} ${f(y + bh)}" stroke="${ink}" stroke-opacity=".25" stroke-width="${f(sw)}"/>`;
    return b;
  };
  const cols = 2;
  const gap = w * 0.05;
  const fw = (w - gap * (cols + 1)) / cols;
  for (let c = 0; c < cols; c++) {
    const x = gap + c * (fw + gap);
    const y = h * 0.08;
    const fh = h * 0.84;
    s += box(x, y, fw, fh);
    s += box(x + fw * 0.05, y + fh * 0.04, fw * 0.9, fh * 0.06, false, true);
    s += box(x + fw * 0.05, y + fh * 0.14, fw * 0.9, fh * 0.34, true);
    s += `<rect x="${f(x + fw * 0.05)}" y="${f(y + fh * 0.53)}" width="${f(fw * 0.55)}" height="${f(fh * 0.035)}" fill="${ink}" opacity=".5"/>`;
    for (let l = 0; l < 3; l++) s += `<rect x="${f(x + fw * 0.05)}" y="${f(y + fh * (0.6 + l * 0.04))}" width="${f(fw * (0.8 - l * 0.12))}" height="${f(fh * 0.012)}" fill="${ink}" opacity=".25"/>`;
    s += `<rect x="${f(x + fw * 0.05)}" y="${f(y + fh * 0.76)}" width="${f(fw * 0.28)}" height="${f(fh * 0.06)}" fill="${p.a}" opacity=".9"/>`;
    for (let k = 0; k < 3; k++) s += box(x + fw * (0.05 + k * 0.31), y + fh * 0.87, fw * 0.28, fh * 0.09, true);
  }
  // annotation arrows
  for (let i = 0; i < 3; i++) {
    const x = w * (0.2 + 0.3 * R());
    const y = h * (0.2 + 0.6 * R());
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(w * 0.012)}" fill="none" stroke="${p.a}" stroke-width="${f(sw * 1.4)}"/>`;
  }
  return s;
}

/** Editing timeline (abstract, no UI text). */
function timeline(w, h, p, R) {
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  const vw = w * 0.42;
  const vh = vw * 9 / 16;
  const vx = (w - vw) / 2;
  const vy = h * 0.05;
  s += `<defs><linearGradient id="vf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.c}"/><stop offset=".6" stop-color="${p.a}"/><stop offset="1" stop-color="${p.bg}"/></linearGradient></defs>`;
  s += `<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="url(#vf)"/>`;
  s += `<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="none" stroke="${p.b}" stroke-opacity=".2"/>`;
  const panelY = vy + vh + h * 0.05;
  s += `<rect x="0" y="${f(panelY)}" width="${w}" height="${f(h - panelY)}" fill="${p.mid}" opacity=".55"/>`;
  const tracks = 5;
  const th = (h - panelY - h * 0.08) / tracks;
  for (let t = 0; t < tracks; t++) {
    const y = panelY + h * 0.04 + t * th;
    s += `<rect x="${f(w * 0.02)}" y="${f(y + th * 0.15)}" width="${f(w * 0.06)}" height="${f(th * 0.7)}" fill="${p.b}" opacity=".08"/>`;
    let x = w * 0.1 + R() * w * 0.05;
    while (x < w * 0.97) {
      const cw = w * (0.04 + 0.14 * R());
      if (t < 3) {
        const col = t === 0 ? p.c : t === 1 ? p.a : p.b;
        s += `<rect x="${f(x)}" y="${f(y + th * 0.15)}" width="${f(Math.min(cw, w * 0.97 - x))}" height="${f(th * 0.7)}" rx="${f(th * 0.08)}" fill="${col}" opacity="${t === 2 ? 0.3 : 0.75}"/>`;
      } else {
        for (let k = x; k < Math.min(x + cw, w * 0.97); k += w * 0.004) {
          const a = th * 0.32 * (0.2 + R() * 0.8);
          s += `<rect x="${f(k)}" y="${f(y + th / 2 - a)}" width="${f(w * 0.002)}" height="${f(a * 2)}" fill="${p.a}" opacity=".55"/>`;
        }
      }
      x += cw + w * (0.004 + 0.03 * R());
      if (t >= 3) x += w * 0.08;
    }
  }
  const ph = w * (0.35 + 0.3 * R());
  s += `<rect x="${f(ph)}" y="${f(panelY)}" width="${f(Math.max(2, w * 0.0016))}" height="${f(h - panelY)}" fill="${p.b}"/>`;
  return s;
}

/** Compositing node graph. */
function nodes(w, h, p, R) {
  const m = Math.min(w, h);
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/><g opacity=".12">`;
  for (let x = 0; x < w; x += m / 12) s += `<rect x="${f(x)}" y="0" width="1" height="${h}" fill="${p.b}"/>`;
  for (let y = 0; y < h; y += m / 12) s += `<rect x="0" y="${f(y)}" width="${w}" height="1" fill="${p.b}"/>`;
  s += `</g>`;
  const nw = w * 0.15;
  const nh = h * 0.12;
  const pos = [
    [0.08, 0.2], [0.08, 0.6], [0.32, 0.4], [0.55, 0.18], [0.55, 0.62], [0.78, 0.4],
  ].map(([x, y]) => [w * x, h * (y + (R() - 0.5) * 0.06)]);
  const links = [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5]];
  for (const [a, b] of links) {
    const [x1, y1] = [pos[a][0] + nw, pos[a][1] + nh / 2];
    const [x2, y2] = [pos[b][0], pos[b][1] + nh / 2];
    const mx = (x1 + x2) / 2;
    s += `<path d="M${f(x1)} ${f(y1)} C${f(mx)} ${f(y1)} ${f(mx)} ${f(y2)} ${f(x2)} ${f(y2)}" fill="none" stroke="${p.a}" stroke-width="${f(m * 0.004)}" opacity=".8"/>`;
  }
  pos.forEach(([x, y], i) => {
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(nw)}" height="${f(nh)}" rx="${f(m * 0.01)}" fill="${p.mid}" stroke="${p.b}" stroke-opacity=".25"/>`;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(nw)}" height="${f(nh * 0.28)}" rx="${f(m * 0.01)}" fill="${i === 5 ? p.a : i === 2 ? p.c : p.b}" opacity="${i === 5 || i === 2 ? 0.9 : 0.3}"/>`;
    s += `<rect x="${f(x + nw * 0.1)}" y="${f(y + nh * 0.48)}" width="${f(nw * 0.5)}" height="${f(nh * 0.12)}" fill="${p.b}" opacity=".3"/>`;
    s += `<rect x="${f(x + nw * 0.1)}" y="${f(y + nh * 0.7)}" width="${f(nw * 0.7)}" height="${f(nh * 0.08)}" fill="${p.b}" opacity=".15"/>`;
  });
  return s;
}

/** Behind the scenes: studio set with softbox, stand, camera on tripod. No people. */
function set(w, h, p, R, o) {
  const m = Math.min(w, h);
  const sw = Math.max(2, m * 0.006);
  const v = o.variant ?? 0;
  let s = `<defs>
<linearGradient id="floorg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.bg}"/></linearGradient>
<radialGradient id="spill" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p.b}" stop-opacity=".55"/><stop offset="1" stop-color="${p.b}" stop-opacity="0"/></radialGradient>
<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m / 30)}"/></filter>
</defs><rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  s += `<rect x="0" y="${f(h * 0.7)}" width="${w}" height="${f(h * 0.3)}" fill="url(#floorg)"/>`;
  // backdrop sweep
  s += `<path d="M${f(w * 0.3)} 0 L${f(w * 0.7)} 0 L${f(w * 0.7)} ${f(h * 0.62)} Q${f(w * 0.7)} ${f(h * 0.72)} ${f(w * 0.78)} ${f(h * 0.74)} L${f(w * 0.22)} ${f(h * 0.74)} Q${f(w * 0.3)} ${f(h * 0.72)} ${f(w * 0.3)} ${f(h * 0.62)} Z" fill="${v === 1 ? p.a : p.c}" opacity=".28"/>`;
  // softbox on stand
  const sx = w * (v === 2 ? 0.72 : 0.18);
  const sy = h * 0.22;
  const bw = m * 0.28;
  const bh = m * 0.36;
  s += `<ellipse cx="${f(sx + bw * 0.6)}" cy="${f(sy + bh / 2)}" rx="${f(bw * 1.6)}" ry="${f(bh * 1.2)}" fill="url(#spill)"/>`;
  s += `<g transform="rotate(${v === 2 ? -12 : 12} ${f(sx)} ${f(sy + bh / 2)})"><rect x="${f(sx - bw / 2)}" y="${f(sy)}" width="${f(bw)}" height="${f(bh)}" fill="${p.b}" filter="url(#bloom)" opacity=".8"/><rect x="${f(sx - bw / 2)}" y="${f(sy)}" width="${f(bw)}" height="${f(bh)}" fill="${p.b}" opacity=".92"/></g>`;
  s += `<line x1="${f(sx)}" y1="${f(sy + bh)}" x2="${f(sx)}" y2="${f(h * 0.86)}" stroke="${p.b}" stroke-opacity=".5" stroke-width="${f(sw)}"/>`;
  for (const dx of [-1, 0.2, 1]) s += `<line x1="${f(sx)}" y1="${f(h * 0.8)}" x2="${f(sx + dx * m * 0.09)}" y2="${f(h * 0.9)}" stroke="${p.b}" stroke-opacity=".5" stroke-width="${f(sw)}"/>`;
  // camera on tripod
  const cx = w * (v === 2 ? 0.3 : 0.62) + (R() - 0.5) * w * 0.05;
  const cy = h * 0.5;
  s += `<rect x="${f(cx - m * 0.07)}" y="${f(cy - m * 0.05)}" width="${f(m * 0.14)}" height="${f(m * 0.1)}" rx="${f(m * 0.01)}" fill="${p.mid}" stroke="${p.b}" stroke-opacity=".35" stroke-width="${f(sw * 0.6)}"/>`;
  s += `<rect x="${f(cx + (v === 2 ? m * 0.07 : -m * 0.13))}" y="${f(cy - m * 0.035)}" width="${f(m * 0.06)}" height="${f(m * 0.07)}" rx="${f(m * 0.008)}" fill="${p.bg}" stroke="${p.b}" stroke-opacity=".35" stroke-width="${f(sw * 0.6)}"/>`;
  s += `<circle cx="${f(cx + m * 0.04)}" cy="${f(cy - m * 0.02)}" r="${f(m * 0.008)}" fill="${p.a}"/>`;
  s += `<line x1="${f(cx)}" y1="${f(cy + m * 0.05)}" x2="${f(cx)}" y2="${f(cy + m * 0.12)}" stroke="${p.b}" stroke-opacity=".5" stroke-width="${f(sw)}"/>`;
  for (const dx of [-1, 0.15, 1]) s += `<line x1="${f(cx)}" y1="${f(cy + m * 0.12)}" x2="${f(cx + dx * m * 0.12)}" y2="${f(h * 0.92)}" stroke="${p.b}" stroke-opacity=".5" stroke-width="${f(sw)}"/>`;
  // cable
  s += `<path d="M${f(sx)} ${f(h * 0.9)} C${f(w * 0.4)} ${f(h * 0.97)} ${f(w * 0.5)} ${f(h * 0.86)} ${f(cx)} ${f(h * 0.93)}" fill="none" stroke="${p.b}" stroke-opacity=".25" stroke-width="${f(sw * 0.6)}"/>`;
  // practical light dots
  for (let i = 0; i < 5; i++) s += `<circle cx="${f(w * (0.35 + 0.3 * R()))}" cy="${f(h * (0.12 + 0.3 * R()))}" r="${f(m * 0.012)}" fill="${p.a}" opacity=".7" filter="url(#bloom)"/>`;
  return s + vignette(w, h, p, 0.85);
}

/** Colour/mood board: chips + gradient strips + mini frames. */
function swatch(w, h, p, R) {
  const cols = [p.bg, p.mid, p.c, p.a, p.b];
  let s = `<rect width="${w}" height="${h}" fill="${p.mid}"/>`;
  const pad = w * 0.05;
  const cw = (w - pad * 2 - (cols.length - 1) * w * 0.015) / cols.length;
  cols.forEach((c, i) => {
    s += `<rect x="${f(pad + i * (cw + w * 0.015))}" y="${f(h * 0.08)}" width="${f(cw)}" height="${f(h * 0.36)}" fill="${c}" stroke="${p.b}" stroke-opacity=".15"/>`;
  });
  s += `<defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="${p.bg}"/><stop offset=".5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.a}"/></linearGradient><linearGradient id="g2" x1="0" x2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient></defs>`;
  s += `<rect x="${f(pad)}" y="${f(h * 0.5)}" width="${f(w - pad * 2)}" height="${f(h * 0.08)}" fill="url(#g1)"/>`;
  s += `<rect x="${f(pad)}" y="${f(h * 0.6)}" width="${f(w - pad * 2)}" height="${f(h * 0.05)}" fill="url(#g2)"/>`;
  const fw = (w - pad * 2 - 3 * w * 0.015) / 4;
  for (let i = 0; i < 4; i++) {
    const x = pad + i * (fw + w * 0.015);
    const y = h * 0.71;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(fw)}" height="${f(h * 0.21)}" fill="${p.bg}"/>`;
    s += `<circle cx="${f(x + fw * (0.3 + 0.4 * R()))}" cy="${f(y + h * 0.1)}" r="${f(h * 0.06)}" fill="${[p.a, p.c, p.b, p.a][i]}" opacity=".8"/>`;
  }
  return s;
}

/** Storyboard: 2x3 panels with simple compositions. */
function storyboard(w, h, p, R, o) {
  const vertical = o.vertical === true;
  let s = `<rect width="${w}" height="${h}" fill="${p.mid}"/>`;
  const cols = vertical ? 4 : 3;
  const rows = 2;
  const gap = w * 0.03;
  const pw = (w - gap * (cols + 1)) / cols;
  const ph = vertical ? Math.min(pw * 16 / 9, (h - gap * 3) / 2) : pw * 9 / 16;
  const totalH = rows * ph + (rows - 1) * gap;
  const y0 = (h - totalH) / 2;
  const sw = Math.max(1.5, w * 0.0018);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gap + c * (pw + gap);
      const y = y0 + r * (ph + gap);
      const k = r * cols + c;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}" fill="${p.bg}" stroke="${p.b}" stroke-opacity=".35" stroke-width="${f(sw)}"/>`;
      const kind = k % 4;
      if (kind === 0) s += `<polygon points="${f(x + pw * 0.45)},${f(y)} ${f(x + pw * 0.55)},${f(y)} ${f(x + pw * 0.8)},${f(y + ph)} ${f(x + pw * 0.2)},${f(y + ph)}" fill="${p.a}" opacity=".45"/>`;
      if (kind === 1) s += `<circle cx="${f(x + pw * (0.3 + 0.4 * R()))}" cy="${f(y + ph * 0.5)}" r="${f(Math.min(pw, ph) * 0.22)}" fill="none" stroke="${p.b}" stroke-width="${f(sw * 1.5)}" opacity=".7"/>`;
      if (kind === 2) s += `<path d="M${f(x)} ${f(y + ph * 0.7)} L${f(x + pw * 0.3)} ${f(y + ph * 0.5)} L${f(x + pw * 0.55)} ${f(y + ph * 0.65)} L${f(x + pw)} ${f(y + ph * 0.4)}" fill="none" stroke="${p.b}" stroke-width="${f(sw * 1.5)}" opacity=".6"/>`;
      if (kind === 3) s += `<rect x="${f(x + pw * 0.2)}" y="${f(y + ph * 0.25)}" width="${f(pw * 0.6)}" height="${f(ph * 0.5)}" fill="${p.c}" opacity=".55"/>`;
      // camera move arrow
      s += `<path d="M${f(x + pw * 0.1)} ${f(y + ph * 0.88)} L${f(x + pw * 0.4)} ${f(y + ph * 0.88)}" stroke="${p.a}" stroke-width="${f(sw * 1.4)}"/>`;
      s += `<polygon points="${f(x + pw * 0.1)},${f(y + ph * 0.88)} ${f(x + pw * 0.15)},${f(y + ph * 0.85)} ${f(x + pw * 0.15)},${f(y + ph * 0.91)}" fill="${p.a}"/>`;
    }
  }
  return s;
}

/** Top-down camera plan for a live session: stage, positions, camera cones. */
function floorplan(w, h, p, R) {
  const m = Math.min(w, h);
  const sw = Math.max(1.5, m * 0.003);
  let s = `<rect width="${w}" height="${h}" fill="${p.bg}"/><g opacity=".1">`;
  for (let x = 0; x < w; x += m / 20) s += `<rect x="${f(x)}" y="0" width="1" height="${h}" fill="${p.b}"/>`;
  for (let y = 0; y < h; y += m / 20) s += `<rect x="0" y="${f(y)}" width="${w}" height="1" fill="${p.b}"/>`;
  s += `</g>`;
  const sx = w * 0.25;
  const sy = h * 0.15;
  const sW = w * 0.5;
  const sH = h * 0.42;
  s += `<rect x="${f(sx)}" y="${f(sy)}" width="${f(sW)}" height="${f(sH)}" fill="${p.mid}" stroke="${p.b}" stroke-opacity=".5" stroke-width="${f(sw)}"/>`;
  const spots = [[0.3, 0.45], [0.5, 0.3], [0.7, 0.45], [0.5, 0.65]];
  for (const [u, v] of spots) {
    s += `<circle cx="${f(sx + sW * u)}" cy="${f(sy + sH * v)}" r="${f(m * 0.035)}" fill="${p.b}" opacity=".85"/>`;
  }
  const cams = [[0.15, 0.85, 40], [0.5, 0.92, 0], [0.85, 0.85, -40], [0.92, 0.3, -90]];
  cams.forEach(([u, v, rot], i) => {
    const cx = w * u;
    const cy = h * v;
    const len = m * 0.38;
    s += `<g transform="rotate(${rot} ${f(cx)} ${f(cy)})"><polygon points="${f(cx)},${f(cy)} ${f(cx - len * 0.35)},${f(cy - len)} ${f(cx + len * 0.35)},${f(cy - len)}" fill="${i === 1 ? p.a : p.c}" opacity=".22"/><rect x="${f(cx - m * 0.025)}" y="${f(cy - m * 0.015)}" width="${f(m * 0.05)}" height="${f(m * 0.035)}" fill="${i === 1 ? p.a : p.b}"/></g>`;
  });
  s += `<path d="M${f(w * 0.1)} ${f(h * 0.62)} C${f(w * 0.3)} ${f(h * 0.75)} ${f(w * 0.7)} ${f(h * 0.75)} ${f(w * 0.9)} ${f(h * 0.62)}" fill="none" stroke="${p.a}" stroke-width="${f(sw)}" stroke-dasharray="${f(sw * 4)} ${f(sw * 3)}"/>`;
  return s;
}

export const painters = { stage, horizon, bokeh, geo, ui, mobile, wire, timeline, nodes, set, swatch, storyboard, floorplan };

export function svg(w, h, painter, palette, seed, opts = {}) {
  const p = palettes[palette];
  if (!p) throw new Error(`unknown palette ${palette}`);
  const fn = painters[painter];
  if (!fn) throw new Error(`unknown painter ${painter}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fn(w, h, p, rnd(seed), opts)}</svg>`;
}
