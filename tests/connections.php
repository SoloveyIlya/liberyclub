<?php
if(PHP_SAPI!=='cli') {http_response_code(404);exit;}
require __DIR__.'/../php/app.php';
$config=app_config();
[, $body]=http_post('https://api.telegram.org/bot'.$config['telegram_token'].'/getMe','{}','application/json');
if(empty(json_decode($body,true)['ok'])) throw new RuntimeException('Telegram connection failed');
echo "Telegram HTTPS/auth: OK (no messages sent)\n";
$c=curl_init(str_replace('/formResponse','/viewform',$config['form_action']));
curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>30,CURLOPT_FOLLOWLOCATION=>true]);
$html=curl_exec($c);$status=curl_getinfo($c,CURLINFO_RESPONSE_CODE);$curlError=curl_error($c);unset($c);
if($status!==200 || !$html) throw new RuntimeException('Google connection failed: HTTP '.$status.' '.$curlError);
echo "Google Form HTTPS: OK (no response submitted)\n";
