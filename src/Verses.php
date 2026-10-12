<?php
declare(strict_types=1);

/** Canonical verse numbering shared by the build script and the API. */
final class Verses
{
    /** @var array<int,array{code:string,start:int,chapters:int[],chapterStarts:int[]}> */
    private static array $books = [];
    /** @var array<string,int> book code => index */
    private static array $byCode = [];
    private static int $total = 0;

    public static function load(string $path): void
    {
        $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        self::$books = [];
        self::$byCode = [];
        $id = 1;
        foreach ($data['books'] as $i => $b) {
            $starts = [];
            foreach ($b['chapters'] as $count) {
                $starts[] = $id;
                $id += $count;
            }
            self::$books[$i] = ['code' => $b['code'], 'start' => $starts[0], 'chapters' => $b['chapters'], 'chapterStarts' => $starts];
            self::$byCode[$b['code']] = $i;
        }
        self::$total = $id - 1;
    }

    public static function total(): int
    {
        return self::$total;
    }

    public static function idFromRef(string $ref): ?int
    {
        if (!preg_match('/^([0-9A-Za-z]+)\.([0-9]+)\.([0-9]+)$/', $ref, $m)) {
            return null;
        }
        $bi = self::$byCode[$m[1]] ?? null;
        if ($bi === null) {
            return null;
        }
        $book = self::$books[$bi];
        $ch = (int) $m[2];
        $v = (int) $m[3];
        if ($ch < 1 || $ch > count($book['chapters']) || $v < 1 || $v > $book['chapters'][$ch - 1]) {
            return null;
        }
        return $book['chapterStarts'][$ch - 1] + $v - 1;
    }

    public static function refFromId(int $id): string
    {
        if ($id < 1 || $id > self::$total) {
            throw new InvalidArgumentException("verse id out of range: $id");
        }
        // binary search for the book whose start <= id
        $lo = 0;
        $hi = count(self::$books) - 1;
        while ($lo < $hi) {
            $mid = intdiv($lo + $hi + 1, 2);
            if (self::$books[$mid]['start'] <= $id) {
                $lo = $mid;
            } else {
                $hi = $mid - 1;
            }
        }
        $book = self::$books[$lo];
        $starts = $book['chapterStarts'];
        $cl = 0;
        $ch = count($starts) - 1;
        while ($cl < $ch) {
            $mid = intdiv($cl + $ch + 1, 2);
            if ($starts[$mid] <= $id) {
                $cl = $mid;
            } else {
                $ch = $mid - 1;
            }
        }
        return $book['code'] . '.' . ($cl + 1) . '.' . ($id - $starts[$cl] + 1);
    }

    /** @return array{0:int,1:int}|null [start,end] for "A.1.1" or "A.1.1-B.2.3" */
    public static function parseTo(string $to): ?array
    {
        $parts = explode('-', $to);
        if (count($parts) === 1) {
            $a = self::idFromRef($parts[0]);
            return $a === null ? null : [$a, $a];
        }
        if (count($parts) !== 2) {
            return null;
        }
        $a = self::idFromRef($parts[0]);
        $b = self::idFromRef($parts[1]);
        if ($a === null || $b === null || $b < $a) {
            return null;
        }
        return [$a, $b];
    }
}
