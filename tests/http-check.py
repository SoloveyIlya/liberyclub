"""Run against an isolated PHP development server, never against production."""
import json, urllib.request, urllib.error, http.cookiejar, subprocess, os
base=os.environ.get('LIBERTY_TEST_URL','http://127.0.0.1:3110/')
php=os.environ.get('PHP_BIN','php')
password=subprocess.check_output([php,'-r',"require 'php/app.php'; echo app_config()['analytics_password'];"]).decode()
jar=http.cookiejar.CookieJar(); client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)); count=0

def request(action,body=None,expected=200):
 global count
 req=urllib.request.Request(base+'api.php?action='+action,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
 try:
  with client.open(req) as r: status=r.status; data=r.read(); headers=r.headers
 except urllib.error.HTTPError as e: status=e.code; data=e.read(); headers=e.headers
 assert status==expected,(action,status,data)
 count+=1
 return json.loads(data),headers
request('analytics',expected=401)
request('login',{'password':'invalid'},401)
_,h=request('login',{'password':password}); assert 'HttpOnly' in h.get('Set-Cookie','') and 'SameSite=Lax' in h.get('Set-Cookie','')
request('analytics&from=2026-02-30&to=2026-10-14',expected=400)
request('analytics&from=2026-10-15&to=2026-10-14',expected=400)
request('analytics&from[]=bad',expected=400)
request('unknown',expected=404)
request('event',expected=405)
request('event',{'type':'lead','sid':'http-test-session'},400)
request('event',{'type':'watch','sid':'http-test-session','position':-1},400)
a={'utm_source':'php_test','utm_medium':'qa','utm_campaign':'php_migration','utm_content':'post','utm_term':'test'}
for event in [{'type':'view'},{'type':'view'},{'type':'play'},{'type':'cta'},{'type':'quiz'},*[{'type':'step','step':i} for i in range(1,7)],{'type':'watch','position':30},{'type':'watch','position':90}]:
 request('event',dict(event,sid='http-test-session',attribution=a))
r,_=request('analytics'); row=next(s for s in r['sources'] if s['attribution'] and s['attribution'].get('utm_source')=='php_test')
assert row['visits']==row['plays']==row['clicks']==row['quizzes']==1 and row['average']==90
assert all(s['count']>=1 for s in r['steps'])
empty,_=request('analytics&from=2099-01-01&to=2099-01-02');assert empty['visits']==0 and len(empty['days'])==2 and not empty['recent'] and not empty['sources']
request('lead',{},400)
request('logout',{});request('analytics',expected=401)
for path in ['config.php','storage/events.php','.env','data/events.jsonl','php/defaults.php']:
 try:
  with client.open(base+path) as r: content=r.read()
 except urllib.error.HTTPError as e:content=e.read()
 assert password.encode() not in content and b'"sid"' not in content, path
print(f'PASS {count} HTTP requests; auth, cookies, validation, UTM, daily metrics, dates, logout, protected files')
