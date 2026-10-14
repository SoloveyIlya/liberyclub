let trackingMemory;
function trackingContext() {
  const params = new URLSearchParams(location.search);
  const keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  let context = trackingMemory;
  try { context = JSON.parse(sessionStorage.getItem('tracking') || 'null') || context; } catch {}
  const campaign = keys.some(key => params.has(key));
  const signature = keys.map(key => params.get(key) || '').join('|');
  if (!context || Date.now() - context.updated > 30 * 60 * 1000 || campaign && context.signature !== signature) {
    let referrer = '';
    try { const ref = new URL(document.referrer); if (ref.origin !== location.origin) referrer = ref.hostname; } catch {}
    context = { sid: crypto.randomUUID(), signature: campaign ? signature : context?.signature || signature, attribution: !campaign && context ? context.attribution : { ...Object.fromEntries(keys.map(key => [key, (params.get(key) || '').slice(0,300)])), referrer } };
  }
  context.updated = Date.now();
  trackingMemory = context;
  try { sessionStorage.setItem('tracking', JSON.stringify(context)); } catch {}
  return context;
}
function track(type, extra = {}) {
  try {
    const {sid, attribution} = trackingContext();
    const body = JSON.stringify({ type, sid, attribution, ...extra });
    const blob = new Blob([body], {type:'application/json'});
    if (navigator.sendBeacon && navigator.sendBeacon('/api/event', blob)) return;
    fetch('/api/event', {method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  } catch { /* Аналитика не должна мешать работе сайта. */ }
}

function withUTM(href) {
  const url = new URL(href, location.href);
  const { attribution } = trackingContext();
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
    if (attribution[key] && !url.searchParams.has(key)) url.searchParams.set(key, attribution[key]);
  }
  return url.href;
}
// Проставляем метки заранее: они сохранятся и при открытии анкеты в новой вкладке.
try {
  for (const link of document.querySelectorAll('a[href]')) {
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && /\/(?:index|quiz)\.html$|\/$/.test(url.pathname)) link.href = withUTM(link.href);
  }
} catch { /* Переходы должны работать даже без хранилища аналитики. */ }
