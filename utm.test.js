import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const code = readFileSync('track.js','utf8');
function page(href, storage = new Map(), blocked = false) {
 const link = {href:'https://site.test/quiz.html'};
 const context = vm.createContext({URL,URLSearchParams,Date,crypto:{randomUUID},location:new URL(href),document:{referrer:'',querySelectorAll:()=>[link]},sessionStorage:{getItem:k=>{if(blocked)throw Error();return storage.get(k)},setItem:(k,v)=>{if(blocked)throw Error();storage.set(k,v)}}});
 vm.runInContext(code,context);
 return {context,link,run:expression=>vm.runInContext(expression,context)};
}
test('all five UTM values survive navigation, reload and a new tab',()=>{
 const storage = new Map();
 const url = 'https://site.test/?utm_source=telegram&utm_medium=social&utm_campaign=oct&utm_content=post%201&utm_term=a%26b';
 const first=page(url,storage); const sid=first.run('trackingContext().sid');
 for(const p of [page(first.link.href,storage),page(first.link.href),page(first.link.href,new Map(),true)]) {
  const a=p.run('trackingContext().attribution'); assert.equal(a.utm_content,'post 1');assert.equal(a.utm_term,'a&b');assert.equal(a.utm_source,'telegram');assert.equal(a.utm_medium,'social');assert.equal(a.utm_campaign,'oct');
  assert.equal(new URL(p.run('withUTM("https://t.me/MelehinCreo")')).searchParams.get('utm_source'),'telegram');
 }
 assert.equal(page(first.link.href,storage).run('trackingContext().sid'),sid);
 const saved=JSON.parse(storage.get('tracking'));saved.updated=0;storage.set('tracking',JSON.stringify(saved));
 assert.equal(page('https://site.test/quiz.html',storage).run('trackingContext().attribution.utm_source'),'telegram');
 assert.equal(page('https://site.test/?utm_source=youtube',storage).run('trackingContext().attribution.utm_source'),'youtube');
});
test('Google Form and Telegram payloads contain attribution without changing the answer',async()=>{
 const source=readFileSync('server.js','utf8'); const start=source.indexOf('function attributionText(');const end=source.indexOf('async function sendToBot(',start);
 let captured;
 const ctx=vm.createContext({URLSearchParams,entries:{vision:'entry.test'},FORM_ACTION:'https://example.test',fetch:async(url,options)=>{captured=options.body;return {ok:true,text:async()=> 'recorded'}}});
 vm.runInContext(source.slice(start,end),ctx);
 vm.runInContext('var lead = {vision:"Original answer", attribution:{utm_source:"telegram",utm_campaign:"oct"}}',ctx);
 assert.match(vm.runInContext('applicationText(lead)',ctx),/utm_source: telegram/);
 await vm.runInContext('saveToSheet(lead)',ctx);
 assert.match(captured.get('entry.test'),/Original answer\n\nИсточник заявки:\nutm_source: telegram/);
 assert.equal(vm.runInContext('lead.vision',ctx),'Original answer');
});
