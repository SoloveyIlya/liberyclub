import { test } from 'node:test';
import assert from 'node:assert/strict';
import { report } from './analytics-report.js';
const a = {utm_source:'telegram',utm_campaign:'oct'};
const event = (type,sid,t,extra={})=>({type,sid,t:Date.parse(t),...extra});
test('date boundaries, daily counts, deduplication, watch maxima, UTM and leads',()=>{
 const events=[event('view','session-a','2026-10-13T20:59:59Z',{attribution:a}), event('view','session-b','2026-10-13T21:00:00Z',{attribution:a}),event('view','session-b','2026-10-14T01:00:00Z',{attribution:a}),event('play','session-b','2026-10-14T01:00:01Z'),event('watch','session-b','2026-10-14T01:01:00Z',{position:60}),event('watch','session-b','2026-10-14T01:02:00Z',{position:120}),event('watch','session-c','2026-10-14T01:02:00Z',{position:30}),event('cta','session-b','2026-10-14T01:03:00Z'),event('lead','session-b','2026-10-14T01:04:00Z',{name:'Test',intent:'yes'}),event('view','session-d','2026-10-14T21:00:00Z')];
 const r=report(events,'2026-10-14','2026-10-14');
 assert.equal(r.visits,1); assert.equal(r.plays,1); assert.equal(r.clicks,1); assert.equal(r.leads,1); assert.equal(r.average,75); assert.equal(r.days.length,1); assert.equal(r.days[0].average,75); assert.equal(r.recent[0].attribution.utm_source,'telegram'); assert.equal(r.sources.find(s=>s.attribution?.utm_source==='telegram').leads,1);
});
test('empty ranges and legacy data remain unknown rather than fabricated',()=>{
 const empty=report([],'2026-10-14','2026-10-15'); assert.equal(empty.average,null); assert.equal(empty.days.length,2); assert.equal(empty.days[0].date,'2026-10-15');
 const old=report([event('view','old','2026-10-14T10:00:00Z')],'2026-10-14','2026-10-14'); assert.equal(old.sources[0].attribution,null); assert.equal(old.clicks,0); assert.equal(old.average,null);
});
