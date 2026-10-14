<?php
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require __DIR__.'/../php/app.php';
$path=$argv[1] ?? __DIR__.'/../data/events.jsonl';
if(!is_file($path)) {fwrite(STDERR,"Файл истории не найден\n");exit(1);}
if(read_events()) {fwrite(STDERR,"Импорт отменён: PHP-хранилище уже содержит события\n");exit(1);}
$n=0;
foreach(file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line) {
    $event=json_decode($line,true);
    if(is_array($event)&&isset($event['t'],$event['type'],$event['sid'])) {record_event($event);$n++;}
}
echo "Импортировано событий: $n\n";
