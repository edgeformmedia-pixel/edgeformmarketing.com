(() => {
  const nodes = document.querySelectorAll('.work-copy,.work-card,.case-reveal');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach(node => node.classList.add('work-visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('work-visible');
    observer.unobserve(entry.target);
  }), { threshold: .12, rootMargin: '0px 0px -7% 0px' });
  nodes.forEach(node => observer.observe(node));
})();
