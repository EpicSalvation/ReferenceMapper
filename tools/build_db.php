<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Verses.php';

/**
 * Builds the SQLite refs database from the openbible TSV.
 *
 * @return array{read:int,inserted:int,skipped:int,ranges:int,skipped_samples:string[]}
 */
function buildDb(string $src, string $out): array
{
    if (file_exists($out)) {
        unlink($out);
    }
    $pdo = new PDO('sqlite:' . $out);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    $pdo->exec('CREATE TABLE refs (from_id INTEGER NOT NULL, to_start INTEGER NOT NULL, to_end INTEGER NOT NULL, votes INTEGER NOT NULL)');
    $ins = $pdo->prepare('INSERT INTO refs (from_id, to_start, to_end, votes) VALUES (?, ?, ?, ?)');

    $report = ['read' => 0, 'inserted' => 0, 'skipped' => 0, 'ranges' => 0, 'skipped_samples' => []];
    $skip = function (string $why, string $line) use (&$report) {
        $report['skipped']++;
        if (count($report['skipped_samples']) < 20) {
            $report['skipped_samples'][] = "$why: " . trim($line);
        }
    };

    $f = fopen($src, 'r');
    if ($f === false) {
        throw new RuntimeException("cannot open $src");
    }
    $pdo->beginTransaction();
    $first = true;
    while (($line = fgets($f)) !== false) {
        if ($first) {
            $first = false;
            if (str_starts_with($line, 'From Verse')) {
                continue;
            }
        }
        if (trim($line) === '') {
            continue;
        }
        $report['read']++;
        $p = explode("\t", rtrim($line, "\r\n"));
        if (count($p) < 3 || !is_numeric($p[2])) {
            $skip('malformed', $line);
            continue;
        }
        $from = Verses::idFromRef($p[0]);
        $to = Verses::parseTo($p[1]);
        if ($from === null || $to === null) {
            $skip('unresolved verse', $line);
            continue;
        }
        $ins->execute([$from, $to[0], $to[1], (int) $p[2]]);
        $report['inserted']++;
        if ($to[0] !== $to[1]) {
            $report['ranges']++;
        }
    }
    fclose($f);
    $pdo->commit();
    $pdo->exec('CREATE INDEX idx_from ON refs (from_id, votes DESC)');
    $pdo->exec('CREATE INDEX idx_to ON refs (to_start, to_end)');
    return $report;
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $root = dirname(__DIR__);
    $opts = getopt('', ['src::', 'out::']);
    $src = $opts['src'] ?? $root . '/cross_references.txt';
    $out = $opts['out'] ?? $root . '/data/refs.sqlite';
    Verses::load($root . '/data/books.json');
    $r = buildDb($src, $out);
    echo "read {$r['read']}, inserted {$r['inserted']}, skipped {$r['skipped']}, ranges {$r['ranges']}\n";
    foreach ($r['skipped_samples'] as $s) {
        echo "  skipped $s\n";
    }
    exit($r['read'] > 0 && $r['skipped'] / $r['read'] > 0.005 ? 1 : 0);
}
