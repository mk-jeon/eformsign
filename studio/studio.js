/* 가이드 제작 도구 — guide.json(v1) + 이미지 폴더를 만들고, 뷰어 파일과 함께 배포용 zip으로 내보낸다.
 * 서버·외부 라이브러리 없음. 데이터는 브라우저 IndexedDB 에 자동 저장(초안).
 */
'use strict';
const $ = (id) => document.getElementById(id);
const IMG_W = 810;                   // 내보내기 이미지 폭(모바일 최적)
const JPEG_Q = 0.85;
const VIEWER_FILES = ['index.html', 'app.js', 'app.css', 'manifest.json', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

/* ---------------- 데이터 ---------------- */
function blank() {
  return {
    id: 'guide', brand: '', title: '안내 가이드', subtitle: '',
    cover: { heading: '안내 가이드입니다', body: '순차적으로 확인 부탁드립니다.', duration: '약 3분', button: '시작하기', hint: '' },
    end: { heading: '안내가 모두 끝났습니다', body: '' },
    notice: '', autoplayMs: 7000, highlightColor: '#ff3b30', dim: 0.5,
    steps: []            // {phase,title,caption,note,hi:[],blur:[],tap:null, blob:Blob, url:string, w,h}
  };
}
let D = blank();
let cur = -1;            // 선택된 단계
let sel = null;          // 선택된 박스 {kind:'hi'|'blur'|'tap', idx}
let tool = 'select';
let dirty = false, saveT = null, pvT = null, pvReady = false;

const get = (o, k) => k.split('.').reduce((a, b) => (a == null ? a : a[b]), o);
const set = (o, k, v) => { const p = k.split('.'); let a = o; for (let i = 0; i < p.length - 1; i++) a = a[p[i]] = a[p[i]] || {}; a[p[p.length - 1]] = v; };
const imgName = (i) => 'assets/s' + String(i + 1).padStart(2, '0') + '.jpg';
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 2600); }
function markDirty() { dirty = true; $('saveState').textContent = '저장 중…'; clearTimeout(saveT); saveT = setTimeout(saveDraft, 600); schedulePreview(); }

function toJSON() {
  return {
    version: 1, id: D.id || 'guide', brand: D.brand, title: D.title, subtitle: D.subtitle,
    cover: { ...D.cover }, end: { ...D.end }, notice: D.notice,
    autoplayMs: D.autoplayMs, highlightColor: D.highlightColor, dim: D.dim, imageSize: [IMG_W, D.steps[0] ? Math.round(IMG_W * D.steps[0].h / D.steps[0].w) : 0],
    steps: D.steps.map((s, i) => {
      const o = { image: imgName(i), phase: s.phase, title: s.title, caption: s.caption };
      if (s.note) o.note = s.note;
      o.highlights = s.hi.map(b => { const r = { x: r4(b.x), y: r4(b.y), w: r4(b.w), h: r4(b.h) }; if (b.label) r.label = b.label; if (b.soft) r.soft = true; return r; });
      if (s.blur.length) o.blurs = s.blur.map(b => ({ x: r4(b.x), y: r4(b.y), w: r4(b.w), h: r4(b.h) }));
      if (s.tap) o.tap = { x: r4(s.tap.x), y: r4(s.tap.y) };
      return o;
    })
  };
}
const r4 = (v) => Math.round(v * 10000) / 10000;

/* ---------------- 이미지 처리 ---------------- */
function loadImage(blob) { return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const im = new Image(); im.onload = () => { res({ im, u }); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('이미지를 읽을 수 없습니다')); }; im.src = u; }); }
async function normalize(blob) {          // 폭 IMG_W 로 축소, JPEG 로 통일
  const { im, u } = await loadImage(blob);
  const w = Math.min(IMG_W, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(im, 0, 0, w, h);
  URL.revokeObjectURL(u);
  const out = await new Promise(r => c.toBlob(r, 'image/jpeg', JPEG_Q));
  return { blob: out, url: URL.createObjectURL(out), w, h };
}
async function bakeBlur(step) {           // 내보내기용: 블러 영역을 이미지 자체에 픽셀화(개인정보가 원본 파일에 남지 않게)
  if (!step.blur.length) return step.blob;
  const { im, u } = await loadImage(step.blob);
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0); URL.revokeObjectURL(u);
  for (const b of step.blur) {
    const x = Math.floor(b.x * c.width), y = Math.floor(b.y * c.height), w = Math.ceil(b.w * c.width), h = Math.ceil(b.h * c.height);
    if (w < 2 || h < 2) continue;
    const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(w / 36)); t.height = Math.max(1, Math.round(h / 36));
    const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true; tc.drawImage(c, x, y, w, h, 0, 0, t.width, t.height);
    ctx.imageSmoothingEnabled = true; ctx.filter = 'blur(6px)'; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); ctx.filter = 'none';
  }
  return await new Promise(r => c.toBlob(r, 'image/jpeg', JPEG_Q));
}

/* ---------------- 단계 관리 ---------------- */
async function addImages(files) {
  const list = [...files].filter(f => /^image\//.test(f.type)).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  if (!list.length) return;
  for (const f of list) {
    const n = await normalize(f);
    D.steps.push({ phase: D.steps.length ? D.steps[D.steps.length - 1].phase : '1. 시작', title: f.name.replace(/\.[^.]+$/, ''), caption: '', note: '', hi: [], blur: [], tap: null, ...n });
  }
  cur = D.steps.length - 1; sel = null; renderAll(); markDirty(); toast(list.length + '개 단계 추가');
}
function move(d) { if (cur < 0) return; const j = cur + d; if (j < 0 || j >= D.steps.length) return; [D.steps[cur], D.steps[j]] = [D.steps[j], D.steps[cur]]; cur = j; renderAll(); markDirty(); }
function dup() { if (cur < 0) return; const s = D.steps[cur]; const c = JSON.parse(JSON.stringify({ ...s, blob: null, url: null })); c.blob = s.blob; c.url = s.url; D.steps.splice(cur + 1, 0, c); cur++; renderAll(); markDirty(); }
function del() { if (cur < 0) return; if (!confirm('이 단계를 삭제할까요?')) return; D.steps.splice(cur, 1); cur = Math.min(cur, D.steps.length - 1); sel = null; renderAll(); markDirty(); }

/* ---------------- 렌더 ---------------- */
function renderMeta() {
  $('metaForm').querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (k === 'autoplaySec') el.value = D.autoplayMs / 1000; else el.value = get(D, k) ?? '';
  });
}
function renderList() {
  const host = $('stepList'); host.textContent = '';
  D.steps.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'step' + (i === cur ? ' on' : ''); d.dataset.i = i;
    const im = document.createElement('img'); im.src = s.url;
    const no = document.createElement('span'); no.className = 'no'; no.textContent = i + 1;
    const t = document.createElement('div'); t.className = 't';
    const t1 = document.createElement('div'); t1.textContent = s.title || '(제목 없음)';
    const t2 = document.createElement('div'); t2.className = 'p'; t2.textContent = s.phase;
    t.appendChild(t1); t.appendChild(t2);
    d.appendChild(no); d.appendChild(im); d.appendChild(t);
    d.addEventListener('click', () => { cur = i; sel = null; renderAll(); });
    host.appendChild(d);
  });
  $('stepCount').textContent = D.steps.length + '개';
  const dl = $('phaseList'); dl.textContent = '';
  [...new Set(D.steps.map(s => s.phase).filter(Boolean))].forEach(p => { const o = document.createElement('option'); o.value = p; dl.appendChild(o); });
}
function renderStep() {
  const s = D.steps[cur];
  $('emptyHint').hidden = !!s; $('canvas').hidden = !s; $('stepForm').hidden = !s;
  if (!s) { $('selBox').hidden = true; return; }
  $('cImg').src = s.url;
  $('stepForm').querySelectorAll('[data-s]').forEach(el => el.value = s[el.dataset.s] || '');
  $('imgInfo').textContent = s.w + '×' + s.h + ' · ' + Math.round(s.blob.size / 1024) + 'KB → ' + imgName(cur);
  renderBoxes();
}
function renderBoxes() {
  const s = D.steps[cur]; const L = $('cLayers'); L.textContent = '';
  if (!s) return;
  const mk = (kind, b, i) => {
    const d = document.createElement('div'); d.className = 'bx ' + (kind === 'blur' ? 'blur' : (b.soft ? 'soft' : 'hi')); d.dataset.kind = kind; d.dataset.i = i;
    d.style.left = b.x * 100 + '%'; d.style.top = b.y * 100 + '%'; d.style.width = b.w * 100 + '%'; d.style.height = b.h * 100 + '%';
    if (kind === 'hi' && b.label) { const l = document.createElement('div'); l.className = 'lb'; l.textContent = b.label; d.appendChild(l); }
    ['nw', 'ne', 'sw', 'se'].forEach(h => { const e = document.createElement('div'); e.className = 'h ' + h; e.dataset.h = h; d.appendChild(e); });
    if (sel && sel.kind === kind && sel.idx === i) d.classList.add('on');
    L.appendChild(d);
  };
  s.hi.forEach((b, i) => mk('hi', b, i));
  s.blur.forEach((b, i) => mk('blur', b, i));
  if (s.tap) { const t = document.createElement('div'); t.className = 'tp' + (sel && sel.kind === 'tap' ? ' on' : ''); t.dataset.kind = 'tap'; t.style.left = s.tap.x * 100 + '%'; t.style.top = s.tap.y * 100 + '%'; L.appendChild(t); }
  const sb = $('selBox'); const b = selected();
  sb.hidden = !sel; if (sel && sel.kind === 'hi' && b) { $('selLabel').value = b.label || ''; $('selSoft').checked = !!b.soft; $('selLabel').disabled = false; $('selSoft').disabled = false; }
  else if (sel) { $('selLabel').value = ''; $('selLabel').disabled = true; $('selSoft').disabled = true; }
}
function selected() { const s = D.steps[cur]; if (!s || !sel) return null; if (sel.kind === 'tap') return s.tap; return (sel.kind === 'hi' ? s.hi : s.blur)[sel.idx]; }
function renderAll() { renderMeta(); renderList(); renderStep(); }

/* ---------------- 캔버스 상호작용 ---------------- */
(function () {
  const cv = $('canvas'), L = $('cLayers');
  let drag = null, rubber = null;
  const rel = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  $('tools').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tool = b.dataset.tool; $('tools').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); cv.className = 'canvas tool-' + tool; });
  cv.addEventListener('pointerdown', e => {
    const s = D.steps[cur]; if (!s || e.button !== 0) return;
    const p = rel(e); cv.setPointerCapture(e.pointerId);
    const bx = e.target.closest('.bx'), tp = e.target.closest('.tp'), h = e.target.closest('.h');
    if (tool === 'tap') { s.tap = { x: p.x, y: p.y }; sel = { kind: 'tap' }; renderBoxes(); markDirty(); return; }
    if (tool === 'select' || bx || tp) {
      if (tp) { sel = { kind: 'tap' }; drag = { kind: 'move-tap', p0: p, o: { ...s.tap } }; renderBoxes(); return; }
      if (bx) {
        sel = { kind: bx.dataset.kind, idx: +bx.dataset.i }; const b = selected();
        drag = h ? { kind: 'resize', h: h.dataset.h, p0: p, o: { ...b } } : { kind: 'move', p0: p, o: { ...b } };
        renderBoxes(); return;
      }
      sel = null; renderBoxes(); return;
    }
    // 그리기(hi / soft / blur)
    drag = { kind: 'draw', p0: p };
    rubber = document.createElement('div'); rubber.className = 'rubber'; L.appendChild(rubber);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; const s = D.steps[cur]; const p = rel(e);
    if (drag.kind === 'draw') { const x = Math.min(p.x, drag.p0.x), y = Math.min(p.y, drag.p0.y), w = Math.abs(p.x - drag.p0.x), h = Math.abs(p.y - drag.p0.y); Object.assign(rubber.style, { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%' }); return; }
    const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    if (drag.kind === 'move-tap') { s.tap = { x: Math.max(0, Math.min(1, drag.o.x + dx)), y: Math.max(0, Math.min(1, drag.o.y + dy)) }; }
    else {
      const b = selected(); if (!b) return; const o = drag.o;
      if (drag.kind === 'move') { b.x = Math.max(0, Math.min(1 - o.w, o.x + dx)); b.y = Math.max(0, Math.min(1 - o.h, o.y + dy)); }
      else {
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (drag.h.includes('w')) x1 = Math.min(x2 - 0.01, o.x + dx); if (drag.h.includes('e')) x2 = Math.max(x1 + 0.01, o.x + o.w + dx);
        if (drag.h.includes('n')) y1 = Math.min(y2 - 0.01, o.y + dy); if (drag.h.includes('s')) y2 = Math.max(y1 + 0.01, o.y + o.h + dy);
        b.x = Math.max(0, x1); b.y = Math.max(0, y1); b.w = Math.min(1 - b.x, x2 - x1); b.h = Math.min(1 - b.y, y2 - y1);
      }
    }
    renderBoxes();
  });
  const up = e => {
    if (!drag) return; const s = D.steps[cur]; const p = rel(e);
    if (drag.kind === 'draw') {
      rubber.remove(); rubber = null;
      const x = Math.min(p.x, drag.p0.x), y = Math.min(p.y, drag.p0.y), w = Math.abs(p.x - drag.p0.x), h = Math.abs(p.y - drag.p0.y);
      if (w > 0.01 && h > 0.005) {
        if (tool === 'blur') { s.blur.push({ x, y, w, h }); sel = { kind: 'blur', idx: s.blur.length - 1 }; }
        else { s.hi.push({ x, y, w, h, label: '', soft: tool === 'soft' }); sel = { kind: 'hi', idx: s.hi.length - 1 }; $('selLabel').focus(); }
      }
    }
    drag = null; renderBoxes(); markDirty();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  $('selLabel').addEventListener('input', () => { const b = selected(); if (b && sel.kind === 'hi') { b.label = $('selLabel').value; renderBoxes(); markDirty(); } });
  $('selSoft').addEventListener('change', () => { const b = selected(); if (b && sel.kind === 'hi') { b.soft = $('selSoft').checked; renderBoxes(); markDirty(); } });
  function delBox() { const s = D.steps[cur]; if (!s || !sel) return; if (sel.kind === 'tap') s.tap = null; else (sel.kind === 'hi' ? s.hi : s.blur).splice(sel.idx, 1); sel = null; renderBoxes(); markDirty(); }
  $('bDelBox').addEventListener('click', delBox);
  window.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); delBox(); } });
  // 드롭으로 이미지 추가
  const wrap = $('canvasWrap');
  wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drop'); });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
  wrap.addEventListener('drop', e => { e.preventDefault(); wrap.classList.remove('drop'); addImages(e.dataTransfer.files); });
})();

/* ---------------- 폼 바인딩 ---------------- */
$('metaForm').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  if (k === 'autoplaySec') D.autoplayMs = Math.round(Math.max(2, Math.min(60, +e.target.value || 7)) * 1000);
  else if (k === 'dim') D.dim = Math.max(0, Math.min(0.9, +e.target.value || 0));
  else if (k === 'id') D.id = e.target.value.replace(/[^A-Za-z0-9_-]/g, '');
  else set(D, k, e.target.value);
  markDirty();
});
$('stepForm').addEventListener('input', e => { const k = e.target.dataset.s; const s = D.steps[cur]; if (!k || !s) return; s[k] = e.target.value; renderList(); markDirty(); });
$('inAddImages').addEventListener('change', e => { addImages(e.target.files); e.target.value = ''; });
$('inReplace').addEventListener('change', async e => { const f = e.target.files[0]; const s = D.steps[cur]; if (!f || !s) return; Object.assign(s, await normalize(f)); renderAll(); markDirty(); e.target.value = ''; });
$('bUp').addEventListener('click', () => move(-1)); $('bDown').addEventListener('click', () => move(1));
$('bDup').addEventListener('click', dup); $('bDel').addEventListener('click', del);
$('bNew').addEventListener('click', () => { if (!confirm('작성 중인 내용을 지우고 새로 시작할까요? (초안 자동저장도 지워집니다)')) return; D = blank(); cur = -1; sel = null; renderAll(); clearDraft(); schedulePreview(); });

/* ---------------- 미리보기 (같은 출처 iframe + postMessage) ---------------- */
const pv = $('pv');
pv.src = '../index.html?preview=1';
window.addEventListener('message', e => { if (e.origin !== location.origin) return; if (e.data && e.data.type === 'viewer-ready') { pvReady = true; sendPreview(); } });
function schedulePreview() { clearTimeout(pvT); pvT = setTimeout(sendPreview, 350); }
function sendPreview() {
  if (!pvReady || !pv.contentWindow) return;
  if (!D.steps.length) return;
  const images = {}; D.steps.forEach((s, i) => images[imgName(i)] = s.url);
  pv.contentWindow.postMessage({ type: 'guide', data: toJSON(), images, step: Math.max(0, cur) }, location.origin);
}
$('bPvReload').addEventListener('click', () => { pvReady = false; pv.src = '../index.html?preview=1&t=' + Date.now(); });

/* ---------------- 불러오기 ---------------- */
$('inImport').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  const jf = files.find(f => /\.json$/i.test(f.name)); if (!jf) { toast('guide.json 을 함께 선택해 주세요'); return; }
  try {
    const j = JSON.parse(await jf.text());
    if (j.version !== 1 || !Array.isArray(j.steps)) throw new Error('guide.json v1 형식이 아닙니다');
    const byName = {}; files.forEach(f => byName[f.name] = f);
    const n = blank();
    n.id = j.id || 'guide'; n.brand = j.brand || ''; n.title = j.title || ''; n.subtitle = j.subtitle || '';
    Object.assign(n.cover, j.cover || {}); Object.assign(n.end, j.end || {}); n.notice = j.notice || '';
    n.autoplayMs = j.autoplayMs || 7000; n.highlightColor = j.highlightColor || '#ff3b30'; n.dim = typeof j.dim === 'number' ? j.dim : 0.5;
    let missing = 0;
    for (const s of j.steps) {
      const fn = String(s.image || '').split('/').pop(); const f = byName[fn];
      if (!f) { missing++; continue; }
      const im = await normalize(f);
      n.steps.push({ phase: s.phase || '', title: s.title || '', caption: s.caption || '', note: s.note || '',
        hi: (s.highlights || []).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, label: b.label || '', soft: !!b.soft })),
        blur: (s.blurs || []).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })), tap: s.tap ? { x: s.tap.x, y: s.tap.y } : null, ...im });
    }
    D = n; cur = D.steps.length ? 0 : -1; sel = null; renderAll(); markDirty();
    toast('불러오기 완료' + (missing ? ' · 이미지 없는 단계 ' + missing + '개 제외' : ''));
  } catch (err) { toast('불러오기 실패: ' + err.message); }
});

/* ---------------- 내보내기: 배포용 zip (뷰어 파일 + guide.json + assets) ---------------- */
$('bExport').addEventListener('click', async () => {
  if (!D.steps.length) { toast('단계가 없습니다'); return; }
  const miss = D.steps.findIndex(s => !s.caption); if (miss >= 0 && !confirm((miss + 1) + '단계에 설명 문구가 없습니다. 그래도 내보낼까요?')) return;
  $('bExport').disabled = true; toast('내보내는 중…');
  try {
    const id = D.id || 'guide'; const files = [];
    files.push({ name: id + '/guide.json', data: new TextEncoder().encode(JSON.stringify(toJSON(), null, 2) + '\n') });
    for (let i = 0; i < D.steps.length; i++) files.push({ name: id + '/' + imgName(i), data: new Uint8Array(await (await bakeBlur(D.steps[i])).arrayBuffer()) });
    let viewer = 0;
    for (const f of VIEWER_FILES) {           // 같은 출처의 뷰어 파일을 함께 담아 "폴더 통째로 업로드" 형태로 만든다
      try { const r = await fetch('../' + f, { cache: 'no-cache' }); if (r.ok) { files.push({ name: id + '/' + f, data: new Uint8Array(await r.arrayBuffer()) }); viewer++; } } catch (e) {}
    }
    files.push({ name: 'DEPLOY_README.txt', data: new TextEncoder().encode(readme(id, viewer === VIEWER_FILES.length)) });
    const blob = new Blob([zip(files)], { type: 'application/zip' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = id + '_guide_' + new Date().toISOString().slice(0, 10) + '.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('내보내기 완료' + (viewer < VIEWER_FILES.length ? ' (뷰어 파일 일부 누락 — 웹 서버로 열면 포함됩니다)' : ''));
  } catch (err) { toast('내보내기 실패: ' + err.message); }
  $('bExport').disabled = false;
});
function readme(id, full) {
  return ['[' + id + ' 안내 가이드 — 배포 안내]', '',
    '1. 구성: ' + id + '/ 폴더 = 정적 파일(HTML/JS/CSS 각 1개 + guide.json + assets 이미지 + 아이콘). 서버·빌드 없음.',
    '   외부 의존은 웹폰트 CSS 1개(jsdelivr, 버전 고정·무결성 해시)뿐이며 없어도 시스템 폰트로 동작합니다.',
    '2. 올리기: ' + id + '/ 폴더를 통째로 https://guide.monki.net/' + id + '/ 위치에 덮어쓰기 → CloudFront 무효화 /' + id + '/*',
    '3. 주소: https://guide.monki.net/' + id + '/  (슬래시 없이 열려도 페이지가 스스로 보정)',
    '4. 내용만 바꿀 때: guide.json 과 assets/ 만 교체하면 됩니다. 뷰어(index.html/app.js/app.css)는 모든 가이드가 동일합니다.',
    '5. 보안: CSP(인라인 스크립트 금지·같은 출처만), 데이터는 textContent 로만 삽입, 이미지 경로 allowlist, 외부 스크립트 없음. 상세는 docs/security.md',
    full ? '' : '※ 이 zip 은 뷰어 파일이 일부 빠져 있습니다(제작 도구를 파일로 직접 열어 내보낸 경우). 뷰어 파일은 저장소 루트에서 복사하세요.'].join('\n');
}

/* ---------------- 최소 ZIP 작성기 (STORE, UTF-8 이름) ---------------- */
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const enc = new TextEncoder(); const parts = []; const cd = []; let off = 0;
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...name]);
    parts.push(lh, f.data);
    cd.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]));
    off += lh.length + n;
  }
  const cdLen = cd.reduce((a, b) => a + b.length, 0);
  const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...cd, eocd]);
}

/* ---------------- 초안 자동 저장 (IndexedDB) ---------------- */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('guide-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('draft'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function saveDraft() {
  try {
    const db = await idb(); const tx = db.transaction('draft', 'readwrite'); const st = tx.objectStore('draft');
    st.put({ json: toJSON(), meta: { id: D.id }, images: D.steps.map(s => s.blob), cur }, 'current');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    dirty = false; $('saveState').textContent = '저장됨 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { $('saveState').textContent = '저장 실패'; }
}
async function clearDraft() { try { const db = await idb(); db.transaction('draft', 'readwrite').objectStore('draft').delete('current'); } catch (e) {} $('saveState').textContent = '자동 저장'; }
async function restoreDraft() {
  try {
    const db = await idb(); const r = db.transaction('draft').objectStore('draft').get('current');
    const v = await new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (!v || !v.json || !v.json.steps.length) return false;
    if (!confirm('저장된 초안(' + v.json.steps.length + '단계 · ' + (v.json.title || '') + ')이 있습니다. 이어서 작업할까요?')) { clearDraft(); return false; }
    const j = v.json, n = blank();
    n.id = j.id; n.brand = j.brand; n.title = j.title; n.subtitle = j.subtitle; Object.assign(n.cover, j.cover); Object.assign(n.end, j.end); n.notice = j.notice;
    n.autoplayMs = j.autoplayMs; n.highlightColor = j.highlightColor; n.dim = j.dim;
    for (let i = 0; i < j.steps.length; i++) {
      const s = j.steps[i], blob = v.images[i]; if (!blob) continue;
      const { im, u } = await loadImage(blob);
      n.steps.push({ phase: s.phase, title: s.title, caption: s.caption, note: s.note || '',
        hi: (s.highlights || []).map(b => ({ ...b, label: b.label || '', soft: !!b.soft })), blur: s.blurs || [], tap: s.tap || null, blob, url: u, w: im.naturalWidth, h: im.naturalHeight });
    }
    D = n; cur = Math.min(v.cur || 0, D.steps.length - 1); return true;
  } catch (e) { return false; }
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- 시작 ---------------- */
(async function () { await restoreDraft(); renderAll(); schedulePreview(); })();
