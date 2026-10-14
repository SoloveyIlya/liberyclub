<?php
require_once __DIR__.'/report.php';
function app_config(): array {
    $config=require __DIR__.'/defaults.php';
    if (is_file(__DIR__.'/../config.php')) $config=array_replace($config,require __DIR__.'/../config.php');
    $config['storage']=getenv('LIBERTY_STORAGE') ?: __DIR__.'/../storage';
    return $config;
}
function storage_dir(): string {
    $dir=app_config()['storage'];
    if (!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir)) throw new RuntimeException('storage');
    return $dir;
}
function locked_file(string $name, callable $callback) {
    $f=fopen(storage_dir().'/'.$name.'.php','c+');
    if (!$f || !flock($f,LOCK_EX)) throw new RuntimeException('storage');
    try { return $callback($f); } finally { flock($f,LOCK_UN); fclose($f); }
}
function record_event(array $event): void {
    locked_file('events',function($f) use($event) {
        fseek($f,0,SEEK_END);
        if (ftell($f)===0) fwrite($f,"<?php exit; __halt_compiler();\n");
        $line=json_encode($event,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
        if (fwrite($f,$line)!==strlen($line)) throw new RuntimeException('storage');
        fflush($f);
    });
}
function read_events(): array {
    $events=[];
    // Сохраняем совместимость с историей Node-версии. На хостинге её нужно импортировать CLI-командой.
    $paths=[storage_dir().'/events.php'];
    foreach($paths as $path) {
        if (!is_file($path)) continue;
        $f=fopen($path,'r'); if (!$f || !flock($f,LOCK_SH)) throw new RuntimeException('storage');
        try { while(($line=fgets($f))!==false) { $e=json_decode($line,true); if(is_array($e) && isset($e['t'],$e['type'],$e['sid'])) $events[]=$e; } }
        finally {flock($f,LOCK_UN);fclose($f);}
    }
    return $events;
}
function rate_allowed(string $kind, int $limit): bool {
    $ip=$_SERVER['REMOTE_ADDR'] ?? 'local';
    return locked_file('limits',function($f) use($kind,$limit,$ip) {
        rewind($f); fgets($f); $all=json_decode(stream_get_contents($f),true) ?: []; $now=time();
        foreach($all as $key=>$item) if($item['until']<=$now) unset($all[$key]);
        $key=hash('sha256',$kind.':'.$ip); $item=$all[$key] ?? ['until'=>$now+60,'count'=>0];
        $allowed=$item['count']<$limit; $item['count']++; $all[$key]=$item;
        rewind($f); ftruncate($f,0); fwrite($f,"<?php exit; __halt_compiler();\n".json_encode($all)); return $allowed;
    });
}
function clean_text($value, int $max=300): string {
    if (!is_scalar($value)) return '';
    $text=trim((string)$value);
    preg_match('/^.{0,'.$max.'}/us',$text,$m); return $m[0] ?? '';
}
function attribution_from($body): ?array {
    if (!is_array($body)) return null;
    $a=[]; foreach(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer'] as $key) $a[$key]=clean_text($body[$key] ?? '');
    return $a;
}
function valid_sid($sid): bool { return is_string($sid) && preg_match('/^[A-Za-z0-9-]{8,80}$/D',$sid)===1; }
function event_from(array $body): ?array {
    $type=$body['type'] ?? ''; $sid=$body['sid'] ?? '';
    if(!in_array($type,['view','play','quiz','step','cta','watch'],true)||!valid_sid($sid)) return null;
    $e=['t'=>(int)round(microtime(true)*1000),'type'=>$type,'sid'=>$sid,'attribution'=>attribution_from($body['attribution'] ?? null)];
    if($type==='step') { $n=$body['step'] ?? null; if(!is_int($n)||$n<1||$n>6) return null; $e['step']=$n; }
    if($type==='watch') { $n=$body['position'] ?? null; if(!is_numeric($n)||!is_finite((float)$n)||$n<0||$n>86400) return null; $e['position']=(float)$n; }
    return $e;
}
function lead_from(array $body): ?array {
    $config=app_config(); $lead=[];
    foreach($config['entries'] as $key=>$_) $lead[$key]=clean_text($body[$key] ?? '',$key==='vision'?3000:300);
    foreach($config['options'] as $key=>$values) if(!in_array($lead[$key],$values,true)) return null;
    if(preg_match_all('/./us',$lead['name'])<2 || strlen(preg_replace('/\D/','',$lead['phone']))<10 || !preg_match('/^@?[A-Za-z0-9_]{4,}$/D',$lead['telegram']) || !$lead['vision']) return null;
    if($lead['telegram'][0]!=='@') $lead['telegram']='@'.$lead['telegram'];
    $lead['attribution']=attribution_from($body['attribution'] ?? null); return $lead;
}
function attribution_text($a): string {
    $lines=[]; foreach($a ?? [] as $key=>$value) if($value!=='') $lines[]="$key: $value";
    return $lines ? "Источник заявки:\n".implode("\n",$lines) : 'Источник заявки: прямой / без UTM';
}
function sheet_payload(array $lead): array {
    $params=['fvv'=>'1','pageHistory'=>'0'];
    foreach(app_config()['entries'] as $name=>$entry) $params[$entry]=$name==='vision' ? $lead[$name]."\n\n".attribution_text($lead['attribution']) : $lead[$name];
    return $params;
}
function telegram_text(array $l): string {
    return implode("\n",['Новая заявка','',"Имя: {$l['name']}","Телефон: {$l['phone']}","Телеграм: {$l['telegram']}",'',"Агентство $3000–$5000: {$l['intent']}","Чем зарабатывает: {$l['work']}","Доход сейчас: {$l['income']}","Цель на 3 месяца: {$l['target']}","Что мешает: {$l['blocker']}",'','Что изменится:',$l['vision'],'',attribution_text($l['attribution'])]);
}
function http_post(string $url, string $body, string $type): array {
    if(!function_exists('curl_init')) throw new RuntimeException('curl_required');
    $c=curl_init($url);
    curl_setopt_array($c,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_HTTPHEADER=>['Content-Type: '.$type],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>30,CURLOPT_FOLLOWLOCATION=>true,CURLOPT_MAXREDIRS=>3]);
    $text=curl_exec($c); $status=curl_getinfo($c,CURLINFO_RESPONSE_CODE); $errno=curl_errno($c); unset($c);
    $service=parse_url($url,PHP_URL_HOST)==='api.telegram.org' ? 'telegram' : 'google';
    if($text===false) throw new RuntimeException($service.'_curl_'.$errno);
    if($status<200 || $status>=300) throw new RuntimeException($service.'_http_'.$status);
    return [$status,$text];
}
function deliver_lead(array $lead, callable $post): void {
    $config=app_config();
    if(!$config['telegram_token']) throw new RuntimeException('telegram_config');
    [, $html]=$post($config['form_action'],http_build_query(sheet_payload($lead)),'application/x-www-form-urlencoded');
    if(!preg_match('/gesendet|recorded|записан|enregistr/iu',$html)) throw new RuntimeException('sheet');
    // Telegram ограничивает одно сообщение 4096 символами; длинную анкету разбиваем без потери UTM.
    preg_match_all('/.{1,3500}/us',telegram_text($lead),$parts);
    foreach($config['chat_ids'] as $chat) foreach($parts[0] as $text) {
        [, $response]=$post('https://api.telegram.org/bot'.$config['telegram_token'].'/sendMessage',json_encode(['chat_id'=>$chat,'text'=>$text],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'application/json');
        if(empty(json_decode($response,true)['ok'])) throw new RuntimeException('telegram');
    }
}
