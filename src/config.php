<?php
declare(strict_types=1);

/**
 * Directory holding books.json, refs.sqlite and searches.sqlite (must not be web-accessible).
 * Pass a path to override it (the API does this once it has resolved its locations); null resets.
 */
function dataDir(?string $override = null, bool $set = false): string
{
    static $current = null;
    if ($set) {
        $current = $override === null ? null : rtrim(str_replace("\x5C", '/', $override), '/');
    }
    if ($current !== null) {
        return $current;
    }
    $env = getenv('REFMAP_DATA_DIR');
    return rtrim($env !== false && $env !== '' ? $env : dirname(__DIR__) . '/data', "/\x5C");
}

function setDataDir(?string $dir): void
{
    dataDir($dir, true);
}
