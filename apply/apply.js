// Campaign application page (edgeform-crm CONTRACT.md §9). Talks to the CRM's public, no-auth API.
// Add ?mock=1 to run against mock.js instead (nothing is remembered between visits — it's a public page).
(function () {
  const API = 'https://edgeform-crm-api.edgeformmedia.workers.dev/api/public/v1';
  const PRIVACY_URL = 'https://affiliate.edgeformmarketing.com/privacy.html';

  const params = new URLSearchParams(location.search);
  const isMock = params.get('mock') === '1';
  const slug = (params.get('c') || '').trim().toLowerCase();
  const refCode = (params.get('r') || '').trim().slice(0, 16) || null;
  const root = document.getElementById('ap-root');
  const DRAFT_KEY = 'efmg_apply_draft_' + slug;

  if (isMock) document.getElementById('ap-mock').innerHTML = '<span class="ap-mock" title="Sample data, nothing is sent.">Demo data</span>';

  // ── Formatting ──

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = (cents, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
  const number = (n) => new Intl.NumberFormat('en-US').format(n || 0);
  const date = (value) => value
    ? new Date(value.length === 10 ? value + 'T12:00:00Z' : value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  // 500 basis points → "5%", 550 → "5.5%".
  const percentBps = (bps) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format((bps || 0) / 100)}%`;
  const PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
  const platformName = (p) => PLATFORM[p] || p;
  const platformList = (list, type = 'disjunction') => new Intl.ListFormat('en', { style: 'long', type }).format((list || []).map(platformName));

  // Only ever render https links the CRM gave us — never javascript:, data:, or http inside a frame.
  function https(url) {
    try {
      const u = new URL(String(url || ''));
      return u.protocol === 'https:' ? u.href : null;
    } catch { return null; }
  }
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

  // ── API ──

  class ApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }

  async function send(method, path, body) {
    let status, data;
    if (isMock) {
      ({ status, body: data } = await window.ApplyMock.handle(method, path, body));
    } else {
      let response;
      try {
        response = await fetch(API + path, {
          method,
          headers: body === undefined ? {} : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch {
        throw new ApiError(0, 'network_error', 'offline');
      }
      status = response.status;
      data = await response.json().catch(() => ({}));
    }
    if (status >= 200 && status < 300 && data.ok !== false) return data;
    throw new ApiError(status, data.code || 'error', data.error || '');
  }

  const ERRORS = {
    already_applied: "You've already applied to this one. We'll email you as soon as it's reviewed.",
    applications_closed: 'Applications for this campaign are closed right now.',
    not_found: "This campaign isn't taking applications anymore.",
    rate_limited: 'Too many attempts. Wait a few minutes and try again.',
    network_error: "Couldn't reach us. Check your connection and try again — your answers are saved."
  };
  const errorMessage = (error) => ERRORS[error.code] || (error.code === 'validation_error' && error.message) || 'Something went wrong. Please try again.';

  // ── Page states ──

  function message(title, body) {
    document.title = 'Apply | Edgeform Marketing Group';
    root.innerHTML = `
      <div class="ap-wrap"><div class="ap-message ap-panel ap-in">
        <h1>${esc(title)}</h1>
        <p>${esc(body)}</p>
        <a class="btn" href="/">Go to edgeformmarketing.com</a>
      </div></div>`;
  }
  const notFound = () => message("This link doesn't lead anywhere", 'It may have been mistyped, or the campaign has wrapped up. Double-check the link with whoever sent it to you.');
  const closed = () => message('Applications are closed', "Applications for this campaign are closed right now. If someone sent you this link, ask them whether there's another campaign open.");

  // ── Rendering ──

  function payCopy(c) {
    const brand = esc(c.brand_name || c.name);
    const cpm = esc(money(c.starting_cpm_rate_cents, c.currency));
    const platforms = esc(platformList(c.platforms_allowed));
    // Wording is fixed in CONTRACT.md §9 — keep it word for word.
    return `
      <p>You post about ${brand} on ${platforms}. Every Sunday we count the new views each of your videos
      picked up that week, and you're paid ${cpm} for every 1,000 of them. A video keeps earning every week for
      as long as the campaign is running — there's no cut-off date and no limit on how many videos you post.</p>
      <p><strong>${cpm} per 1,000 views is where everyone starts.</strong> As your videos deliver, your rate goes up
      with your level — Rookie, General, Master, Top Creator. Levels are set by Edgeform across every campaign
      you're on, not campaign by campaign, so a raise you earn here follows you to the next one.</p>
      ${c.team_bonus_bps > 0 ? `
      <p><strong>Bring other creators in and you earn a ${esc(percentBps(c.team_bonus_bps))} team bonus</strong> on what
      they're paid for their own views, for as long as they're posting. Edgeform pays it on top of their pay — their
      rate is never reduced to fund yours, and you earn it on their <em>views</em>, never on them signing up.
      There's no fee to apply and nothing to buy, now or later.</p>` : `
      <p>There's no fee to apply and nothing to buy, now or later.</p>`}`;
  }

  function facts(c) {
    const rows = [
      ['Starting pay', `${money(c.starting_cpm_rate_cents, c.currency)} per 1,000 views`],
      ['Platforms', platformList(c.platforms_allowed, 'conjunction')],
      ['Views counted', 'Every Sunday'],
      ['Paid', 'Weekly'],
      c.min_views_to_qualify ? ['Minimum to earn', `${number(c.min_views_to_qualify)} views per video`] : null,
      ['Videos', c.requires_video_approval ? 'Reviewed before they count' : 'Count right away'],
      ['Dates', `${date(c.start_date)} – ${c.end_date ? date(c.end_date) : 'ongoing'}`],
      c.closes_at ? ['Applications close', date(c.closes_at)] : null
    ].filter(Boolean);
    return `<dl class="ap-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  function promo(c) {
    const url = https(c.promo_url);
    if (!url) return '';
    const image = https(c.promo_image_url);
    const fallback = `<a class="ap-promo-fallback" href="${esc(url)}" target="_blank" rel="noopener">
      ${image ? `<img src="${esc(image)}" alt="Preview of ${esc(host(url))}" loading="lazy">`
        : `<span class="ap-promo-host">${esc(host(url))}</span><span class="ap-muted">Tap to open the site</span>`}
    </a>`;
    return `
      <section class="ap-section ap-in">
        <h2>What you'd be promoting</h2>
        <div class="ap-panel ap-promo">
          <div class="ap-promo-bar">
            <span>${esc(host(url))}</span>
            <a href="${esc(url)}" target="_blank" rel="noopener">Open in a new tab ↗</a>
          </div>
          <div class="ap-promo-frame" id="ap-promo-frame" data-fallback="${esc(fallback)}">
            ${c.promo_embed
              ? `<iframe src="${esc(url)}" title="${esc(host(url))}" loading="lazy" referrerpolicy="no-referrer"
                   sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe>`
              : fallback}
          </div>
        </div>
      </section>`;
  }

  function examples(c) {
    const vids = (c.example_videos || []).filter(v => https(v.url));
    if (!vids.length) return '';
    return `
      <section class="ap-section ap-in">
        <h2>Videos that worked</h2>
        <div class="ap-examples">${vids.map(v => {
          const thumb = https(v.thumbnail_url);
          const embed = https(v.embed_url);
          const name = esc(platformName(v.platform));
          const face = `${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : `<span class="ap-example-platform">${name}</span>`}
            <span class="ap-example-play" aria-hidden="true">▶</span>`;
          return `<figure class="ap-example">
            ${embed
              ? `<button type="button" class="ap-example-media" data-embed="${esc(embed)}" aria-label="Play example${v.caption ? ': ' + esc(v.caption) : ''}">${face}</button>`
              : `<a class="ap-example-media" href="${esc(https(v.url))}" target="_blank" rel="noopener" aria-label="Open example on ${name}">${face}</a>`}
            <figcaption>${v.caption ? `<span>${esc(v.caption)}</span>` : ''}
              <a href="${esc(https(v.url))}" target="_blank" rel="noopener">Watch on ${name} ↗</a></figcaption>
          </figure>`;
        }).join('')}</div>
      </section>`;
  }

  const AUDIENCE = [['under_5k', 'Under 5K'], ['5k_25k', '5K–25K'], ['25k_100k', '25K–100K'], ['100k_500k', '100K–500K'], ['500k_plus', '500K+']];
  const CADENCE = [['1_2_week', '1–2 a week'], ['3_5_week', '3–5 a week'], ['6_plus_week', '6 or more a week'], ['not_sure', 'Not sure yet']];
  const NICHES = ['Business', 'Tech', 'AI', 'Marketing', 'Finance', 'Lifestyle', 'Education', 'Comedy', 'Beauty', 'Fashion', 'Fitness', 'Food', 'Travel', 'Other'];
  const COUNTRIES = ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'MX', 'BR', 'CO', 'AR', 'CL', 'PE', 'ES', 'FR', 'DE', 'IT', 'NL', 'PT', 'SE', 'NO', 'DK', 'PL',
    'PH', 'IN', 'ID', 'MY', 'SG', 'NG', 'ZA', 'KE', 'AE', 'JP', 'KR'];
  const HANDLES = [['instagram', 'Instagram', '@yourhandle'], ['tiktok', 'TikTok', '@yourhandle'], ['youtube', 'YouTube', '@channel or channel link']];

  const fieldError = (key) => `<div class="ap-field-error" id="err-${key}" hidden></div>`;
  const REQ = ' <span class="ap-req" aria-hidden="true">*</span>';
  const OPT = ' <span class="ap-muted">(optional)</span>';

  function question(q) {
    const id = 'q-' + q.id;
    const name = 'q_' + q.id;
    const help = q.help ? `<div class="ap-hint">${esc(q.help)}</div>` : '';
    const max = q.max_length ? ` maxlength="${Number(q.max_length)}"` : '';
    let input;
    switch (q.type) {
      case 'long_text':
        input = `<textarea class="ap-input" id="${id}" name="${name}" rows="3"${max}></textarea>`; break;
      case 'select':
        input = `<select class="ap-input" id="${id}" name="${name}"><option value="">Choose one</option>${q.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>`; break;
      case 'multi_select':
        input = `<div class="ap-choices" id="${id}">${q.options.map(o => `<label class="ap-choice"><input type="checkbox" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>`; break;
      case 'boolean':
        input = `<div class="ap-choices" id="${id}">${['Yes', 'No'].map(o => `<label class="ap-choice"><input type="radio" name="${name}" value="${o.toLowerCase()}"><span>${o}</span></label>`).join('')}</div>`; break;
      case 'url':
        input = `<input class="ap-input" id="${id}" name="${name}" type="url" inputmode="url" autocomplete="off" placeholder="https://">`; break;
      case 'number':
        input = `<input class="ap-input" id="${id}" name="${name}" type="number" inputmode="numeric" min="0" step="any">`; break;
      default:
        input = `<input class="ap-input" id="${id}" name="${name}" type="text"${max}>`;
    }
    const labelFor = q.type === 'multi_select' || q.type === 'boolean' ? '' : ` for="${id}"`;
    return `<div class="ap-field"><label class="ap-label"${labelFor}>${esc(q.label)}${q.required ? REQ : OPT}</label>${input}${help}${fieldError(name)}</div>`;
  }

  function countryOptions() {
    let names;
    try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { names = { of: (code) => code }; }
    const rest = COUNTRIES.slice(1).map(code => [code, names.of(code)]).sort((a, b) => a[1].localeCompare(b[1]));
    return [['US', names.of('US')], ...rest].map(([code, n]) => `<option value="${code}">${esc(n)}</option>`).join('');
  }

  const select = (id, name, options) =>
    `<select class="ap-input" id="${id}" name="${name}"><option value="">Choose one</option>${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;

  function form(c) {
    return `
      <section class="ap-section ap-in" id="ap-apply">
        <h2>Apply</h2>
        <div class="ap-panel ap-pad" id="ap-form-panel">
          <form id="ap-form" novalidate>
            <fieldset>
              <legend>About you</legend>
              <div class="ap-row">
                <div class="ap-field"><label class="ap-label" for="f-name">Name${REQ}</label>
                  <input class="ap-input" id="f-name" name="name" autocomplete="name" maxlength="160">${fieldError('name')}</div>
                <div class="ap-field"><label class="ap-label" for="f-email">Email${REQ}</label>
                  <input class="ap-input" id="f-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com">
                  <div class="ap-hint">We'll email you our decision here.</div>${fieldError('email')}</div>
              </div>
              <div class="ap-row">
                <div class="ap-field"><label class="ap-label" for="f-phone">Phone${OPT}</label>
                  <input class="ap-input" id="f-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
                <div class="ap-field"><label class="ap-label" for="f-country">Country</label>
                  <select class="ap-input" id="f-country" name="country"><option value="">Choose one</option>${countryOptions()}<option value="other">Somewhere else</option></select></div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Where you post</legend>
              <div class="ap-field"><label class="ap-label">Your accounts${REQ}</label>
                <div class="ap-handles">${HANDLES.map(([key, label, ph]) => `
                  <div class="ap-handle"><span>${label}</span>
                    <input class="ap-input" id="f-${key}" name="${key}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="300" placeholder="${ph}" aria-label="${label} handle"></div>`).join('')}
                </div>
                <div class="ap-hint">At least one.</div>${fieldError('handles')}</div>
              <div class="ap-field"><label class="ap-label">Which would you post this on?${REQ}</label>
                <div class="ap-choices">${c.platforms_allowed.map(p => `<label class="ap-choice"><input type="checkbox" name="platforms" value="${esc(p)}"${c.platforms_allowed.length === 1 ? ' checked' : ''}><span>${esc(platformName(p))}</span></label>`).join('')}</div>
                ${fieldError('platforms')}</div>
              <div class="ap-row">
                <div class="ap-field"><label class="ap-label" for="f-audience">Followers on your biggest account</label>${select('f-audience', 'audience_size', AUDIENCE)}</div>
                <div class="ap-field"><label class="ap-label" for="f-cadence">How often you could post</label>${select('f-cadence', 'posting_cadence', CADENCE)}</div>
              </div>
              <div class="ap-field"><label class="ap-label">What you usually post about</label>
                <div class="ap-choices">${NICHES.map(n => `<label class="ap-choice"><input type="checkbox" name="niches" value="${n}"><span>${n}</span></label>`).join('')}</div></div>
              <div class="ap-field"><label class="ap-label" for="f-portfolio">Portfolio or media kit${OPT}</label>
                <input class="ap-input" id="f-portfolio" name="portfolio_url" type="url" inputmode="url" autocomplete="off" placeholder="https://">${fieldError('portfolio_url')}</div>
            </fieldset>

            ${(c.questions || []).length ? `
            <fieldset>
              <legend>About this campaign</legend>
              ${c.questions.map(question).join('')}
            </fieldset>` : ''}

            <fieldset>
              <legend>Almost done</legend>
              <div class="ap-field"><label class="ap-label" for="f-why">Anything else we should know?${OPT}</label>
                <textarea class="ap-input" id="f-why" name="why" rows="3" maxlength="1000"></textarea>
                <div class="ap-hint"><span id="why-count">0</span> / 1,000</div>${fieldError('why')}</div>
              <label class="ap-check"><input type="checkbox" name="age_confirmed"><span>I'm 18 or older.</span></label>
              ${fieldError('age_confirmed')}
              <label class="ap-check"><input type="checkbox" name="consent"><span>Edgeform can contact me about this application, and I've read the <a href="${PRIVACY_URL}" target="_blank" rel="noopener">privacy policy</a>.</span></label>
              ${fieldError('consent')}
            </fieldset>

            <button class="btn ap-submit" type="submit" id="ap-submit">Send application</button>
            <div class="ap-form-error" id="ap-form-error" role="alert" hidden></div>
            <p class="ap-hint ap-center">Free to apply. We read every application and email you either way.</p>
          </form>
        </div>
      </section>`;
  }

  function render(c) {
    const brand = c.brand_name || c.name;
    document.title = `${brand} · Apply | Edgeform Marketing Group`;
    root.innerHTML = `
      <section class="ap-hero">
        <div class="ap-wrap ap-in">
          <span class="ap-kicker">${esc(brand)} · Creator campaign</span>
          <h1>${esc(c.headline || `Get paid to make videos about ${brand}`)}</h1>
          <div class="ap-rate"><span>${esc(money(c.starting_cpm_rate_cents, c.currency))}</span> per 1,000 views to start</div>
          <div class="ap-chips">${c.platforms_allowed.map(p => `<span>${esc(platformName(p))}</span>`).join('')}</div>
          ${c.referrer_first_name ? `<p class="ap-ref">${esc(c.referrer_first_name)} shared this with you.</p>` : ''}
          <div class="ap-cta"><a class="btn light" href="#ap-apply">Apply now <span class="arrow" aria-hidden="true">→</span></a><span>Free · about 3 minutes</span></div>
        </div>
      </section>
      <div class="ap-wrap">
        ${c.pitch ? `<section class="ap-panel ap-pad ap-pitch ap-in"><p>${esc(c.pitch)}</p></section>` : ''}
        ${promo(c)}
        ${examples(c)}
        <section class="ap-section ap-in">
          <h2>How you get paid</h2>
          <div class="ap-pay">
            <div class="ap-panel ap-pad ap-pay-copy">${payCopy(c)}</div>
            <div class="ap-panel ap-pad">${facts(c)}</div>
          </div>
        </section>
        ${form(c)}
      </div>`;
    wirePromo();
    wireExamples();
    wireForm(c);
  }

  // A frame that never loads turns into the link card, so nobody's left staring at an empty box.
  function wirePromo() {
    const box = document.getElementById('ap-promo-frame');
    const frame = box && box.querySelector('iframe');
    if (!frame) return;
    const timer = setTimeout(() => { box.innerHTML = box.dataset.fallback; }, 8000);
    frame.addEventListener('load', () => clearTimeout(timer));
  }

  // Thumbnails until tapped: several autoplaying embeds would sink a phone on mobile data.
  function wireExamples() {
    root.querySelectorAll('[data-embed]').forEach(btn => btn.addEventListener('click', () => {
      let src = btn.dataset.embed;
      if (/youtube(-nocookie)?\.com\/embed\//.test(src)) src += (src.includes('?') ? '&' : '?') + 'autoplay=1&playsinline=1';
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = btn.getAttribute('aria-label') || 'Example video';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.className = 'ap-example-media';
      btn.replaceWith(frame);
    }));
  }

  // ── Form ──

  const drafts = {
    get() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } },
    set(value) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch {} },
    clear() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
  };

  // In-app browsers reload tabs aggressively, so every keystroke is kept until the form is sent.
  function saveDraft(formEl) {
    const draft = {};
    for (const el of formEl.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) (draft[el.name] = draft[el.name] || []).push(el.value);
      } else draft[el.name] = el.value;
    }
    drafts.set(draft);
  }

  function restoreDraft(formEl) {
    const draft = drafts.get();
    if (!draft) return;
    for (const el of formEl.elements) {
      if (!el.name || !(el.name in draft)) continue;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = [].concat(draft[el.name]).includes(el.value);
      else el.value = draft[el.name];
    }
  }

  // Accepts "mysite.com" as well as "https://mysite.com" — people rarely type the scheme on a phone.
  function normalizeUrl(value) {
    const text = value.trim();
    if (!text) return '';
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text;
    try {
      const u = new URL(withScheme);
      return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null;
    } catch { return null; }
  }

  function collect(formEl, c) {
    const val = (name) => (formEl.elements[name] ? formEl.elements[name].value.trim() : '');
    const checked = (name) => [...formEl.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
    const errors = {};
    const answers = {};

    for (const q of c.questions || []) {
      const name = 'q_' + q.id;
      let value;
      if (q.type === 'multi_select') value = checked(name);
      else if (q.type === 'boolean') { const [v] = checked(name); value = v === undefined ? undefined : v === 'yes'; }
      else {
        const raw = val(name);
        if (!raw) value = undefined;
        else if (q.type === 'number') {
          value = Number(raw);
          if (!Number.isFinite(value) || value < 0) errors[name] = 'Enter a number of 0 or more.';
        } else if (q.type === 'url') {
          value = normalizeUrl(raw);
          if (value === null) errors[name] = "That doesn't look like a link.";
        } else {
          value = raw;
          if (q.max_length && raw.length > q.max_length) errors[name] = `Keep this under ${number(q.max_length)} characters.`;
        }
      }
      const empty = value === undefined || (Array.isArray(value) && !value.length);
      if (empty) { if (q.required) errors[name] = 'This one is required.'; }
      else if (!errors[name]) answers[q.id] = value;
    }

    const portfolio = normalizeUrl(val('portfolio_url'));
    const input = {
      name: val('name'),
      email: val('email').toLowerCase(),
      phone: val('phone'),
      country: /^[A-Z]{2}$/.test(val('country')) ? val('country') : null,
      instagram: val('instagram'),
      tiktok: val('tiktok'),
      youtube: val('youtube'),
      portfolio_url: portfolio || '',
      platforms: checked('platforms'),
      audience_size: val('audience_size'),
      posting_cadence: val('posting_cadence'),
      niches: checked('niches'),
      why: val('why'),
      answers,
      consent: formEl.elements.consent.checked,
      age_confirmed: formEl.elements.age_confirmed.checked,
      ref_code: refCode,
      utm: Object.fromEntries([...params].filter(([k]) => k.startsWith('utm_')).map(([k, v]) => [k.slice(4), v.slice(0, 200)])),
      page_url: location.href,
      referrer: document.referrer || ''
    };

    if (!input.name) errors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = 'Enter a valid email address.';
    if (!input.instagram && !input.tiktok && !input.youtube) errors.handles = 'Add at least one account so we can see your videos.';
    if (!input.platforms.length) errors.platforms = 'Pick at least one.';
    if (portfolio === null) errors.portfolio_url = "That doesn't look like a link.";
    if (input.why.length > 1000) errors.why = 'Keep this under 1,000 characters.';
    if (!input.age_confirmed) errors.age_confirmed = 'You need to be 18 or older to apply.';
    if (!input.consent) errors.consent = 'We need this to get back to you.';
    return { input, errors };
  }

  function showErrors(formEl, errors) {
    formEl.querySelectorAll('.ap-field-error').forEach(el => { el.hidden = true; el.textContent = ''; });
    let first = null;
    for (const [key, text] of Object.entries(errors)) {
      const el = document.getElementById('err-' + key);
      if (!el) continue;
      el.textContent = text;
      el.hidden = false;
      first = first || el;
    }
    if (first) {
      const box = first.closest('.ap-field, fieldset');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = box.querySelector('input, select, textarea');
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  function success(email) {
    drafts.clear();
    document.getElementById('ap-form-panel').innerHTML = `
      <div class="ap-done ap-in" tabindex="-1" id="ap-done">
        <div class="ap-done-mark" aria-hidden="true">✓</div>
        <h3>Application sent</h3>
        <p>We read every application and email you either way, usually within a few days. We'll write to <strong>${esc(email)}</strong>.</p>
        <p class="ap-muted">There's nothing else to do for now.</p>
      </div>`;
    const done = document.getElementById('ap-done');
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    done.focus({ preventScroll: true });
  }

  function wireForm(c) {
    const formEl = document.getElementById('ap-form');
    const submit = document.getElementById('ap-submit');
    const formError = document.getElementById('ap-form-error');
    const why = document.getElementById('f-why');
    const whyCount = document.getElementById('why-count');

    restoreDraft(formEl);
    whyCount.textContent = number(why.value.length);
    let saveTimer;
    formEl.addEventListener('input', (event) => {
      if (event.target === why) whyCount.textContent = number(why.value.length);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveDraft(formEl), 300);
    });
    formEl.addEventListener('change', () => saveDraft(formEl));

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;
      const { input, errors } = collect(formEl, c);
      showErrors(formEl, errors);
      if (Object.keys(errors).length) return;
      submit.disabled = true;
      submit.textContent = 'Sending…';
      try {
        await send('POST', `/campaigns/${encodeURIComponent(slug)}/applications`, input);
        success(input.email);
      } catch (error) {
        if (error.code === 'applications_closed') { drafts.clear(); return closed(); }
        formError.textContent = errorMessage(error);
        formError.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Send application';
      }
    });
  }

  // ── Load ──

  async function load() {
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) return notFound();
    root.innerHTML = '<div class="ap-wrap ap-loading"><span class="ap-spinner"></span>Loading campaign…</div>';
    try {
      const { campaign } = await send('GET', `/campaigns/${encodeURIComponent(slug)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`);
      render(campaign);
    } catch (error) {
      if (error.code === 'not_found') return notFound();
      if (error.code === 'applications_closed') return closed();
      root.innerHTML = `<div class="ap-wrap"><div class="ap-message ap-panel">
        <p>${esc(errorMessage(error))}</p>
        <button class="btn" id="ap-retry">Try again</button></div></div>`;
      document.getElementById('ap-retry').addEventListener('click', load);
    }
  }

  load();
})();
