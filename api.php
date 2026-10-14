<?php
// Единственная точка API; работает без mod_rewrite и в подпапке сайта.
declare(strict_types=1);
ini_set('display_errors','0');
require_once __DIR__.'/php/app.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
function respond(int $status, array $data): void {
    http_response_code($status); echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit;
}
function request_body(): array {
    $raw=file_get_contents('php://input',false,null,0,100001);
    if($raw===false || strlen($raw)>100000) respond(413,['ok'=>false]);
    $body=json_decode($raw,true);
    if(!is_array($body) || json_last_error()!==JSON_ERROR_NONE) respond(400,['ok'=>false]);
    return $body;
}
function start_analytics_session(): void {
    session_name('liberty_analytics');
    ini_set('session.use_strict_mode','1');
    ini_set('session.use_only_cookies','1');
    session_set_cookie_params(['lifetime'=>2592000,'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Lax']);
    if(!session_start()) throw new RuntimeException('session');
}
function valid_date($date): bool {
    if(!is_string($date)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)) return false;
    [$y,$m,$d]=array_map('intval',explode('-',$date)); return $y>=2000 && $y<=2100 && checkdate($m,$d,$y);
}
try {
    $action=$_GET['action'] ?? ''; $method=$_SERVER['REQUEST_METHOD'];
    $methods=['event'=>'POST','lead'=>'POST','login'=>'POST','logout'=>'POST','analytics'=>'GET'];
    if(!is_string($action)||!isset($methods[$action])) respond(404,['ok'=>false]);
    if($method!==$methods[$action]) { header('Allow: '.$methods[$action]); respond(405,['ok'=>false]); }
    if($action==='event') {
        if(!rate_allowed('event',240)) respond(429,['ok'=>false]);
        $event=event_from(request_body()); if(!$event) respond(400,['ok'=>false]);
        record_event($event); respond(200,['ok'=>true]);
    }
    if(in_array($action,['login','logout','analytics'],true)) {
        start_analytics_session(); $password=app_config()['analytics_password'];
        if($action==='login') {
            if(!rate_allowed('login',8)) respond(429,['ok'=>false]);
            $body=request_body();
            if(!$password || !is_string($body['password'] ?? null) || !hash_equals(hash('sha256',$password),hash('sha256',$body['password']))) respond(401,['ok'=>false]);
            session_regenerate_id(true); $_SESSION['authenticated']=hash('sha256',$password); $_SESSION['expires']=time()+2592000;
            session_write_close(); respond(200,['ok'=>true]);
        }
        if($action==='logout') {
            $_SESSION=[]; $p=session_get_cookie_params();
            setcookie(session_name(),'', ['expires'=>time()-3600,'path'=>$p['path'],'secure'=>$p['secure'],'httponly'=>true,'samesite'=>'Lax']);
            session_destroy(); respond(200,['ok'=>true]);
        }
        $authed=$password && ($_SESSION['expires'] ?? 0)>time() && hash_equals(hash('sha256',$password),$_SESSION['authenticated'] ?? '');
        session_write_close(); if(!$authed) respond(401,['ok'=>false]);
        $events=read_events(); $to=$_GET['to'] ?? day_key((int)round(microtime(true)*1000));
        $from=$_GET['from'] ?? ($events ? min(array_map(fn($e)=>day_key($e['t']),$events)) : $to);
        if(!valid_date($from)||!valid_date($to)||$from>$to) respond(400,['ok'=>false,'error'=>'date_range']);
        respond(200,analytics_report($events,$from,$to));
    }
    if($action==='lead') {
        if(!rate_allowed('lead',10)) respond(429,['ok'=>false]);
        $body=request_body(); $lead=lead_from($body); if(!$lead) respond(400,['ok'=>false]);
        // Проверяем доступность хранилища до отправки внешним сервисам.
        storage_dir();
        deliver_lead($lead,'http_post');
        record_event(['t'=>(int)round(microtime(true)*1000),'type'=>'lead','sid'=>valid_sid($body['sid'] ?? null)?$body['sid']:bin2hex(random_bytes(16))]+$lead);
        respond(200,['ok'=>true]);
    }
} catch(Throwable $error) {
    // Не выводим токен, контакты или текст заявки в HTTP-ответ.
    $code=$error->getMessage();
    if (!preg_match('/^(?:storage|curl_required|telegram_config|sheet|telegram|(?:google|telegram)_(?:http|curl)_\d+)$/D',$code)) $code='server_error';
    error_log('Liberty API failure: '.$code);
    respond(502,['ok'=>false,'error'=>$code]);
}
