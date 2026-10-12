<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

final class Db
{
    public static function refs(): PDO
    {
        $pdo = new PDO('sqlite:' . dataDir() . '/refs.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA query_only = ON');
        return $pdo;
    }

    public static function searches(): PDO
    {
        $pdo = new PDO('sqlite:' . dataDir() . '/searches.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA busy_timeout = 2000');
        self::initSearches($pdo);
        return $pdo;
    }

    public static function initSearches(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS searches (verse_id INTEGER PRIMARY KEY, count INTEGER NOT NULL, last_at INTEGER NOT NULL)');
    }
}
