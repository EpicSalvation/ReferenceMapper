<?php
// Minimal assertion runner: php -c dev/php.ini tests/run.php [filter]
error_reporting(E_ALL);
set_error_handler(function ($no, $str, $file, $line) {
    throw new ErrorException($str, 0, $no, $file, $line);
});

function assertSame($expected, $actual, string $msg = ''): void
{
    if ($expected !== $actual) {
        throw new Exception(($msg !== '' ? "$msg: " : '') . 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

function assertTrue($cond, string $msg = ''): void
{
    if (!$cond) {
        throw new Exception($msg !== '' ? $msg : 'assertion failed');
    }
}

$filter = $argv[1] ?? '';
$pass = 0;
$fail = 0;
foreach (glob(__DIR__ . '/php/*Test.php') as $file) {
    $tests = require $file;
    foreach ($tests as $name => $fn) {
        $label = basename($file, '.php') . '::' . $name;
        if ($filter !== '' && strpos($label, $filter) === false) {
            continue;
        }
        try {
            $fn();
            $pass++;
            echo "PASS $label\n";
        } catch (Throwable $e) {
            $fail++;
            echo "FAIL $label: " . $e->getMessage() . "\n";
        }
    }
}
echo "\n$pass passed, $fail failed\n";
exit($fail > 0 ? 1 : 0);
