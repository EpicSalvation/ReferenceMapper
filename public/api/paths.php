<?php
declare(strict_types=1);

/**
 * Finds the folder holding src/ and the data folder.
 *
 * Order: config.local.php ('root', 'data_dir'), then REFMAP_ROOT / REFMAP_DATA_DIR,
 * then auto-detection: src/ two levels above api/ (project layout, or src/ beside the
 * web root), else src/ next to api/ (everything inside one site folder).
 *
 * @param array<string,mixed> $config
 * @param array<string,mixed> $env
 * @return array{root:string,data:string}
 */
function refmapPaths(string $apiDir, array $config, array $env): array
{
    $clean = static fn(string $p): string => rtrim(str_replace("\x5C", '/', $p), '/');
    $apiDir = $clean($apiDir);

    $root = $config['root'] ?? ($env['REFMAP_ROOT'] ?? '');
    if (!is_string($root) || $root === '') {
        $candidates = [$clean(dirname($apiDir, 2)), $clean(dirname($apiDir))];
        $root = '';
        foreach ($candidates as $c) {
            if (is_dir($c . '/src')) {
                $root = $c;
                break;
            }
        }
        if ($root === '') {
            throw new RuntimeException('Cannot find the src folder; looked in ' . implode(' and ', array_map(fn($c) => $c . '/src', $candidates)) . '. Set "root" in api/config.local.php.');
        }
    }
    $root = $clean($root);

    $data = $config['data_dir'] ?? ($env['REFMAP_DATA_DIR'] ?? '');
    $data = is_string($data) && $data !== '' ? $clean($data) : $root . '/data';

    return ['root' => $root, 'data' => $data];
}
