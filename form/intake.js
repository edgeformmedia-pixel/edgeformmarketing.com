// ═══════════════════════════════════════════════════════════════
//  EDGEFORM INTAKE v2 — one "Let's talk" form, many inquiry types
//
//  type → contact → (path steps) → done
//
//  Everything a path asks is read straight from the DOM at send time
//  via data-field attributes, so adding a question is markup-only.
// ═══════════════════════════════════════════════════════════════

const CRM_API = 'https://edgeform-crm-api.edgeformmedia.workers.dev/api/submissions';
const FORM_VERSION = 2;
// CRM limits: whole body 64KB (also the keepalive cap), details 16KB. Free-text
// answers are capped so a long essay can't get a lead rejected.
const TEXT_MAX = 4000;

const PHONE_HINT = 'US or Canada — the +1 is optional. Outside North America? Start with + and your country code.';

const TYPES = {
  website: {
    label: 'Website',
    steps: () => ['hasSite', S.data.hasWebsite === 'yes' ? 'statHas' : 'statNone', 'bizType', 'vision'],
    kicker: 'Websites / free demo first',
    copy: "Tell us what you have — or what you want. We'll build a working demo before you commit to anything.",
    done: ["You're all set", "We'll be in touch<br><em>very soon.</em>",
      "We've received everything we need. Expect a call or text within 24 hours — your <strong>free demo</strong> will be ready shortly after."],
  },
  crm: {
    label: 'CRM / Sales System',
    steps: () => ['crmTool', 'crmTeam', 'crmPain'],
    kicker: 'CRM & sales systems',
    copy: 'One place for every lead, every follow-up, and every deal — built around how your team actually sells.',
    done: ['Request received', 'Your system map<br><em>starts now.</em>',
      "We'll review your current setup and reach out within 24 hours to book a walkthrough."],
  },
  consulting: {
    label: 'Sales & Marketing Consulting',
    steps: () => ['consultBiz', 'consultGoal', 'consultStuck'],
    kicker: 'Sales & marketing consulting',
    copy: "Bring the growth problem. We'll bring the diagnosis, the plan, and the operating rhythm to execute it.",
    done: ['Request received', "Let's find the<br><em>growth lever.</em>",
      'A strategist will reach out within 24 hours to set up a working session.'],
  },
  creator: {
    label: 'Creator Application',
    steps: () => ['creatorSocials', 'creatorAudience', 'creatorWork'],
    kicker: 'Creator network',
    copy: 'We pair creators with businesses that need real audiences — local brands, launches, and long-term partnerships.',
    done: ['Application received', 'Welcome to the<br><em>creator bench.</em>',
      "We review every profile. When a brand is a strong fit for your audience, we'll reach out with the details."],
  },
  sponsor: {
    label: 'Influencer Request',
    steps: () => ['sponsorGoal', 'sponsorAudience', 'sponsorBudget'],
    kicker: 'Influencer partnerships',
    copy: "Tell us who you need to reach. We'll match you with creators whose audience already trusts them.",
    done: ['Request received', 'Your creator shortlist<br><em>is in motion.</em>',
      "We'll match your goals against our creator network and reach out with a shortlist and next steps."],
  },
  other: {
    label: 'General Inquiry',
    steps: () => ['otherMsg'],
    kicker: 'General inquiries',
    copy: "Tell us what you need and we'll route it to the right person on the team.",
    done: ['Message received', 'Thanks for<br><em>reaching out.</em>',
      'The right person on our team will get back to you within 24 hours.'],
  },
};

// /form/?type=crm skips the first question. A few friendly aliases for links and ads.
const TYPE_ALIASES = { site: 'website', web: 'website', sales: 'consulting', consult: 'consulting', marketing: 'consulting', influencer: 'creator', brand: 'sponsor' };
const EMAIL_REQUIRED = ['creator'];

// Shared option lists (data-options="@name"). The CRM matches creators to
// sponsors on these exact strings, so both sides must stay identical.
const OPTION_SETS = {
  niches: 'Lifestyle|Food & drink|Fitness & health|Beauty & fashion|Home & family|Business & finance|Tech|Travel|Local / city|Automotive|Gaming|Other',
};

const S = {
  step: 'type', history: ['type'], type: null, mode: 'text',
  data: {}, leadId: newId(), utm: readUtm(), lastPartial: '', submitted: false,
};

const $ = id => document.getElementById(id);
const stepEl = key => key && $(`step-${key}`);

// ── FLOW ─────────────────────────────────────────────────────
function flow() {
  const middle = S.type ? TYPES[S.type].steps() : ['', '', ''];
  return ['type', 'contact', ...middle, 'done'];
}

function renderProgress() {
  const f = flow(), total = f.length - 1;
  const cur = S.step === 'done' ? total + 1 : f.indexOf(S.step) + 1;
  const dots = $('progressDots');
  dots.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < cur ? ' done' : i === cur ? ' active' : '');
    dots.appendChild(d);
  }
  $('stepCounter').textContent = Math.min(cur, total);
  $('totalSteps').textContent = total;
}

function showStep(key) {
  const target = stepEl(key); if (!target) return;
  document.querySelectorAll('.step.active').forEach(e => e.classList.remove('active'));
  target.classList.add('active');
  S.step = key;
  $('formCard').classList.toggle('wide', key === 'vision');
  if (key === 'contact') syncContactCopy();
  if (key === 'vision') syncVisionCopy();
  if (key === 'done') renderDone();
  renderProgress();
  const top = $('formCard').getBoundingClientRect().top;
  if (top < 0) window.scrollTo({ top: window.scrollY + top - 110, behavior: 'smooth' });
}
function goToStep(key) { S.history.push(key); showStep(key); }
function goBack() { if (S.history.length > 1) { S.history.pop(); showStep(S.history[S.history.length - 1]); } }

function advance() {
  if (S.submitted) return;
  const key = S.step;
  if (!validateStep(key)) return;
  if (key === 'contact') savePartial();
  const f = flow(), next = f[f.indexOf(key) + 1];
  if (next === 'done') finish(); else goToStep(next);
}

// ── CHOICES ──────────────────────────────────────────────────
function chooseType(t) { setType(t); goToStep('contact'); }

function setType(t) {
  S.type = t;
  document.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('selected', b.dataset.type === t));
  $('contextKicker').textContent = TYPES[t].kicker;
  $('contextCopy').textContent = TYPES[t].copy;
}

function chooseWebsite(answer) {
  S.data.hasWebsite = answer;
  document.querySelectorAll('[data-site]').forEach(b => b.classList.toggle('selected', b.dataset.site === answer));
  advance();
}

document.addEventListener('click', e => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const set = chip.closest('.chip-set');
  if (set.dataset.mode === 'single') {
    set.querySelectorAll('.chip.selected').forEach(c => { if (c !== chip) { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); } });
  }
  chip.classList.toggle('selected');
  chip.setAttribute('aria-pressed', chip.classList.contains('selected'));
});

// Enter moves forward from single-line fields (not textareas, not the sketch step).
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const t = e.target;
  if (!t.matches('input.input-field') || !t.closest('.step.active') || S.step === 'vision') return;
  e.preventDefault();
  advance();
});

// ── COPY ─────────────────────────────────────────────────────
function emailRequired() { return EMAIL_REQUIRED.includes(S.type); }

function syncContactCopy() {
  $('emailOptional').hidden = emailRequired();
  $('contactTitle').innerHTML = S.type === 'creator' ? "Who's the<br><em>creator?</em>" : 'Who are we<br><em>talking to?</em>';
}

function syncVisionCopy() {
  const has = S.data.hasWebsite === 'yes';
  $('visionEyebrow').textContent = has ? 'Your current site' : 'Your vision';
  $('visionTitle').innerHTML = has ? 'Show us what you <em>currently have.</em>' : 'Show us what you <em>have in mind.</em>';
  $('visionLabel').textContent = has ? 'Describe Your Current Website' : 'Describe Your Ideal Website';
  $('websiteDesc').placeholder = has
    ? "e.g. I have a basic Wix site — looks outdated, doesn't rank on Google, and clients can't book online..."
    : 'e.g. Clean, dark site where clients can book an appointment, pay a deposit, and get automatic texts...';
}

function renderDone() {
  const [eyebrow, title, sub] = TYPES[S.type].done;
  $('doneEyebrow').textContent = eyebrow;
  $('doneTitle').innerHTML = title;
  $('doneSub').innerHTML = sub;
}

// ── PHONE ────────────────────────────────────────────────────
// Accepts whatever people type or autofill: "305 555 1234", "+1 (305) 555-1234",
// "1-305-555-1234", "+13055551234", "001 305…". International numbers that
// start with + (or 00) and a non-1 country code are kept as typed.
function parsePhone(raw) {
  const compact = String(raw || '').trim().replace(/[\s().\-]/g, '');

  if (compact === '+' || /^(\+|00)(?!1)\d/.test(compact)) {
    const d = compact.replace(/^00/, '').replace(/\D/g, '');
    const valid = d.length >= 8 && d.length <= 15;
    return { country: 'INTL', digits: d, hadCode: true, valid, e164: valid ? '+' + d : '', display: '+' + d };
  }

  let d = compact.replace(/\D/g, '');
  if (compact.startsWith('00')) d = d.slice(2);
  // North American area codes never start with 1, so a leading 1 is always
  // the country code — whether it came from "+1", "1-305…", or autofill.
  const hadCode = d.startsWith('1');
  if (hadCode) d = d.slice(1);
  const valid = /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
  return { country: 'US', digits: d, hadCode, valid, e164: valid ? '+1' + d : '', display: formatUS(d) };
}

function formatUS(d) {
  if (d.length > 6) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return d ? `(${d}` : '';
}

// What goes back in the box: keep the +1 visible if they typed it, so it
// doesn't vanish under their cursor.
function phoneView(p) {
  if (p.country === 'INTL') return p.display;
  return p.hadCode ? `+1 ${p.display}`.trim() : p.display;
}

function phoneProblem(p) {
  if (p.country === 'INTL') return 'International numbers need the country code plus 8–15 digits.';
  if (p.digits.length < 10) return 'That number looks a few digits short.';
  if (p.digits.length > 10) return 'That number has a few too many digits.';
  return "That doesn't look like a valid US or Canadian number — check the area code.";
}

function updatePhoneHint(p) {
  const hint = $('phoneHint');
  hint.classList.toggle('ok', p.valid);
  hint.textContent = p.valid
    ? `✓ We'll reach you at ${p.country === 'US' ? '+1 ' + p.display : p.display}`
    : PHONE_HINT;
}

function renderPhone() {
  const el = $('phone'), p = parsePhone(el.value);
  el.value = phoneView(p);
  updatePhoneHint(p);
}

// ── VALIDATION ───────────────────────────────────────────────
const VALIDATORS = {
  contact() {
    const phone = parsePhone($('phone').value);
    if (!phone.digits) return fail($('phone'), 'Add a phone number so we can reach you.');
    if (!phone.valid) return fail($('phone'), phoneProblem(phone));
    const email = $('email').value.trim();
    if (!email && emailRequired()) return fail($('email'), 'Creators need an email — brands send briefs there.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail($('email'), 'That email looks off — double-check it?');
    return true;
  },
  creatorSocials() {
    const inputs = [...stepEl('creatorSocials').querySelectorAll('input')];
    return inputs.some(i => i.value.trim()) || fail(inputs[0], 'Add at least one channel so brands can see your work.');
  },
};

function validateStep(key) {
  const step = stepEl(key);
  setError(step, '');
  for (const f of step.querySelectorAll('[data-required]')) {
    const empty = f.classList.contains('chip-set') ? !f.querySelector('.chip.selected')
      : f.type === 'checkbox' ? !f.checked
      : !f.value.trim();
    if (empty) return fail(f, f.dataset.msg || 'This one is required.');
  }
  return VALIDATORS[key] ? VALIDATORS[key]() : true;
}

function fail(field, msg) {
  const step = field.closest('.step');
  const isChips = field.classList.contains('chip-set');
  const target = field.type === 'checkbox' ? field.closest('.check') : field;
  setError(step, msg);
  target.classList.remove('error'); void target.offsetWidth; target.classList.add('error');
  if (isChips || field.type === 'checkbox') target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else field.focus();
  const clear = () => { target.classList.remove('error'); setError(step, ''); };
  field.addEventListener(isChips ? 'click' : field.type === 'checkbox' ? 'change' : 'input', clear, { once: true });
  return false;
}

function setError(step, msg) {
  const el = step && step.querySelector('.step-error');
  if (el) el.textContent = msg;
}

// ── WEBSITE PATH ─────────────────────────────────────────────
function setMode(m) {
  S.mode = m;
  $('modeText').classList.toggle('active', m === 'text');
  $('modeVisual').classList.toggle('active', m === 'visual');
  $('textMode').style.display = m === 'text' ? 'block' : 'none';
  $('visualMode').style.display = m === 'visual' ? 'block' : 'none';
  if (m === 'visual') requestAnimationFrame(() => requestAnimationFrame(initCanvas));
}

function submitWebsiteText() {
  const d = $('websiteDesc');
  if (!d.value.trim()) return fail(d, 'Give us a sentence or two — or switch to "Sketch it".');
  finish();
}

function submitVisual(btn) {
  if (!canvas) { submitWebsiteText(); return; }
  selectedEl = null;
  drawAll();
  finishWithSketch(btn);
}

// ── PAYLOAD ──────────────────────────────────────────────────
function collect() {
  const lead = {}, details = {}, labels = {};
  for (const step of flow().map(stepEl).filter(Boolean)) {
    step.querySelectorAll('[data-field]').forEach(f => {
      let v;
      if (f.classList.contains('chip-set')) {
        const picked = [...f.querySelectorAll('.chip.selected')].map(c => c.dataset.value);
        if (!picked.length) return;
        v = f.dataset.mode === 'single' ? picked[0] : picked;
      } else if (f.type === 'checkbox') {
        v = f.checked;
      } else {
        v = f.value.trim();
        if (!v) return;
        if (f.dataset.kind === 'handle') v = cleanHandle(v);
        if (f.dataset.kind === 'url') v = cleanUrl(v);
      }
      const key = f.dataset.field;
      if (f.dataset.scope === 'lead') { lead[key] = v; return; }
      const group = f.dataset.group;
      const bucket = group ? (details[group] = details[group] || {}) : details;
      bucket[key] = v;
      labels[group ? `${group}.${key}` : key] = f.dataset.label || key;
    });
  }
  return { lead, details, labels };
}

function summarize(lead, details, labels) {
  const lines = [`Inquiry: ${TYPES[S.type].label}`];
  if (lead.businessType) lines.push(`Business: ${lead.businessType}`);
  if (S.type === 'website') {
    if (S.data.hasWebsite) lines.push(`Has website: ${S.data.hasWebsite}`);
    const desc = $('websiteDesc').value.trim();
    if (desc) lines.push(`Description: ${desc}`);
  }
  for (const [k, v] of Object.entries(details)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${k[0].toUpperCase() + k.slice(1)}: ` + Object.entries(v).map(([p, h]) => `${labels[`${k}.${p}`] || p} ${h}`).join(' · '));
    } else {
      lines.push(`${labels[k] || k}: ${Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v}`);
    }
  }
  return lines.join('\n');
}

function buildPayload(status) {
  const { lead, details, labels } = collect();
  const phone = parsePhone($('phone').value);
  const summary = summarize(lead, details, labels);
  const p = {
    leadId: S.leadId,
    formVersion: FORM_VERSION,
    source: 'edgeform-form',
    inquiryType: S.type,
    inquiryLabel: TYPES[S.type].label,
    status,
    complete: status === 'complete',
    autoSave: status === 'partial',
    name: lead.name || '',
    email: lead.email || '',
    phone: phone.display,
    phoneE164: phone.e164,
    phoneCountry: phone.country,
    businessType: lead.businessType || '',
    details,
    summary,
    hasSketch: false,
    timestamp: new Date().toISOString(),
    pageUrl: location.href,
    referrer: document.referrer || '',
    utm: S.utm,
  };
  if (S.type === 'website') {
    p.hasWebsite = S.data.hasWebsite || '';
    p.websiteDescription = $('websiteDesc').value.trim();
    p.inputMode = S.mode;
  }
  return p;
}

// Partial lead as soon as we have a reachable contact. Same leadId as the
// final submit, so the CRM can upsert instead of duplicating. Re-sent only
// if something meaningful changed (e.g. they went back and switched type).
function savePartial() {
  const name = $('name').value.trim(), phone = parsePhone($('phone').value);
  if (!S.type || !name || !phone.valid || S.submitted) return;
  const sig = [S.type, name, phone.e164, $('email').value.trim()].join('|');
  if (sig === S.lastPartial) return;
  S.lastPartial = sig;
  post(buildPayload('partial'));
  showBadge();
}

function finish() {
  if (S.submitted) return;
  S.submitted = true;
  post(buildPayload('complete'));
  S.history = ['done'];
  showStep('done');
}

// The sketch upload needs the lead to exist first (404 otherwise), so this
// waits for the complete submission, then uploads, then shows the done screen.
async function finishWithSketch(btn) {
  if (S.submitted) return;
  S.submitted = true;
  btn.disabled = true;
  btn.textContent = 'Sending your sketch…';
  const p = buildPayload('complete');
  p.inputMode = 'visual';
  p.hasSketch = true;
  p.websiteDescription = p.websiteDescription || '[Visual sketch provided]';
  try {
    await post(p);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (blob) await uploadSketch(p.leadId, blob);
  } catch (e) { /* the lead itself is saved; don't trap them on this screen */ }
  S.history = ['done'];
  showStep('done');
}

function post(payload) {
  return fetch(CRM_API, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// Not keepalive: images are usually over the 64KB keepalive cap. Re-uploading
// for the same leadId replaces the image, so one retry is safe.
async function uploadSketch(leadId, blob) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CRM_API}/${encodeURIComponent(leadId)}/sketch`, {
        method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob,
      });
      if (res.ok || res.status === 413 || res.status === 415) return res;
    } catch (e) { /* network hiccup: retry once */ }
  }
}

function showBadge() {
  const b = $('autoSaveBadge');
  b.classList.add('visible');
  setTimeout(() => b.classList.remove('visible'), 3000);
}

// ── HELPERS ──────────────────────────────────────────────────
function cleanHandle(v) {
  if (/^(https?:\/\/|www\.)/i.test(v) || /\.[a-z]{2,}\//i.test(v)) return cleanUrl(v);
  return '@' + v.replace(/^@+/, '').replace(/\s+/g, '');
}
function cleanUrl(v) { return /^https?:\/\//i.test(v) ? v : 'https://' + v.replace(/^\/+/, ''); }

function readUtm() {
  const q = new URLSearchParams(location.search), out = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => { const v = q.get(k); if (v) out[k.slice(4)] = v; });
  return out;
}

function newId() {
  return (window.crypto && crypto.randomUUID && crypto.randomUUID())
    || 'lead-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ── INIT ─────────────────────────────────────────────────────
(function init() {
  document.querySelectorAll('.chip-set[data-options]').forEach(set => {
    set.setAttribute('role', 'group');
    const opts = set.dataset.options;
    (opts.startsWith('@') ? OPTION_SETS[opts.slice(1)] : opts).split('|').forEach(opt => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.value = opt;
      b.textContent = opt;
      b.setAttribute('aria-pressed', 'false');
      set.appendChild(b);
    });
  });

  document.querySelectorAll('textarea.input-field').forEach(t => { t.maxLength = TEXT_MAX; });
  document.querySelectorAll('input.input-field').forEach(i => { if (i.maxLength < 0) i.maxLength = 200; });

  document.querySelectorAll('.step').forEach(step => {
    const btn = step.querySelector('.btn-primary');
    if (!btn) return;
    const err = document.createElement('p');
    err.className = 'step-error';
    err.setAttribute('role', 'alert');
    btn.before(err);
  });

  const phone = $('phone');
  updatePhoneHint(parsePhone(''));
  // Reformat as they type, but not on deletes — otherwise backspacing a ")"
  // would put it straight back.
  phone.addEventListener('input', e => {
    if ((e.inputType || '').startsWith('delete')) updatePhoneHint(parsePhone(phone.value));
    else renderPhone();
  });
  phone.addEventListener('blur', () => { renderPhone(); savePartial(); });
  $('name').addEventListener('blur', savePartial);
  $('email').addEventListener('blur', savePartial);

  const q = new URLSearchParams(location.search);
  let t = (q.get('type') || '').toLowerCase();
  t = TYPE_ALIASES[t] || t;
  if (TYPES[t]) {
    setType(t);
    S.history = ['type', 'contact'];
    showStep('contact');
  } else {
    showStep('type');
  }
})();
