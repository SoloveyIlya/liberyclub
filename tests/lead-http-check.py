"""Exercise the real PHP lead endpoint with only its outbound HTTP transport mocked."""
import os, pathlib, tempfile, shutil, subprocess, urllib.request, urllib.error, json, time
root=pathlib.Path(__file__).resolve().parent.parent
php=os.environ.get('PHP_BIN','php')
with tempfile.TemporaryDirectory(prefix='liberty-lead-') as folder:
 p=pathlib.Path(folder);(p/'php').mkdir()
 for name in ['api.php','php/app.php','php/defaults.php','php/report.php']:shutil.copy(root/name,p/name)
 (p/'config.php').write_text("<?php return ['telegram_token'=>'TEST_ONLY','analytics_password'=>'test'];")
 app=(p/'php/app.php').read_text();start=app.index('function http_post(');end=app.index('function deliver_lead(',start)
 app=app[:start]+'''function http_post(string $url,string $body,string $type): array {
 $file=__DIR__.'/../calls.jsonl';file_put_contents($file,json_encode([$url,$body,$type])."\\n",FILE_APPEND);
 $fail=is_file(__DIR__.'/../fail');
 return [200,str_contains($url,'docs.google.com') ? 'Your response has been recorded.' : ($fail ? '{"ok":false}' : '{"ok":true}')];
}
'''+app[end:];(p/'php/app.php').write_text(app)
 env=os.environ.copy();env['LIBERTY_STORAGE']=str(p/'storage')
 proc=subprocess.Popen([php,'-S','127.0.0.1:3111','-t',folder],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(50):
   try:urllib.request.urlopen('http://127.0.0.1:3111/config.php');break
   except Exception:time.sleep(.1)
  defaults=json.loads(subprocess.check_output([php,'-r',f"echo json_encode(require '{p}/php/defaults.php');"]))
  lead={k:v[0] for k,v in defaults['options'].items()};lead.update(name='ТЕСТ PHP HTTP',phone='+10000000000',telegram='test_php',vision='Проверка',sid='php-lead-session',attribution={'utm_source':'test','utm_campaign':'migration'})
  def send():
   req=urllib.request.Request('http://127.0.0.1:3111/api.php?action=lead',data=json.dumps(lead).encode(),headers={'Content-Type':'application/json'})
   try:
    with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
   except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
  assert send()==(200,{'ok':True})
  events=[json.loads(x) for x in (p/'storage/events.php').read_text().splitlines()[1:]]
  assert len(events)==1 and events[0]['type']=='lead' and events[0]['attribution']['utm_source']=='test'
  calls=[json.loads(x) for x in (p/'calls.jsonl').read_text().splitlines()];assert len(calls)==3
  assert 'utm_source' in calls[0][1] and 'utm_source' in calls[1][1]
  (p/'fail').touch();status,body=send();assert status==502 and body['ok'] is False
  assert len((p/'storage/events.php').read_text().splitlines())==2
  print('PASS lead HTTP: success, all destinations, UTM, persisted lead; delivery failure returns 502 and creates no false conversion')
 finally:proc.terminate();proc.wait()
