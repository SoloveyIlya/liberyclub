export function dayKey(t) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
export function report(events, from, to) {
  const selected = events.filter(e => dayKey(e.t) >= from && dayKey(e.t) <= to);
  const count = (rows, type) => new Set(rows.filter(e => e.type === type).map(e => e.sid)).size;
  function metrics(rows) {
    const watched = new Map();
    for (const e of rows) if (e.type === 'watch') watched.set(e.sid, Math.max(watched.get(e.sid) || 0, e.position));
    return { visits: count(rows, 'view'), plays: count(rows, 'play'), clicks: count(rows, 'cta'), quizzes: count(rows, 'quiz'), leads: count(rows, 'lead'), average: watched.size ? [...watched.values()].reduce((a,b) => a+b, 0) / watched.size : null, measured: watched.size };
  }
  const first = new Map();
  for (const e of events) if (!first.has(e.sid) || e.type === 'view' && first.get(e.sid).type !== 'view') first.set(e.sid, e);
  const names = new Map(events.filter(e => e.type === 'lead').map(e => [e.sid, e.name]));
  const attribution = e => e.attribution || first.get(e.sid)?.attribution || null;
  const sources = new Map();
  for (const e of selected) {
    const a = attribution(e);
    const key = JSON.stringify(a);
    if (!sources.has(key)) sources.set(key, { attribution: a, rows: [] });
    sources.get(key).rows.push(e);
  }
  const days = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+1)) {
    const key = d.toISOString().slice(0,10);
    days.push({ date: key, ...metrics(selected.filter(e => dayKey(e.t) === key)) });
  }
  const leads = selected.filter(e => e.type === 'lead');
  const answers = Object.fromEntries(['intent','work','income','target','blocker'].map(key => {
    const values = new Map();
    for (const e of leads) values.set(e[key], (values.get(e[key]) || 0)+1);
    return [key, [...values].map(([label,count]) => ({label,count}))];
  }));
  return { from, to, ...metrics(selected), days: days.reverse(), answers,
    steps: [1,2,3,4,5,6].map(step => ({step, count: new Set(selected.filter(e => e.type === 'step' && e.step === step).map(e => e.sid)).size})),
    sources: [...sources.values()].map(s => ({ attribution:s.attribution, ...metrics(s.rows) })).sort((a,b)=>b.visits-a.visits),
    visitors: selected.filter(e=>e.type==='view').slice(-100).reverse().map(e=>({t:e.t,sid:e.sid,name:names.get(e.sid),attribution:attribution(e)})),
    recent: leads.slice(-20).reverse().map(e=>({...e,attribution:attribution(e)})) };
}
