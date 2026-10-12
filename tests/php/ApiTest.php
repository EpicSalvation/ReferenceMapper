<?php
require_once __DIR__ . '/../../src/Verses.php';
require_once __DIR__ . '/../../src/Db.php';
require_once __DIR__ . '/../../public/api/refs.php';
Verses::load(__DIR__ . '/../../data/books.json');

function seededDbs(int $extraOut = 0): array
{
    $refs = new PDO('sqlite::memory:');
    $refs->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $refs->exec('CREATE TABLE refs (from_id INTEGER NOT NULL, to_start INTEGER NOT NULL, to_end INTEGER NOT NULL, votes INTEGER NOT NULL)');
    $ins = $refs->prepare('INSERT INTO refs VALUES (?,?,?,?)');
    $id = fn($r) => Verses::idFromRef($r);
    $range = fn($r) => Verses::parseTo($r);
    foreach ([
        ['Gen.1.1', 'Rev.4.11', 205],
        ['Gen.1.1', 'Isa.40.28', 67],
        ['Ps.1.1', 'Prov.8.22-Prov.8.30', 10],
        ['John.1.1', 'Gen.1.1', 50],
    ] as [$f, $t, $v]) {
        [$a, $b] = $range($t);
        $ins->execute([$id($f), $a, $b, $v]);
    }
    for ($i = 0; $i < $extraOut; $i++) {
        $ins->execute([$id('Gen.2.1'), 1000 + $i, 1000 + $i, $i]);
    }
    $searches = new PDO('sqlite::memory:');
    $searches->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    Db::initSearches($searches);
    return [$refs, $searches];
}

function searchCount(PDO $s, string $ref): int
{
    $st = $s->prepare('SELECT count FROM searches WHERE verse_id = ?');
    $st->execute([Verses::idFromRef($ref)]);
    $c = $st->fetchColumn();
    return $c === false ? 0 : (int) $c;
}

return [
    'outgoing sorted by votes desc' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1'], $refs, $s);
        assertSame(200, $r['status']);
        assertSame(Verses::idFromRef('Gen.1.1'), $r['body']['v']);
        assertSame([[Verses::idFromRef('Rev.4.11'), Verses::idFromRef('Rev.4.11'), 205], [Verses::idFromRef('Isa.40.28'), Verses::idFromRef('Isa.40.28'), 67]], $r['body']['out']);
    },
    'incoming lists referrers' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1'], $refs, $s);
        assertSame([[Verses::idFromRef('John.1.1'), 50]], $r['body']['in']);
    },
    'incoming finds verse inside a range' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Prov.8.25'], $refs, $s);
        assertSame([[Verses::idFromRef('Ps.1.1'), 10]], $r['body']['in']);
    },
    'min filters low votes' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1', 'min' => '100'], $refs, $s);
        assertSame(1, count($r['body']['out']));
        assertSame(0, count($r['body']['in']));
    },
    'limit caps each direction' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1', 'limit' => '1'], $refs, $s);
        assertSame(1, count($r['body']['out']));
    },
    'huge limit clamps to 500' => function () {
        [$refs, $s] = seededDbs(600);
        $r = handleRefs(['v' => 'Gen.2.1', 'limit' => '99999'], $refs, $s);
        assertSame(500, count($r['body']['out']));
    },
    'default limit applies' => function () {
        [$refs, $s] = seededDbs(600);
        $r = handleRefs(['v' => 'Gen.2.1'], $refs, $s);
        assertSame(REFS_DEFAULT_LIMIT, count($r['body']['out']));
    },
    'non-numeric min and limit fall back to defaults' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1', 'min' => 'abc', 'limit' => 'zzz'], $refs, $s);
        assertSame(200, $r['status']);
        assertSame(2, count($r['body']['out']));
    },
    'invalid verses give 400' => function () {
        [$refs, $s] = seededDbs();
        foreach (['Gen.1.99', 'Foo.1.1', '', "' OR 1=1", 'Gen.1', 'Gen.0.1'] as $v) {
            $r = handleRefs(['v' => $v, 'log' => '1'], $refs, $s);
            assertSame(400, $r['status'], "v=$v");
        }
        $r = handleRefs([], $refs, $s);
        assertSame(400, $r['status'], 'missing v');
        assertSame(0, (int) $s->query('SELECT COUNT(*) FROM searches')->fetchColumn(), 'no counter rows for invalid verses');
    },
    'log=1 increments counter' => function () {
        [$refs, $s] = seededDbs();
        handleRefs(['v' => 'Gen.1.1', 'log' => '1'], $refs, $s);
        assertSame(1, searchCount($s, 'Gen.1.1'));
        handleRefs(['v' => 'Gen.1.1', 'log' => '1'], $refs, $s);
        assertSame(2, searchCount($s, 'Gen.1.1'));
    },
    'no log param means no counter row' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1'], $refs, $s);
        assertSame(0, searchCount($s, 'Gen.1.1'));
        assertTrue($r['cacheable'] === true);
    },
    'logging responses are not cacheable' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Gen.1.1', 'log' => '1'], $refs, $s);
        assertTrue($r['cacheable'] === false);
    },
    'verse with no connections returns empty lists' => function () {
        [$refs, $s] = seededDbs();
        $r = handleRefs(['v' => 'Jude.1.5'], $refs, $s);
        assertSame(200, $r['status']);
        assertSame([], $r['body']['out']);
        assertSame([], $r['body']['in']);
    },
];
