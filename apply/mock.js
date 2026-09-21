// Stand-in for the CRM's public application API (edgeform-crm CONTRACT.md §9), used only with ?mock=1.
// Demo links: /apply/?c=ulio&mock=1  ·  &r=JRV7K2QX (shared by "Jordan")  ·  /apply/?c=closed-demo&mock=1
// Emails: taken@example.com → already applied; anything starting "ratelimit" → rate limited.
(function () {
  const DAY = 86400000;
  const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  const STORE_KEY = 'efmg_apply_mock_applications';

  const QUESTIONS = [
    { id: 'fit', label: 'What would your first video for this look like?', type: 'long_text', required: true, help: "A sentence or two on the hook or angle you'd use.", options: [], max_length: 600 },
    { id: 'business_calls', label: 'Do you run, or create content for, a business that takes phone calls?', type: 'boolean', required: false, help: '', options: [], max_length: null },
    { id: 'ai_content', label: "Have you made AI or tech content before? Link one.", type: 'url', required: false, help: '', options: [], max_length: null },
    { id: 'typical_views', label: 'Typical views on a recent video', type: 'number', required: false, help: 'A rough number is fine.', options: [], max_length: null },
    { id: 'start_when', label: 'When could you post your first video?', type: 'select', required: true, help: '', options: ['This week', 'Next week', 'Within a month'], max_length: null }
  ];

  const CAMPAIGNS = {
    ulio: {
      slug: 'ulio', name: 'Ulio AI', brand_name: 'Ulio AI', status: 'active',
      headline: 'Get paid for the views on your videos about Ulio AI',
      pitch: [
        'Ulio AI is an AI receptionist for businesses. It picks up the phone, answers questions, books appointments, transfers callers when a person is needed, and sends text and email follow-ups, so a missed call doesn\'t turn into a missed customer.',
        "This isn't an affiliate deal. You're not selling anything, there's no link or discount code to push, and you don't need anyone to sign up. You make content about Ulio, and you're paid on the views it gets.",
        "It's easy to film because it's easy to show. Call it on camera and let people hear it work.",
        'Videos that fit well:\n• Calling it live and showing how it handles a real question or a booking\n• "I let AI answer my business phone for a week," and what happened\n• The missed-call problem: how many calls a small business doesn\'t pick up, and what that costs\n• For agency and AI creators: Ulio is white-label, so an agency can offer it to clients under its own brand',
        "Who we're looking for: creators who talk to small business owners, agency owners, or people interested in AI and automation. You don't need a big following. A clear, honest demo beats a polished ad.",
        "What we ask: show the product actually working, keep it real, and follow the brief you'll get once you're approved. No fake reviews or made-up results."
      ].join('\n\n'),
      platforms_allowed: ['tiktok', 'instagram', 'youtube'], currency: 'USD',
      starting_cpm_rate_cents: 150, team_bonus_bps: 500,
      min_views_to_qualify: 1000, requires_video_approval: true,
      start_date: day(-3), end_date: null, closes_at: day(30),
      promo_url: 'https://ulio.ai/', promo_embed: true, promo_image_url: '',
      // Placeholder clips so the section renders in demo mode — real examples are added in the CRM.
      example_videos: [
        { url: 'https://www.youtube.com/shorts/jNQXAC9IVRw', platform: 'youtube', embed_url: 'https://www.youtube.com/embed/jNQXAC9IVRw', thumbnail_url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', caption: 'Demo placeholder — real example goes here' },
        { url: 'https://www.tiktok.com/@edgeform/video/7412345678901234567', platform: 'tiktok', embed_url: '', thumbnail_url: '', caption: 'Demo placeholder — links out to TikTok' }
      ],
      questions: QUESTIONS
    }
  };

  const REFERRERS = { JRV7K2QX: 'Jordan' };
  const KEYS = ['name', 'email', 'phone', 'country', 'instagram', 'tiktok', 'youtube', 'portfolio_url', 'platforms', 'audience_size',
    'posting_cadence', 'niches', 'why', 'answers', 'consent', 'age_confirmed', 'ref_code', 'utm', 'page_url', 'referrer'];

  const load = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } };
  const save = (list) => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {} };
  const ok = (body, status = 200) => ({ status, body: { ok: true, ...body } });
  const fail = (status, code, error) => ({ status, body: { ok: false, code, error } });

  // Mirrors the server's checks, so a page bug shows up in demo mode too.
  function validate(c, b) {
    const unknown = Object.keys(b).filter(k => !KEYS.includes(k));
    if (unknown.length) return `Unexpected field: ${unknown[0]}.`;
    if (!String(b.name || '').trim()) return 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email || ''))) return 'Enter a valid email address.';
    if (!['instagram', 'tiktok', 'youtube'].some(k => String(b[k] || '').trim())) return 'Add at least one of your social handles.';
    if (!Array.isArray(b.platforms) || !b.platforms.length) return 'Pick at least one platform.';
    if (b.platforms.some(p => !c.platforms_allowed.includes(p))) return "This campaign doesn't accept one of those platforms.";
    if (b.consent !== true || b.age_confirmed !== true) return 'Please confirm the last two boxes.';
    for (const q of c.questions) {
      const v = (b.answers || {})[q.id];
      if (q.required && (v === undefined || v === '' || (Array.isArray(v) && !v.length))) return `Answer: ${q.label}`;
    }
    return null;
  }

  async function handle(method, path, body) {
    await new Promise(r => setTimeout(r, 250));
    const [route, query] = path.split('?');
    const params = new URLSearchParams(query || '');
    let m;
    if (method === 'GET' && (m = route.match(/^\/campaigns\/([^/]+)$/))) {
      if (m[1] === 'closed-demo') return fail(410, 'applications_closed', 'Applications are closed.');
      const c = CAMPAIGNS[m[1]];
      if (!c) return fail(404, 'not_found', 'Campaign not found.');
      const ref = params.get('ref');
      const first = ref && REFERRERS[ref];
      return ok({ campaign: { ...c, referrer_first_name: first || null, ref_code: first ? ref : null } });
    }
    if (method === 'POST' && (m = route.match(/^\/campaigns\/([^/]+)\/applications$/))) {
      if (m[1] === 'closed-demo') return fail(410, 'applications_closed', 'Applications are closed.');
      const c = CAMPAIGNS[m[1]];
      if (!c) return fail(404, 'not_found', 'Campaign not found.');
      const email = String(body.email || '').toLowerCase();
      if (email.startsWith('ratelimit')) return fail(429, 'rate_limited', 'Too many attempts.');
      const problem = validate(c, body);
      if (problem) return fail(400, 'validation_error', problem);
      const list = load();
      if (email === 'taken@example.com' || list.some(a => a.slug === c.slug && a.email === email)) return fail(409, 'already_applied', 'Already applied.');
      list.push({ slug: c.slug, ...body, submitted_at: new Date().toISOString() });
      save(list);
      return ok({ status: 'received' }, 201);
    }
    return fail(404, 'not_found', 'Not found.');
  }

  window.ApplyMock = { handle, applications: load };
})();
