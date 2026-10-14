<?php
if(PHP_SAPI!=='cli') {http_response_code(404);exit;}
putenv('LIBERTY_STORAGE='.sys_get_temp_dir().'/liberty-check-'.bin2hex(random_bytes(6)));
require __DIR__.'/../php/app.php';
$n=0;
function check($condition,$label) {global $n;if(!$condition) throw new RuntimeException('FAIL: '.$label);$n++;echo "OK $label\n";}
function event($type,$sid,$time,$extra=[]) {return ['type'=>$type,'sid'=>$sid,'t'=>strtotime($time)*1000]+$extra;}
$a=attribution_from(['utm_source'=>'telegram','utm_medium'=>'social','utm_campaign'=>'oct','utm_content'=>'post 1','utm_term'=>'a&b']);
$events=[event('view','session-a','2026-10-13T20:59:59Z',['attribution'=>$a]),event('view','session-b','2026-10-13T21:00:00Z',['attribution'=>$a]),event('view','session-b','2026-10-14T01:00:00Z',['attribution'=>$a]),event('play','session-b','2026-10-14T01:00:01Z'),event('watch','session-b','2026-10-14T01:01:00Z',['position'=>60]),event('watch','session-b','2026-10-14T01:02:00Z',['position'=>120]),event('watch','session-c','2026-10-14T01:02:00Z',['position'=>30]),event('cta','session-b','2026-10-14T01:03:00Z'),event('quiz','session-b','2026-10-14T01:03:01Z'),event('view','session-d','2026-10-14T21:00:00Z')];
foreach(range(1,6) as $step) {$events[]=event('step','session-b','2026-10-14T01:03:02Z',['step'=>$step]);$events[]=event('step','session-b','2026-10-14T01:03:03Z',['step'=>$step]);}
$body=['name'=>'ТЕСТ PHP','phone'=>'+10000000000','telegram'=>'test_php','vision'=>'Ответ теста','attribution'=>$a];foreach(app_config()['options'] as $key=>$values) $body[$key]=$values[0];
$lead=lead_from($body);check($lead!==null,'valid lead');check($lead['telegram']==='@test_php','normalize Telegram');
$events[]=event('lead','session-b','2026-10-14T01:04:00Z',$lead);
$r=analytics_report($events,'2026-10-14','2026-10-14');
foreach(['visits','plays','clicks','quizzes','leads'] as $key) check($r[$key]===1,'unique '.$key);
check($r['average']==75,'average of session maxima');check($r['measured']===2,'measured sessions');check($r['days'][0]['average']==75,'daily watch average');check(count($r['days'])===1,'inclusive day boundaries UTC+3');
foreach($r['steps'] as $step) check($step['count']===1,'step '.$step['step'].' deduplication');
check($r['recent'][0]['attribution']['utm_term']==='a&b','lead UTM');check($r['visitors'][0]['name']==='ТЕСТ PHP','visitor identity');
check($r['sources'][0]['visits']===1 && $r['sources'][0]['leads']===1,'UTM aggregation');
foreach($r['answers'] as $rows) check($rows[0]['count']===1,'answer tally');
$empty=analytics_report($events,'2026-11-01','2026-11-03');check(count($empty['days'])===3 && $empty['average']===null && $empty['recent']===[],'empty period');
$old=analytics_report([event('view','old','2026-10-14T00:00:00Z')],'2026-10-14','2026-10-14');check($old['sources'][0]['attribution']===null,'legacy unknown source');
check(event_from(['type'=>'watch','sid'=>'session-test','position'=>-1])===null,'reject negative time');check(event_from(['type'=>'step','sid'=>'session-test','step'=>7])===null,'reject invalid step');check(event_from(['type'=>'lead','sid'=>'session-test'])===null,'cannot forge lead event');check(lead_from([])===null,'reject invalid lead');
foreach($events as $e) record_event($e);check(count(read_events())===count($events),'event persistence');
check(str_starts_with(file_get_contents(storage_dir().'/events.php'),'<?php exit; __halt_compiler();'),'HTTP-safe storage');
$calls=[];deliver_lead($lead,function($url,$body,$type) use(&$calls) {$calls[]=[$url,$body,$type];return [200,str_contains($url,'docs.google.com')?'Your response has been recorded.':'{"ok":true}'];});
check(count($calls)===3,'Google and both Telegram recipients');parse_str($calls[0][1],$sheet);check(str_contains($sheet[str_replace('.', '_', app_config()['entries']['vision'])],'utm_term: a&b'),'UTM in Google payload');check(str_contains(json_decode($calls[1][1],true)['text'],'utm_source: telegram'),'UTM in Telegram payload');
$failed=false;try {deliver_lead($lead,fn()=>[200,'error']);}catch(RuntimeException $e){$failed=true;}check($failed,'Google failure is not success');
$failed=false;try {deliver_lead($lead,fn($url)=>[200,str_contains($url,'docs.google.com')?'recorded':'{"ok":false}']);}catch(RuntimeException $e){$failed=true;}check($failed,'Telegram failure is not success');
check(rate_allowed('test',1) && !rate_allowed('test',1),'persistent rate limit');
file_put_contents('/tmp/liberty-parity-events.json',json_encode($events));file_put_contents('/tmp/liberty-php-report.json',json_encode($r));
echo "PASS $n checks\n";
