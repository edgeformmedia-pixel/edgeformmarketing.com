(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.progress');
  const toggle = document.querySelector('.menu-toggle');

  // Mobile menu
  toggle?.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.site-nav a').forEach(a => a.addEventListener('click', () => {
    header.classList.remove('nav-open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));

  // Split headings into lines for the line-rise reveal
  document.querySelectorAll('[data-lines]').forEach(el => {
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts.map((p, i) => `<span class="ln"><span style="--i:${i}">${p}</span></span>`).join('');
  });

  // Stagger children
  document.querySelectorAll('[data-stagger]').forEach(group => {
    [...group.children].forEach((child, i) => {
      if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', group.dataset.stagger || '');
      child.style.setProperty('--i', i);
    });
  });

  // Count-up numbers
  const countUp = el => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (reduced) { el.textContent = target + suffix; return; }
    const start = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - start) / 1400);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4))) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Reveal on scroll
  const targets = document.querySelectorAll('[data-reveal],[data-wipe],[data-lines],.rule,[data-count]');
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach(el => { el.classList.add('in'); if (el.dataset.count) countUp(el); });
  } else {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      if (entry.target.dataset.count) countUp(entry.target);
      io.unobserve(entry.target);
    }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(el => io.observe(el));
  }

  // Scroll-linked effects: header state, progress bar, parallax, step rail
  const parallax = [...document.querySelectorAll('[data-parallax]')];
  const steps = document.querySelector('.steps');
  const stepItems = steps ? [...steps.querySelectorAll('li')] : [];
  const rail = steps?.querySelector('.rail');
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY;
    const vh = innerHeight;
    header?.classList.toggle('scrolled', y > 24);
    if (progress) {
      const max = root.scrollHeight - vh;
      progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    }
    if (!reduced) {
      parallax.forEach(el => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const speed = Number(el.dataset.parallax) || .12;
        el.style.transform = `translate3d(0, ${(r.top + r.height / 2 - vh / 2) * -speed}px, 0)`;
      });
    }
    if (steps) {
      const r = steps.getBoundingClientRect();
      const fill = Math.max(0, Math.min(1, (vh * .62 - r.top) / r.height));
      rail.style.setProperty('--fill', fill);
      stepItems.forEach(li => li.classList.toggle('on', li.getBoundingClientRect().top < vh * .62));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();

  // Live site previews: render iframes at desktop width and scale to fit
  const views = document.querySelectorAll('.browser-view');
  const fit = view => {
    const frame = view.querySelector('iframe');
    if (frame) view.style.setProperty('--s', view.clientWidth / 1440);
  };
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(entries => entries.forEach(e => fit(e.target)));
    views.forEach(v => ro.observe(v));
  } else {
    views.forEach(fit);
    addEventListener('resize', () => views.forEach(fit));
  }
  views.forEach(view => {
    const frame = view.querySelector('iframe');
    frame?.addEventListener('load', () => view.querySelector('.loading')?.remove());
  });
})();
