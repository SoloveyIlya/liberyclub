<?php
function day_key($timestamp) {
    return (new DateTimeImmutable('@' . (int)floor($timestamp / 1000)))->setTimezone(new DateTimeZone('Europe/Minsk'))->format('Y-m-d');
}
function metrics(array $rows): array {
    $counts = []; $watched = [];
    foreach ($rows as $e) {
        $counts[$e['type']][$e['sid']] = true;
        if ($e['type'] === 'watch') $watched[$e['sid']] = max($watched[$e['sid']] ?? 0, $e['position']);
    }
    $out = [];
    foreach (['visits'=>'view','plays'=>'play','clicks'=>'cta','quizzes'=>'quiz','leads'=>'lead'] as $key=>$type) $out[$key] = count($counts[$type] ?? []);
    return $out + ['average'=>count($watched) ? array_sum($watched)/count($watched) : null,'measured'=>count($watched)];
}
function analytics_report(array $events, string $from, string $to): array {
    $first=[]; $names=[]; $selected=[]; $byDay=[];
    foreach ($events as $e) {
        if (!isset($first[$e['sid']]) || ($e['type']==='view' && $first[$e['sid']]['type']!=='view')) $first[$e['sid']]=$e;
        if ($e['type']==='lead') $names[$e['sid']]=$e['name'];
        $day=day_key($e['t']);
        if ($day >= $from && $day <= $to) { $selected[]=$e; $byDay[$day][]=$e; }
    }
    $sources=[]; $leads=[]; $visitors=[]; $steps=[]; $answers=[];
    foreach (['intent','work','income','target','blocker'] as $key) $answers[$key]=[];
    foreach ($selected as $e) {
        $e['attribution']=$e['attribution'] ?? $first[$e['sid']]['attribution'] ?? null;
        $key=json_encode($e['attribution'], JSON_UNESCAPED_UNICODE);
        if (!isset($sources[$key])) $sources[$key]=['attribution'=>$e['attribution'],'rows'=>[]];
        $sources[$key]['rows'][]=$e;
        if ($e['type']==='step') $steps[$e['step']][$e['sid']]=true;
        if ($e['type']==='view') $visitors[]=['t'=>$e['t'],'sid'=>$e['sid'],'name'=>$names[$e['sid']] ?? null,'attribution'=>$e['attribution']];
        if ($e['type']==='lead') {
            $leads[]=$e;
            foreach ($answers as $field=>$_) { $value=$e[$field] ?? ''; $answers[$field][$value]=($answers[$field][$value] ?? 0)+1; }
        }
    }
    $days=[];
    for ($d=new DateTimeImmutable($from); $d->format('Y-m-d') <= $to; $d=$d->modify('+1 day')) {
        $key=$d->format('Y-m-d'); $days[]=['date'=>$key]+metrics($byDay[$key] ?? []);
    }
    $sourceRows=[];
    foreach ($sources as $s) $sourceRows[]=['attribution'=>$s['attribution']]+metrics($s['rows']);
    usort($sourceRows, fn($a,$b)=>$b['visits'] <=> $a['visits']);
    foreach ($answers as $field=>$counts) { $answers[$field]=[]; foreach ($counts as $label=>$count) $answers[$field][]=['label'=>(string)$label,'count'=>$count]; }
    $stepRows=[]; for($i=1;$i<=6;$i++) $stepRows[]=['step'=>$i,'count'=>count($steps[$i] ?? [])];
    return ['from'=>$from,'to'=>$to]+metrics($selected)+['days'=>array_reverse($days),'answers'=>$answers,'steps'=>$stepRows,'sources'=>$sourceRows,'visitors'=>array_reverse(array_slice($visitors,-100)),'recent'=>array_reverse(array_slice($leads,-20))];
}
