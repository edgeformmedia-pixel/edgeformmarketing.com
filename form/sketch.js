// ═══════════════════════════════════════════════════
//  CANVAS BUILDER — v3: 16:9, resize, text, sel panel
// ═══════════════════════════════════════════════════
const SECTIONS = [
  { label:'Nav Bar',  icon:'🔝', h:50,  color:'#1e3a5f', desc:'Navigation' },
  { label:'Hero',     icon:'⭐', h:110, color:'#1a1a2e', desc:'Main banner' },
  { label:'Services', icon:'🔧', h:88,  color:'#0f2027', desc:'What you offer' },
  { label:'About',    icon:'👤', h:80,  color:'#1a1a2e', desc:'About you' },
  { label:'Reviews',  icon:'💬', h:80,  color:'#0f2027', desc:'Testimonials' },
  { label:'Booking',  icon:'📅', h:96,  color:'#1e3a5f', desc:'Book online' },
  { label:'Gallery',  icon:'🖼', h:88,  color:'#1a1a2e', desc:'Photos' },
  { label:'Contact',  icon:'📞', h:68,  color:'#0f2027', desc:'Footer / contact' },
];

let canvas, ctx;
let tool       = 'draw';
let drawColor  = '#111111';
let brushSize  = 5;
let drawOpacity = 1.0;
let isDrawing  = false;
let lastX = 0, lastY = 0;
let rectStart  = null;
let elements   = [];
let selectedEl = null, dragOX = 0, dragOY = 0;
let resizeHandle = null; // {el, corner}
let undoStack  = [];
let textInput  = null;

// ── Build section chips ─────────────────────────────
function buildSectionsPanel() {
  const grid = document.getElementById('sectionsGrid');
  if (!grid || grid.children.length > 0) return;
  SECTIONS.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'section-chip';
    chip.innerHTML = `<span class="section-chip-icon">${s.icon}</span><span class="section-chip-label">${s.label}</span>`;
    chip.addEventListener('click', () => placeSection(s));
    grid.appendChild(chip);
  });
}

// ── Init ────────────────────────────────────────────
function initCanvas() {
  if (canvas) { resizeCanvas(); return; }
  canvas = document.getElementById('builderCanvas');
  ctx    = canvas.getContext('2d');
  buildSectionsPanel();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    resizeCanvas();
    saveUndo();
  }));
  canvas.addEventListener('mousedown',  onDown);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onUp);
  canvas.addEventListener('mouseleave', onUp);
  canvas.addEventListener('dblclick',   onDblClick);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(t2m(e)); }, { passive:false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(t2m(e)); }, { passive:false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(t2m(e));   }, { passive:false });
}

function t2m(e) {
  const t = e.touches[0] || e.changedTouches[0];
  return { clientX:t.clientX, clientY:t.clientY, button:0 };
}

// ── Resize canvas to fill container at 16:9 ─────────
function resizeCanvas() {
  if (!canvas) return;
  const cc = document.getElementById('canvasContainer');
  const W  = cc.clientWidth;
  if (!W) return;
  const H   = Math.round(W * 9 / 16);
  const dpr = window.devicePixelRatio || 1;
  cc.style.height = H + 'px';
  canvas.width    = W * dpr;
  canvas.height   = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  drawAll();
}

window.addEventListener('resize', () => {
  if (canvas && S.step === 'vision' && S.mode === 'visual') resizeCanvas();
});

function getW() { return canvas.width  / (window.devicePixelRatio || 1); }
function getH() { return canvas.height / (window.devicePixelRatio || 1); }

function gp(e) {
  const r   = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width)  / dpr,
    y: (e.clientY - r.top)  * (canvas.height / r.height) / dpr
  };
}

// ── Resize handle hit test ──────────────────────────
const HANDLE_R = 6;
function getHandles(el) {
  const x = el.x, y = el.y, w = el.w || 160, h = el.h || 50;
  return [
    { id:'se', x:x+w, y:y+h },
    { id:'sw', x:x,   y:y+h },
    { id:'ne', x:x+w, y:y   },
    { id:'nw', x:x,   y:y   },
  ];
}
function hitHandle(el, px, py) {
  if (!el || (el.type !== 'rect' && el.type !== 'section')) return null;
  for (const h of getHandles(el)) {
    if (Math.abs(px - h.x) <= HANDLE_R + 3 && Math.abs(py - h.y) <= HANDLE_R + 3) return h.id;
  }
  return null;
}

// ── Events ──────────────────────────────────────────
function onDown(e) {
  if (e.button !== 0 && e.button !== undefined) return;
  const p = gp(e);
  isDrawing = true;
  hideHint();

  if (tool === 'draw' || tool === 'erase') {
    saveUndo();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    lastX = p.x; lastY = p.y;

  } else if (tool === 'rect') {
    saveUndo();
    rectStart = { x:p.x, y:p.y };

  } else if (tool === 'text') {
    saveUndo();
    placeTextInput(p.x, p.y);
    isDrawing = false;

  } else if (tool === 'select') {
    // Check resize handle on currently selected element first
    if (selectedEl) {
      const h = hitHandle(selectedEl, p.x, p.y);
      if (h) { resizeHandle = { el:selectedEl, corner:h, startX:p.x, startY:p.y, origX:selectedEl.x, origY:selectedEl.y, origW:selectedEl.w||160, origH:selectedEl.h||50 }; return; }
    }
    // Hit test all elements
    const prev = selectedEl;
    selectedEl = null;
    resizeHandle = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], p.x, p.y)) {
        selectedEl = elements[i];
        dragOX = p.x - elements[i].x;
        dragOY = p.y - elements[i].y;
        break;
      }
    }
    updateSelPanel();
    drawAll();
  }
}

function onMove(e) {
  if (!isDrawing) return;
  const p = gp(e);

  if (tool === 'draw') {
    ctx.globalAlpha = drawOpacity;
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = drawColor;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.globalAlpha = 1;
    lastX = p.x; lastY = p.y;

  } else if (tool === 'erase') {
    ctx.lineWidth   = brushSize * 3;
    ctx.lineCap     = 'round';
    ctx.strokeStyle = '#f8f8f8';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);

  } else if (tool === 'rect' && rectStart) {
    drawAll();
    const w = p.x - rectStart.x, h = p.y - rectStart.y;
    ctx.save();
    ctx.globalAlpha = drawOpacity;
    ctx.fillStyle   = drawColor;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(rectStart.x, rectStart.y, w, h, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();

  } else if (tool === 'select') {
    if (resizeHandle) {
      const dx = p.x - resizeHandle.startX;
      const dy = p.y - resizeHandle.startY;
      const el = resizeHandle.el;
      const c  = resizeHandle.corner;
      if (c === 'se') { el.w = Math.max(40, resizeHandle.origW + dx); el.h = Math.max(20, resizeHandle.origH + dy); }
      else if (c === 'sw') { el.x = resizeHandle.origX + dx; el.w = Math.max(40, resizeHandle.origW - dx); el.h = Math.max(20, resizeHandle.origH + dy); }
      else if (c === 'ne') { el.w = Math.max(40, resizeHandle.origW + dx); el.y = resizeHandle.origY + dy; el.h = Math.max(20, resizeHandle.origH - dy); }
      else if (c === 'nw') { el.x = resizeHandle.origX + dx; el.y = resizeHandle.origY + dy; el.w = Math.max(40, resizeHandle.origW - dx); el.h = Math.max(20, resizeHandle.origH - dy); }
      drawAll();
    } else if (selectedEl) {
      selectedEl.x = p.x - dragOX;
      selectedEl.y = p.y - dragOY;
      drawAll();
    }
  }
}

function onUp(e) {
  if (!isDrawing && !resizeHandle) return;
  const wasResize = !!resizeHandle;
  isDrawing    = false;
  resizeHandle = null;

  if (tool === 'rect' && rectStart && e) {
    const p = gp(e);
    const w = p.x - rectStart.x, h = p.y - rectStart.y;
    if (Math.abs(w) > 6 && Math.abs(h) > 6) {
      elements.push({ type:'rect', x:rectStart.x, y:rectStart.y, w, h, color:drawColor, opacity:drawOpacity });
    }
    rectStart = null;
    drawAll();
  }
  if (wasResize) { saveUndo(); updateSelPanel(); }
}

// ── Double-click to edit section/text label inline ──
function onDblClick(e) {
  const p = gp(e);
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if ((el.type === 'section' || el.type === 'text') && hitTest(el, p.x, p.y)) {
      selectedEl = el;
      setTool('select');
      updateSelPanel();
      // Focus the label field
      setTimeout(() => {
        const lf = document.getElementById('selLabel');
        if (lf) { lf.focus(); lf.select(); }
      }, 50);
      return;
    }
  }
}

// ── Draw all ─────────────────────────────────────────
function drawAll() {
  if (!ctx || !canvas.width || !canvas.height) return;
  const W = getW(), H = getH();

  // White background
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let x = 16; x < W; x += 24) {
    for (let y = 16; y < H; y += 24) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI*2); ctx.fill();
    }
  }

  elements.forEach(drawEl);

  // Selection outline + handles
  if (selectedEl && tool === 'select') {
    const el = selectedEl;
    const x = el.x, y = el.y;
    const w = el.w || 160, h = el.h || 50;
    ctx.save();
    ctx.strokeStyle = '#0071e3';
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.setLineDash([]);
    // Resize handles
    for (const hd of getHandles(el)) {
      ctx.fillStyle   = '#fff';
      ctx.strokeStyle = '#0071e3';
      ctx.lineWidth   = 1.5;
      ctx.fillRect(hd.x - HANDLE_R, hd.y - HANDLE_R, HANDLE_R*2, HANDLE_R*2);
      ctx.strokeRect(hd.x - HANDLE_R, hd.y - HANDLE_R, HANDLE_R*2, HANDLE_R*2);
    }
    ctx.restore();
  }
}

function drawEl(el) {
  ctx.save();
  const op = (el.opacity !== undefined) ? el.opacity : 1;

  if (el.type === 'section') {
    const W  = getW();
    const w  = el.w || W - 24;
    const h  = el.h || 52;
    ctx.globalAlpha = op;
    ctx.fillStyle   = el.color || '#1e3a5f';
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, w, h, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Icon + editable label
    ctx.font      = 'bold 13px DM Sans, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(`${el.icon}  ${el.label}`, el.x + 14, el.y + h/2 + 5);
    // Right label (desc)
    ctx.font      = '11px DM Sans, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.textAlign = 'right';
    ctx.fillText(el.desc || '', el.x + w - 12, el.y + h/2 + 4);
    ctx.textAlign = 'left';

  } else if (el.type === 'rect') {
    ctx.globalAlpha = op;
    ctx.fillStyle   = el.color;
    ctx.strokeStyle = el.color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.w, el.h, 4);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, op + 0.15);
    ctx.stroke();
    ctx.globalAlpha = 1;

  } else if (el.type === 'text') {
    ctx.globalAlpha = op;
    ctx.font        = `bold ${el.size || 15}px DM Sans, Arial, sans-serif`;
    ctx.fillStyle   = el.color || '#111';
    ctx.fillText(el.label || el.text || '', el.x, el.y);
    ctx.globalAlpha = 1;

  } else if (el.type === 'image' && el.img) {
    ctx.globalAlpha = op;
    ctx.drawImage(el.img, el.x, el.y, el.w, el.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth   = 1;
    ctx.strokeRect(el.x, el.y, el.w, el.h);
  }
  ctx.restore();
}

// ── Place section chip ───────────────────────────────
function placeSection(s) {
  const W = getW();
  const lastY = elements
    .filter(e => e.type === 'section')
    .reduce((m, e) => Math.max(m, e.y + (e.h || 52) + 4), 10);
  elements.push({
    type:'section', label:s.label, icon:s.icon,
    desc:s.desc, color:s.color, opacity:1,
    x:10, y:lastY, w:W - 20, h:s.h
  });
  saveUndo(); drawAll(); hideHint();
}

// ── Tools ────────────────────────────────────────────
function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const tb = document.getElementById(`tool-${t}`);
  if (tb) tb.classList.add('active');
  if (!canvas) return;
  canvas.style.cursor = t === 'text' ? 'text' : t === 'select' ? 'default' : t === 'erase' ? 'cell' : 'crosshair';
  if (t !== 'select') { selectedEl = null; resizeHandle = null; updateSelPanel(); drawAll(); }
}

function pickColor(el) {
  document.querySelectorAll('.color-swatch').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  drawColor = el.dataset.color;
  const cc = document.getElementById('customColor');
  if (cc) cc.value = drawColor;
}

// ── Selection panel ──────────────────────────────────
function updateSelPanel() {
  const panel = document.getElementById('selPanel');
  if (!panel) return;
  if (!selectedEl) {
    panel.classList.remove('visible');
    return;
  }
  panel.classList.add('visible');
  const el = selectedEl;
  document.getElementById('selName').textContent    = el.label || el.text || el.type;
  document.getElementById('selColor').value         = el.color || '#111111';
  const opPct = Math.round((el.opacity !== undefined ? el.opacity : 1) * 100);
  document.getElementById('selOpacity').value       = opPct;
  document.getElementById('selOpLabel').textContent = opPct + '%';
  document.getElementById('selLabel').value         = el.label || el.text || '';
}

function changeSelectedColor(v) {
  if (!selectedEl) return;
  selectedEl.color = v;
  saveUndo(); drawAll();
}

function changeSelectedOpacity(v) {
  if (!selectedEl) return;
  selectedEl.opacity = v;
  drawAll();
}

function changeSelectedLabel(v) {
  if (!selectedEl) return;
  if (selectedEl.type === 'text') selectedEl.text  = v;
  else selectedEl.label = v;
  drawAll();
}

// ── Text tool ────────────────────────────────────────
function placeTextInput(x, y) {
  if (textInput) { textInput.remove(); textInput = null; }
  const cc = document.getElementById('canvasContainer');
  const r  = canvas.getBoundingClientRect();
  const sx = r.width  / getW();
  const sy = r.height / getH();
  const fs = Math.max(13, brushSize + 8);
  textInput = document.createElement('input');
  textInput.style.cssText = `
    position:absolute;
    left:${x * sx}px;
    top:${(y - fs) * sy}px;
    background:#fff;
    border:2px solid #0071e3;
    border-radius:6px;
    color:#111;
    font-size:${fs}px;
    font-family:Inter,Arial,sans-serif;
    font-weight:bold;
    outline:none;
    min-width:140px;
    max-width:${(getW() - x) * sx}px;
    z-index:100;
    padding:4px 8px;
    box-shadow:0 4px 16px rgba(0,113,227,0.35);
  `;
  cc.style.overflow = 'visible';
  cc.appendChild(textInput);
  textInput.focus();

  const commit = () => {
    const txt = textInput ? textInput.value.trim() : '';
    if (txt) {
      elements.push({ type:'text', x, y, label:txt, text:txt, color:drawColor, opacity:drawOpacity, size:fs });
    }
    if (textInput) { textInput.remove(); textInput = null; }
    if (cc) cc.style.overflow = 'hidden';
    drawAll();
  };
  textInput.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') commit(); });
  textInput.addEventListener('blur', commit);
}

// ── Image upload ─────────────────────────────────────
function handleImageUpload(e) {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const W = getW();
      const s = Math.min(1, (W * 0.5) / img.width);
      elements.push({ type:'image', img, x:40, y:40, w:img.width*s, h:img.height*s, opacity:1 });
      saveUndo(); drawAll(); hideHint();
    };
    img.src = ev.target.result;
  };
  rd.readAsDataURL(f);
  e.target.value = '';
}

// ── Hit test ─────────────────────────────────────────
function hitTest(el, x, y) {
  if (el.type === 'section' || el.type === 'rect' || el.type === 'image') {
    const ex = Math.min(el.x, el.x + (el.w||0));
    const ey = Math.min(el.y, el.y + (el.h||0));
    return x>=ex && x<=ex+Math.abs(el.w||160) && y>=ey && y<=ey+Math.abs(el.h||52);
  }
  if (el.type === 'text') return x>=el.x-4 && x<=el.x+200 && y>=el.y-20 && y<=el.y+8;
  return false;
}

// ── Undo / Delete / Clear ─────────────────────────────
function saveUndo() {
  if (!canvas || !canvas.width || !canvas.height) return;
  try {
    undoStack.push({
      id:  ctx.getImageData(0, 0, canvas.width, canvas.height),
      els: JSON.parse(JSON.stringify(elements.map(e => e.type==='image' ? {...e, img:null} : e)))
    });
    if (undoStack.length > 30) undoStack.shift();
  } catch(err) {}
}

function undoAction() {
  if (undoStack.length <= 1) return;
  undoStack.pop();
  const p = undoStack[undoStack.length - 1];
  ctx.putImageData(p.id, 0, 0);
  elements   = p.els;
  selectedEl = null;
  updateSelPanel();
  drawAll();
}

function deleteSelected() {
  if (!selectedEl) return;
  elements   = elements.filter(e => e !== selectedEl);
  selectedEl = null;
  saveUndo(); updateSelPanel(); drawAll();
}

function clearCanvas() {
  if (!confirm('Clear the entire canvas?')) return;
  saveUndo();
  elements   = [];
  selectedEl = null;
  updateSelPanel(); drawAll(); showHint();
}

function hideHint() {
  const h = document.getElementById('canvasHint');
  if (h) h.style.opacity = '0';
}
function showHint() {
  const h = document.getElementById('canvasHint');
  if (h) h.style.opacity = '1';
}
