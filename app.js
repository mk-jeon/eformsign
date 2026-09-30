/* 안내 가이드 뷰어 — guide.json(같은 폴더)을 읽어 화면을 그린다.
 * 보안 원칙: 데이터는 textContent로만 삽입(innerHTML 금지) · 이미지 경로는 assets/ 안의 파일명만 허용 · 같은 출처 fetch만 사용 · 외부 스크립트 없음.
 */
'use strict';

// 폴더 주소가 슬래시 없이 열리면(예: /eformsign) 상대경로 자산이 사이트 루트에서 찾아져 깨지므로 /eformsign/ 로 보정 (S3·CloudFront 등 자동 리다이렉트가 없는 호스팅 대응)
(function () {
  var p = location.pathname;
  if (location.protocol !== 'file:' && !/\/$/.test(p) && !/\.[a-z0-9]+$/i.test(p)) location.replace(p + '/' + location.search + location.hash);
})();

const $ = (id) => document.getElementById(id);
const pct = (v) => (v * 100).toFixed(3) + '%';

/* ---------------- 데이터 검증 (guide.json 스키마 v1) ---------------- */
const IMG_RE = /^assets\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function str(v, d) { return typeof v === 'string' ? v : d; }
function num(v, lo, hi, d) { return (typeof v === 'number' && v >= lo && v <= hi) ? v : d; }
function box(b) {
  if (!b || typeof b !== 'object') return null;
  const x = num(b.x, 0, 1), y = num(b.y, 0, 1), w = num(b.w, 0, 1), h = num(b.h, 0, 1);
  if ([x, y, w, h].some(v => v === undefined)) return null;
  return { x, y, w, h, label: str(b.label, ''), soft: b.soft === true };
}
function validate(g) {
  if (!g || typeof g !== 'object' || g.version !== 1) throw new Error('지원하지 않는 형식입니다 (version 1 필요).');
  if (!Array.isArray(g.steps) || g.steps.length < 1) throw new Error('steps 가 비어 있습니다.');
  const steps = g.steps.map((s, i) => {
    if (!s || typeof s !== 'object') throw new Error('steps[' + i + '] 형식 오류');
    if (!IMG_RE.test(s.image || '')) throw new Error('steps[' + i + '].image 는 assets/파일명.jpg 형식이어야 합니다.');
    const tap = s.tap && typeof s.tap === 'object' ? { x: num(s.tap.x, 0, 1), y: num(s.tap.y, 0, 1) } : null;
    return {
      image: s.image, phase: str(s.phase, ''), title: str(s.title, ''), caption: str(s.caption, ''), note: str(s.note, ''),
      hi: (Array.isArray(s.highlights) ? s.highlights : []).map(box).filter(Boolean),
      blur: (Array.isArray(s.blurs) ? s.blurs : []).map(box).filter(Boolean),
      tap: (tap && tap.x !== undefined && tap.y !== undefined) ? tap : null
    };
  });
  const cover = g.cover && typeof g.cover === 'object' ? g.cover : {};
  const end = g.end && typeof g.end === 'object' ? g.end : {};
  return {
    brand: str(g.brand, ''), title: str(g.title, '안내 가이드'), subtitle: str(g.subtitle, ''),
    notice: str(g.notice, ''), autoplayMs: num(g.autoplayMs, 2000, 60000, 7000),
    hiColor: COLOR_RE.test(g.highlightColor || '') ? g.highlightColor : '#ff3b30', dim: num(g.dim, 0, 0.9, 0.5),
    cover: { show: cover.show !== false, heading: str(cover.heading, str(g.title, '안내 가이드')), body: str(cover.body, ''), duration: str(cover.duration, ''), button: str(cover.button, '시작하기'), hint: str(cover.hint, '') },
    end: { heading: str(end.heading, '안내가 모두 끝났습니다'), body: str(end.body, ''), restart: str(end.restart, '처음부터 다시 보기'), exit: str(end.exit, '끝내기') },
    steps
  };
}

/* ---------------- 상태 ---------------- */
let G = null;                                   // 검증된 가이드
let imgOverride = null;                         // 제작 도구 미리보기용 blob URL 매핑 {image: url}
const state = { i: 0, dim: true, zoom: false, playing: false, rail: false };
let timer = null, lap = 0, lapPrev = 0;         // 자동재생: lap = 현재 바퀴 진행률 0~1
let deepLinked = false;

const src = (st) => (imgOverride && imgOverride[st.image]) || st.image;

/* ---------------- 렌더 ---------------- */
function setText(id, v) { $(id).textContent = v; }
function applyMeta() {
  document.title = G.title;
  document.documentElement.style.setProperty('--hi', G.hiColor);
  setText('brand', G.brand); setText('title', G.title); setText('subtitle', G.subtitle ? G.subtitle + ' ' : '');
  setText('totalTxt', G.steps.length); setText('cntTotal', G.steps.length); setText('notice', G.notice);
  setText('coverBrand', G.brand); setText('coverHeading', G.cover.heading); setText('coverBody', G.cover.body);
  setText('coverTotal', G.steps.length); setText('coverDuration', G.cover.duration); setText('bStart', G.cover.button); setText('coverHint', G.cover.hint);
  $('coverDuration').hidden = !G.cover.duration;
  setText('endHeading', G.end.heading); setText('endBody', G.end.body); setText('bRestart', G.end.restart); setText('bExit', G.end.exit);
}
function buildRail() {
  const names = []; G.steps.forEach(s => { if (!names.includes(s.phase)) names.push(s.phase); });
  const host = $('groups'); host.textContent = '';
  names.forEach(name => {
    const g = document.createElement('div'); g.className = 'grp';
    const gn = document.createElement('div'); gn.className = 'gn'; gn.textContent = name; g.appendChild(gn);
    G.steps.forEach((s, idx) => {
      if (s.phase !== name) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'it'; b.dataset.idx = idx;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = idx + 1;
      const t = document.createElement('span'); t.textContent = s.title;
      b.appendChild(n); b.appendChild(t);
      b.addEventListener('click', () => { go(idx); setRail(false); });
      g.appendChild(b);
    });
    host.appendChild(g);
  });
}
function preload(i) { if (i >= 0 && i < G.steps.length) { const im = new Image(); im.src = src(G.steps[i]); } }
function render() {
  const i = state.i, st = G.steps[i], hi = st.hi, s = src(st);
  $('shot').src = s; $('shot').alt = st.title;
  setText('stepNo', i + 1); setText('cnt', i + 1);
  setText('phase', st.phase); setText('caption', st.caption); setText('note', st.note);
  $('prog').style.width = ((i + 1) / G.steps.length * 100) + '%';
  $('bPrev').disabled = i === 0; setText('bNext', i === G.steps.length - 1 ? '끝 ✓' : '다음 →');
  document.documentElement.style.setProperty('--dim', state.dim ? G.dim : 0);

  const L = $('layers'); L.textContent = '';
  hi.forEach(b => {
    const d = document.createElement('div'); d.className = 'box ' + (b.soft ? 'soft' : 'hard');
    d.style.left = pct(b.x); d.style.top = pct(b.y); d.style.width = pct(b.w); d.style.height = pct(b.h);
    if (state.dim) {
      d.style.backgroundImage = 'url("' + s.replace(/["\\]/g, '') + '")';
      d.style.backgroundSize = (100 / b.w).toFixed(2) + '% ' + (100 / b.h).toFixed(2) + '%';
      d.style.backgroundPosition = (b.w >= 1 ? 50 : (b.x / (1 - b.w)) * 100).toFixed(2) + '% ' + (b.h >= 1 ? 50 : (b.y / (1 - b.h)) * 100).toFixed(2) + '%';
    }
    if (b.label) {
      const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = b.label;
      const top = (b.h >= .05 || b.y < .06);
      lab.style.left = b.x < .06 ? '6px' : '0px';
      lab.style.top = top ? 'clamp(2px,1.2cqi,6px)' : 'auto';
      lab.style.bottom = top ? 'auto' : 'calc(100% + clamp(2px,1.2cqi,6px))';
      d.appendChild(lab);
    }
    L.appendChild(d);
  });
  st.blur.forEach(p => {
    const d = document.createElement('div'); d.className = 'blur';
    d.style.left = pct(p.x); d.style.top = pct(p.y); d.style.width = pct(p.w); d.style.height = pct(p.h);
    L.appendChild(d);
  });
  if (st.tap) { const t = document.createElement('div'); t.className = 'tap'; t.style.left = pct(st.tap.x); t.style.top = pct(st.tap.y); L.appendChild(t); }

  const focus = hi.length ? hi[hi.length - 1] : null;
  const z = $('zoom');
  z.style.transformOrigin = focus ? pct(focus.x + focus.w / 2) + ' ' + pct(focus.y + focus.h / 2) : '50% 50%';
  z.style.transform = (state.zoom && focus) ? 'scale(1.55)' : 'scale(1)';

  document.querySelectorAll('.it').forEach(b => b.classList.toggle('on', +b.dataset.idx === i));
  $('bDim').classList.toggle('on', state.dim); $('bZoom').classList.toggle('on', state.zoom);
  $('bPlay').classList.toggle('on', state.playing); setText('playLbl', state.playing ? '자동재생 중지' : '자동재생');
  if (!imgOverride) history.replaceState(null, '', '#step-' + (i + 1));
  preload(i + 1); preload(i + 2);
}

function go(n) { pinch.reset(false); lap = 0; state.i = Math.max(0, Math.min(G.steps.length - 1, n)); render(); }

/* ---------------- 자동재생: 버튼 테두리 링(한 바퀴 = autoplayMs) ---------------- */
function buildRing() {
  const b = $('bPlay'), w = b.offsetWidth, h = b.offsetHeight, o = 1;
  if (!w || !h) return;
  const W = w, H = h, r = (H - 2 * o) / 2, x0 = o, x1 = W - o, y0 = o, y1 = H - o;
  $('ring').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  $('ringPath').setAttribute('d',
    'M' + (W / 2) + ',' + y0 + ' H' + (x1 - r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x1 - r) + ',' + y1 +
    ' H' + (x0 + r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x0 + r) + ',' + y0 + ' Z');
}
function drawRing() { $('ringPath').setAttribute('stroke-dashoffset', (-100 * Math.min(1, lap)).toFixed(2)); }
function tick() {
  if (!state.playing) return;
  const now = performance.now(), dt = Math.max(0, Math.min(250, now - lapPrev)); lapPrev = now;
  const paused = state.rail || pinch.zoomed() || !$('cover').classList.contains('hide') || $('end').classList.contains('on');
  if (!paused) lap += dt / G.autoplayMs;
  if (lap >= 1) {
    if (state.i >= G.steps.length - 1) { lap = 1; drawRing(); setPlay(false); showEnd(true); return; }
    go(state.i + 1);
  }
  drawRing();
}
function setPlay(on) {
  if (timer) { clearInterval(timer); timer = null; }
  state.playing = on; lap = 0;
  render(); buildRing(); drawRing();
  if (on) { lapPrev = performance.now(); timer = setInterval(tick, 33); }
}
function setRail(on) { state.rail = on; $('rail').classList.toggle('open', on); $('backdrop').classList.toggle('on', on); $('tab').classList.toggle('open', on); $('tab').textContent = on ? '◀ 닫기' : '진행 순서 ▶'; }

/* ---------------- 표지 · 종료 ---------------- */
function hideCover() { $('cover').classList.add('hide'); }
function showEnd(on) { if (on && state.playing) setPlay(false); $('end').classList.toggle('on', on); $('end').classList.remove('nofb'); }

/* ---------------- 핀치 줌 · 이동 · 두 번 탭 · 스와이프 ---------------- */
const pinch = (function () {
  const el = $('phone'), pz = $('pz');
  const MAX = 4, DBL = 2.5;
  let s = 1, tx = 0, ty = 0, g = null;
  let lastTap = 0, lastTapX = 0, lastTapY = 0, suppressClick = false;
  const rect = () => el.getBoundingClientRect();
  function clamp() { const r = rect(); s = Math.max(1, Math.min(MAX, s)); tx = Math.min(0, Math.max(r.width - r.width * s, tx)); ty = Math.min(0, Math.max(r.height - r.height * s, ty)); }
  function apply(anim) {
    clamp(); pz.classList.toggle('anim', !!anim);
    pz.style.transform = s === 1 ? '' : 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
    el.classList.toggle('zoomed', s > 1.01); $('zTxt').textContent = s.toFixed(1) + '×';
  }
  function reset(anim) { s = 1; tx = 0; ty = 0; g = null; apply(anim); }
  function zoomAt(cx, cy, ns, anim) { const px = (cx - tx) / s, py = (cy - ty) / s; s = Math.max(1, Math.min(MAX, ns)); tx = cx - px * s; ty = cy - py * s; apply(anim); }
  const zoomed = () => s > 1.01;
  const pt = (t, r) => ({ x: t.clientX - r.left, y: t.clientY - r.top });

  el.addEventListener('touchstart', e => {
    const r = rect(); pz.classList.remove('anim');
    if (e.touches.length >= 2) {
      const a = pt(e.touches[0], r), b = pt(e.touches[1], r), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      g = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: s, px: (mx - tx) / s, py: (my - ty) / s, multi: true };
      if (state.playing) setPlay(false); e.preventDefault();
    } else {
      const a = pt(e.touches[0], r);
      g = { type: zoomed() ? 'pan' : 'swipe', x0: a.x, y0: a.y, tx0: tx, ty0: ty, t0: Date.now(), moved: 0, multi: false };
    }
  }, { passive: false });
  el.addEventListener('touchmove', e => {
    if (!g) return; const r = rect();
    if (g.type === 'pinch' && e.touches.length >= 2) {
      const a = pt(e.touches[0], r), b = pt(e.touches[1], r), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      s = Math.max(1, Math.min(MAX, g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0)); tx = mx - g.px * s; ty = my - g.py * s; apply(false); e.preventDefault();
    } else if (g.type === 'pan' && e.touches.length === 1) {
      const a = pt(e.touches[0], r); g.moved = Math.max(g.moved, Math.hypot(a.x - g.x0, a.y - g.y0));
      tx = g.tx0 + (a.x - g.x0); ty = g.ty0 + (a.y - g.y0); apply(false); e.preventDefault();
    } else if (g.type === 'swipe') { const a = pt(e.touches[0], r); g.moved = Math.max(g.moved, Math.hypot(a.x - g.x0, a.y - g.y0)); }
  }, { passive: false });
  el.addEventListener('touchend', e => {
    if (!g) return; const r = rect();
    if (e.touches.length >= 1) { const a = pt(e.touches[0], r); g = { type: 'pan', x0: a.x, y0: a.y, tx0: tx, ty0: ty, t0: Date.now(), moved: 99, multi: true }; return; }
    const was = g; g = null;
    if (was.multi || was.type === 'pinch') { if (s < 1.06) reset(true); suppressClick = true; e.preventDefault(); return; }
    const t = e.changedTouches[0], a = pt(t, r), dx = a.x - was.x0, dy = a.y - was.y0, dt = Date.now() - was.t0;
    if (was.moved < 10 && dt < 300) {
      const now = Date.now();
      if (now - lastTap < 320 && Math.hypot(a.x - lastTapX, a.y - lastTapY) < 40) {
        lastTap = 0; suppressClick = true; e.preventDefault();
        if (zoomed()) reset(true); else { if (state.playing) setPlay(false); zoomAt(a.x, a.y, DBL, true); }
        return;
      }
      lastTap = now; lastTapX = a.x; lastTapY = a.y; return;
    }
    if (was.type === 'pan') { suppressClick = true; e.preventDefault(); return; }
    if (!zoomed() && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800) { suppressClick = true; if (state.playing) setPlay(false); go(state.i + (dx < 0 ? 1 : -1)); }
  }, { passive: false });
  el.addEventListener('touchcancel', () => { g = null; if (s < 1.06) reset(true); });
  el.addEventListener('wheel', e => {
    if (!e.ctrlKey && !zoomed()) return; e.preventDefault(); const r = rect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), false); if (s < 1.02) reset(false);
  }, { passive: false });
  el.addEventListener('dblclick', e => { if (e.target.closest('.zreset')) return; const r = rect(); if (zoomed()) reset(true); else zoomAt(e.clientX - r.left, e.clientY - r.top, DBL, true); });
  let md = null;
  el.addEventListener('mousedown', e => { if (!zoomed() || e.button !== 0 || e.target.closest('.zreset')) return; md = { x: e.clientX, y: e.clientY, tx0: tx, ty0: ty, moved: 0 }; pz.classList.remove('anim'); e.preventDefault(); });
  window.addEventListener('mousemove', e => { if (!md) return; md.moved = Math.max(md.moved, Math.hypot(e.clientX - md.x, e.clientY - md.y)); tx = md.tx0 + e.clientX - md.x; ty = md.ty0 + e.clientY - md.y; apply(false); });
  window.addEventListener('mouseup', () => { if (md && md.moved > 4) suppressClick = true; md = null; });
  $('bZReset').addEventListener('click', e => { e.stopPropagation(); reset(true); });
  el.addEventListener('click', e => { if (suppressClick) { suppressClick = false; return; } if (e.target.closest('.zreset')) return; if (state.zoom) { state.zoom = false; render(); } });
  window.addEventListener('resize', () => apply(false));
  return { reset, zoomed };
})();

/* ---------------- 진행 순서 탭: 클릭 토글 + 드래그 ---------------- */
(function () {
  const tab = $('tab'), rail = $('rail'), bd = $('backdrop');
  const W = () => rail.getBoundingClientRect().width;
  let x0 = null, dragging = false, startOpen = false, pid = null;
  tab.addEventListener('pointerdown', e => { x0 = e.clientX; dragging = false; startOpen = state.rail; pid = e.pointerId; try { tab.setPointerCapture(pid); } catch (err) {} });
  tab.addEventListener('pointermove', e => {
    if (x0 === null) return; const dx = e.clientX - x0;
    if (!dragging && Math.abs(dx) < 6) return; dragging = true;
    const w = W(), off = Math.max(-w, Math.min(0, (startOpen ? 0 : -w) + dx));
    rail.classList.add('drag'); tab.classList.add('drag'); bd.classList.add('drag');
    rail.style.transform = 'translateX(' + off + 'px)'; tab.style.left = (w + off) + 'px'; tab.style.animation = 'none';
    bd.classList.add('on'); bd.style.opacity = String(1 + off / w);
  });
  const finish = e => {
    if (x0 === null) return; const dx = e.clientX - x0, w = W();
    rail.classList.remove('drag'); tab.classList.remove('drag'); bd.classList.remove('drag');
    rail.style.transform = ''; tab.style.left = ''; tab.style.animation = ''; bd.style.opacity = '';
    if (!dragging) setRail(!state.rail); else if (startOpen) setRail(dx > -w * 0.3); else setRail(dx > w * 0.3);
    x0 = null; dragging = false; try { tab.releasePointerCapture(pid); } catch (err) {}
  };
  tab.addEventListener('pointerup', finish); tab.addEventListener('pointercancel', finish);
})();

/* ---------------- 이벤트 ---------------- */
$('bPrev').addEventListener('click', () => go(state.i - 1));
$('bNext').addEventListener('click', () => { if (state.i >= G.steps.length - 1) showEnd(true); else go(state.i + 1); });
$('bDim').addEventListener('click', () => { state.dim = !state.dim; render(); });
$('bZoom').addEventListener('click', () => { pinch.reset(true); state.zoom = !state.zoom; render(); });
$('bPlay').addEventListener('click', () => setPlay(!state.playing));
$('bClose').addEventListener('click', () => setRail(false));
$('backdrop').addEventListener('click', () => setRail(false));
$('bStart').addEventListener('click', hideCover);
$('bRestart').addEventListener('click', () => { showEnd(false); go(0); });
$('bExit').addEventListener('click', () => {
  try { window.close(); } catch (e) {}
  setTimeout(() => { if (window.closed || document.visibilityState === 'hidden') return; $('end').classList.add('nofb'); }, 250);
});
$('end').addEventListener('click', e => { if (e.target === $('end')) showEnd(false); });
window.addEventListener('keydown', e => {
  if (!G) return;
  if (e.key === 'ArrowRight') go(state.i + 1); if (e.key === 'ArrowLeft') go(state.i - 1);
  if (e.key === 'Escape') { setRail(false); showEnd(false); }
  if (e.key === 'Enter' && !$('cover').classList.contains('hide')) hideCover();
});
window.addEventListener('resize', buildRing);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildRing);

/* ---------------- 시작 ---------------- */
function boot(data, override) {
  G = validate(data); imgOverride = override || null;
  if (timer) { clearInterval(timer); timer = null; } state.playing = false; state.zoom = false; pinch.reset(false);
  applyMeta(); buildRail();
  const m = location.hash.match(/step-(\d+)/);
  if (m && !override) { state.i = Math.max(0, Math.min(G.steps.length - 1, +m[1] - 1)); deepLinked = true; }
  state.i = Math.min(state.i, G.steps.length - 1);
  $('app').hidden = false; $('loadErr').hidden = true;
  $('cover').classList.toggle('hide', deepLinked || !G.cover.show || !!override);
  render(); buildRing();
}
function fail(msg) { $('app').hidden = true; $('loadErr').hidden = false; $('loadErrMsg').textContent = msg; }

// 제작 도구(같은 출처, iframe) 미리보기: {type:'guide', data, images:{ 'assets/s01.jpg': 'blob:...' }}
window.addEventListener('message', e => {
  if (e.origin !== location.origin || window.parent === window) return;
  const d = e.data;
  if (!d || d.type !== 'guide') return;
  try {
    const imgs = {};
    if (d.images && typeof d.images === 'object') for (const k of Object.keys(d.images)) if (IMG_RE.test(k) && /^blob:/.test(d.images[k])) imgs[k] = d.images[k];
    if (typeof d.step === 'number') state.i = d.step;
    boot(d.data, imgs);
  } catch (err) { fail(err.message); }
});

if (window.parent !== window && new URLSearchParams(location.search).get('preview') === '1') {
  window.parent.postMessage({ type: 'viewer-ready' }, location.origin);   // 제작 도구가 데이터를 보내줄 때까지 대기
} else {
  fetch('guide.json', { cache: 'no-cache', credentials: 'omit' })
    .then(r => { if (!r.ok) throw new Error('guide.json 을 찾을 수 없습니다 (' + r.status + ')'); return r.json(); })
    .then(d => boot(d, null))
    .catch(err => fail(location.protocol === 'file:' ? '파일로 직접 열면 데이터를 읽을 수 없습니다. 웹 서버(또는 제작 도구 미리보기)로 열어 주세요.' : err.message));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
