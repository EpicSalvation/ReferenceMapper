<?php
require_once __DIR__ . '/../../public/api/paths.php';
require_once __DIR__ . '/../../src/config.php';

/** Builds a temp tree from a list of relative directories; returns its absolute path. */
function tempTree(array $dirs): string
{
    $base = sys_get_temp_dir() . '/refmap_' . bin2hex(random_bytes(4));
    foreach ($dirs as $d) {
        mkdir($base . '/' . $d, 0777, true);
    }
    return str_replace("\x5C", '/', $base);
}

return [
    'dev layout: src beside public, found two levels above api' => function () {
        $t = tempTree(['project/public/api', 'project/src']);
        $p = refmapPaths($t . '/project/public/api', [], []);
        assertSame($t . '/project', $p['root']);
        assertSame($t . '/project/data', $p['data']);
    },
    'site-folder layout: src and data inside the subfolder next to api' => function () {
        $t = tempTree(['public_html/RefMap/api', 'public_html/RefMap/src', 'public_html/RefMap/data']);
        $p = refmapPaths($t . '/public_html/RefMap/api', [], []);
        assertSame($t . '/public_html/RefMap', $p['root']);
        assertSame($t . '/public_html/RefMap/data', $p['data']);
    },
    'config root wins and data defaults under it' => function () {
        $t = tempTree(['public_html/RefMap/api', 'home/refmap/src', 'home/refmap/data']);
        $p = refmapPaths($t . '/public_html/RefMap/api', ['root' => $t . '/home/refmap'], ['REFMAP_ROOT' => '/ignored']);
        assertSame($t . '/home/refmap', $p['root']);
        assertSame($t . '/home/refmap/data', $p['data']);
    },
    'environment root is used when there is no config' => function () {
        $t = tempTree(['site/api', 'elsewhere/src']);
        $p = refmapPaths($t . '/site/api', [], ['REFMAP_ROOT' => $t . '/elsewhere']);
        assertSame($t . '/elsewhere', $p['root']);
    },
    'data_dir in config beats the environment and the default' => function () {
        $t = tempTree(['site/api', 'site/src']);
        $p = refmapPaths($t . '/site/api', ['data_dir' => '/var/refdata/'], ['REFMAP_DATA_DIR' => '/env/data']);
        assertSame('/var/refdata', $p['data']);
        $q = refmapPaths($t . '/site/api', [], ['REFMAP_DATA_DIR' => '/env/data']);
        assertSame('/env/data', $q['data']);
    },
    'trailing slashes are trimmed' => function () {
        $t = tempTree(['site/api', 'x/src']);
        $p = refmapPaths($t . '/site/api', ['root' => $t . '/x/'], []);
        assertSame($t . '/x', $p['root']);
    },
    'missing src is an error that names where it looked' => function () {
        $t = tempTree(['lonely/api']);
        try {
            refmapPaths($t . '/lonely/api', [], []);
        } catch (RuntimeException $e) {
            assertTrue(str_contains($e->getMessage(), 'src'), $e->getMessage());
            return;
        }
        throw new Exception('expected RuntimeException');
    },
    'dataDir honors an explicit override and can be reset' => function () {
        setDataDir('/custom/place/');
        assertSame('/custom/place', dataDir());
        setDataDir(null);
        assertTrue(dataDir() !== '/custom/place');
    },
];
