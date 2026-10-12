<?php
require_once __DIR__ . '/../../src/Verses.php';
Verses::load(__DIR__ . '/../../data/books.json');

return [
    'total is 31103 (dataset versification: 3John has 15)' => fn() => assertSame(31103, Verses::total()),
    'Gen.1.1 is id 1' => fn() => assertSame(1, Verses::idFromRef('Gen.1.1')),
    'Rev.22.21 is last id' => fn() => assertSame(31103, Verses::idFromRef('Rev.22.21')),
    'out-of-range verse is null' => fn() => assertSame(null, Verses::idFromRef('Gen.1.32')),
    'unknown book is null' => fn() => assertSame(null, Verses::idFromRef('Foo.1.1')),
    'malformed ref is null' => fn() => assertSame(null, Verses::idFromRef("Gen.1")),
    'John.3.16 round trips' => fn() => assertSame('John.3.16', Verses::refFromId(Verses::idFromRef('John.3.16'))),
    'every id round trips' => function () {
        for ($i = 1; $i <= Verses::total(); $i++) {
            if (Verses::idFromRef(Verses::refFromId($i)) !== $i) {
                throw new Exception("round trip failed at $i");
            }
        }
    },
    'range parses to span' => function () {
        $r = Verses::parseTo('Prov.8.22-Prov.8.30');
        assertTrue($r !== null);
        assertSame(8, $r[1] - $r[0]);
    },
    'reversed range is null' => fn() => assertSame(null, Verses::parseTo('Prov.8.30-Prov.8.22')),
    'single verse parses to [id,id]' => fn() => assertSame([1, 1], Verses::parseTo('Gen.1.1')),
    'every dataset ref resolves' => function () {
        $f = fopen(__DIR__ . '/../../cross_references.txt', 'r');
        fgets($f);
        $bad = [];
        while (($line = fgets($f)) !== false) {
            $p = explode("\t", rtrim($line, "\r\n"));
            if (count($p) < 3) { $bad[] = trim($line); continue; }
            if (Verses::idFromRef($p[0]) === null) $bad[] = $p[0];
            if (Verses::parseTo($p[1]) === null) $bad[] = $p[1];
        }
        fclose($f);
        assertTrue(count($bad) === 0, count($bad) . ' unresolved, e.g. ' . implode(', ', array_slice(array_unique($bad), 0, 20)));
    },
];
