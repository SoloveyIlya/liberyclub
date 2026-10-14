<?php
// Только для локального PHP development server. На хостинг этот файл не нужен.
if(PHP_SAPI!=='cli-server') {http_response_code(404);exit;}
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH));
if(preg_match('~/(?:\.|data/|tests/|php/)|\.(?:jsonl|md)$~',$path) || in_array($path,['/server.js','/package.json'])) {http_response_code(404);return true;}
if($path==='/analytics' || $path==='/analytics/') {header('Location: analytics.html');return true;}
return false;
