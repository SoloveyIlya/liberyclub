(() => {
  const loader = document.querySelector('.preloader');
  if (!loader) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = performance.now();
  let closing = false;
  loader.hidden = false;
  document.documentElement.classList.add('is-loading');
  const finish = () => {
    if (closing) return;
    closing = true;
    setTimeout(() => {
      loader.classList.add('is-complete');
      document.documentElement.classList.remove('is-loading');
      setTimeout(() => loader.remove(), reduced ? 0 : 450);
    }, Math.max(0, (reduced ? 0 : 1100) - (performance.now() - started)));
  };
  // Никогда не ждём загрузки видео или недоступного внешнего ресурса.
  setTimeout(finish, 2600);
  window.addEventListener('pageshow', event => { if (event.persisted) finish(); });
  const ready = () => {
    const emblem = loader.querySelector('img');
    const preview = document.querySelector('.player img');
    const images = [emblem, preview].filter(Boolean).map(img => img.decode ? img.decode().catch(() => {}) : Promise.resolve());
    Promise.all(images).then(finish);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once:true});
  else ready();
})();
