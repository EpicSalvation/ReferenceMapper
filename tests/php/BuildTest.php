<?php
require_once __DIR__ . '/../../src/Verses.php';
require_once __DIR__ . '/../../tools/build_db.php';
Verses::load(__DIR__ . '/../../data/books.json');

function buildFixture(): array
{
    $tsv = tempnam(sys_get_temp_dir(), 'tsv');
    $db = tempnam(sys_get_temp_dir(), 'db');
    unlink($db);
    file_put_contents($tsv, implode("\r\n", [
        "From Verse\tTo Verse\tVotes\t#header note",
        "Gen.1.1\tRev.4.11\t205",
        "Ps.1.1\tProv.8.22-Prov.8.30\t10",
        "Gen.1.1\tGen.1.99\t5",
        "bad row only two\tcols",
    ]) . "\r\n");
    $report = buildDb($tsv, $db);
    return [$report, $db];
}

return [
    'counts inserted and skipped rows' => function () {
        [$r, $db] = buildFixture();
        assertSame(4, $r['read']);
        assertSame(2, $r['inserted']);
        assertSame(2, $r['skipped']);
        assertSame(1, $r['ranges']);
    },
    'range row stores a span' => function () {
        [$r, $db] = buildFixture();
        $pdo = new PDO('sqlite:' . $db);
        $row = $pdo->query("SELECT to_start, to_end FROM refs WHERE from_id = " . Verses::idFromRef('Ps.1.1'))->fetch(PDO::FETCH_ASSOC);
        assertSame(8, (int) $row['to_end'] - (int) $row['to_start']);
    },
    'both indexes exist' => function () {
        [$r, $db] = buildFixture();
        $pdo = new PDO('sqlite:' . $db);
        $names = $pdo->query("SELECT name FROM sqlite_master WHERE type='index'")->fetchAll(PDO::FETCH_COLUMN);
        assertTrue(in_array('idx_from', $names, true) && in_array('idx_to', $names, true), implode(',', $names));
    },
];
