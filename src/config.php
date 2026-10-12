<?php
declare(strict_types=1);

/** Directory holding books.json, refs.sqlite and searches.sqlite (must not be web-accessible). */
function dataDir(): string
{
    $env = getenv('REFMAP_DATA_DIR');
    return rtrim($env !== false && $env !== '' ? $env : dirname(__DIR__) . '/data', "/\x5C");
}
