// Muted preview loops. Desktop: hover/focus. Touch: the card that is >=60% in view (one at a time).
// Never under prefers-reduced-motion or Save-Data. Nothing is fetched before hover/view:
// the <video> has no src until then (preload="none"), and the poster <picture> stays the LCP element.
type Conn = { saveData?: boolean };
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const saveData = (navigator as Navigator & { connection?: Conn }).connection?.saveData === true;
const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video.work-card__preview'));

function load(v: HTMLVideoElement) {
  if (v.dataset.loaded) return;
  v.dataset.loaded = '1';
  for (const [src, type] of [
    [v.dataset.webm, 'video/webm'],
    [v.dataset.mp4, 'video/mp4'],
  ] as const) {
    if (!src) continue;
    const s = document.createElement('source');
    s.src = src;
    s.type = type;
    v.append(s);
  }
  v.load();
}
function play(v: HTMLVideoElement) {
  // Skip hidden thumbnails (e.g. the index direction hides row thumbs).
  if (reduce.matches || v.offsetParent === null) return;
  load(v);
  v.muted = true;
  v.play().catch(() => {
    /* autoplay refused: poster stays */
  });
}
function stop(v: HTMLVideoElement) {
  v.pause();
  v.removeAttribute('data-playing');
}

if (videos.length && !saveData) {
  videos.forEach((v) => v.addEventListener('playing', () => v.setAttribute('data-playing', '')));
  reduce.addEventListener('change', (e) => e.matches && videos.forEach(stop));

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    for (const v of videos) {
      const card = v.closest('.work-card, .index-row');
      if (!card) continue;
      card.addEventListener('pointerenter', () => play(v));
      card.addEventListener('pointerleave', () => stop(v));
      card.addEventListener('focusin', () => play(v));
      card.addEventListener('focusout', () => stop(v));
    }
  } else {
    const ratios = new Map<HTMLVideoElement, number>();
    let current: HTMLVideoElement | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(e.target as HTMLVideoElement, e.intersectionRatio);
        let best: HTMLVideoElement | undefined;
        let bestRatio = 0.6;
        for (const [v, r] of ratios) if (r >= bestRatio) (best = v), (bestRatio = r);
        if (best === current) return;
        if (current) stop(current);
        current = best;
        if (best) play(best);
      },
      { threshold: [0, 0.6, 0.8, 1] },
    );
    videos.forEach((v) => io.observe(v));
  }
}
