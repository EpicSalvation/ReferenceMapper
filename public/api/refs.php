<?php
declare(strict_types=1);

require_once __DIR__ . '/paths.php';

const REFS_DEFAULT_LIMIT = 150;
const REFS_MAX_LIMIT = 500;

/** Widest to_end - to_start in the refs table, or null for a database built before the meta table existed. */
function maxSpan(PDO $refs): ?int
{
    try {
        $span = $refs->query("SELECT value FROM meta WHERE key = 'max_span'")->fetchColumn();
    } catch (PDOException $e) {
        return null;
    }
    return $span === false ? null : (int) $span;
}

/**
 * Looks up the cross references to and from one verse.
 *
 * @param array<string,mixed> $query
 * @return array{status:int,body:array<string,mixed>,cacheable:bool}
 */
function handleRefs(array $query, PDO $refs, ?PDO $searches): array
{
    $v = isset($query['v']) && is_string($query['v']) ? Verses::idFromRef($query['v']) : null;
    if ($v === null) {
        return ['status' => 400, 'body' => ['error' => 'invalid verse'], 'cacheable' => false];
    }
    $min = isset($query['min']) && is_string($query['min']) && ctype_digit($query['min']) ? (int) $query['min'] : 0;
    $limit = isset($query['limit']) && is_string($query['limit']) && ctype_digit($query['limit']) ? (int) $query['limit'] : REFS_DEFAULT_LIMIT;
    $limit = max(1, min(REFS_MAX_LIMIT, $limit));

    $out = $refs->prepare('SELECT to_start, to_end, votes FROM refs WHERE from_id = ? AND votes >= ? ORDER BY votes DESC, to_start LIMIT ?');
    $out->execute([$v, $min, $limit]);
    $span = maxSpan($refs);
    if ($span !== null) {
        // No range is wider than $span, so only rows starting in [v - span, v] can contain v.
        $in = $refs->prepare('SELECT from_id, votes FROM refs WHERE to_start BETWEEN ? AND ? AND to_end >= ? AND votes >= ? ORDER BY votes DESC, from_id LIMIT ?');
        $in->execute([$v - $span, $v, $v, $min, $limit]);
    } else {
        $in = $refs->prepare('SELECT from_id, votes FROM refs WHERE to_start <= ? AND to_end >= ? AND votes >= ? ORDER BY votes DESC, from_id LIMIT ?');
        $in->execute([$v, $v, $min, $limit]);
    }

    $log = ($query['log'] ?? '') === '1' && $searches !== null;
    if ($log) {
        // Counting is best-effort: a failure here must never break the lookup.
        try {
            $st = $searches->prepare('INSERT INTO searches (verse_id, count, last_at) VALUES (?, 1, ?) ON CONFLICT(verse_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at');
            $st->execute([$v, time()]);
        } catch (Throwable $e) {
            // ignore
        }
    }

    return [
        'status' => 200,
        'body' => [
            'v' => $v,
            'out' => array_map(fn($r) => [(int) $r[0], (int) $r[1], (int) $r[2]], $out->fetchAll(PDO::FETCH_NUM)),
            'in' => array_map(fn($r) => [(int) $r[0], (int) $r[1]], $in->fetchAll(PDO::FETCH_NUM)),
        ],
        'cacheable' => !$log,
    ];
}

if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    ini_set('display_errors', '0');
    header('Content-Type: application/json');
    header('X-Content-Type-Options: nosniff');
    try {
        $configFile = __DIR__ . '/config.local.php';
        $config = is_file($configFile) ? require $configFile : [];
        $paths = refmapPaths(__DIR__, is_array($config) ? $config : [], getenv());
        require_once $paths['root'] . '/src/Verses.php';
        require_once $paths['root'] . '/src/Db.php';
        setDataDir($paths['data']);
        Verses::load($paths['data'] . '/books.json');
        $searches = null;
        if (($_GET['log'] ?? '') === '1') {
            try {
                $searches = Db::searches();
            } catch (Throwable $e) {
                $searches = null; // unwritable data dir: still serve the lookup
            }
        }
        $result = handleRefs($_GET, Db::refs(), $searches);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'server error']);
        exit;
    }
    http_response_code($result['status']);
    header($result['cacheable'] ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: no-store');
    echo json_encode($result['body']);
}
