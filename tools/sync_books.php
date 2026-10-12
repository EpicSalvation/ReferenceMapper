<?php
// Copies the authored table (data/books.json) to the web docroot.
$src = __DIR__ . '/../data/books.json';
$dst = __DIR__ . '/../public/books.json';
if (!copy($src, $dst)) {
    fwrite(STDERR, "copy failed\n");
    exit(1);
}
echo "synced books.json\n";
