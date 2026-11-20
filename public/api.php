<?php
// Route 66 Coffee Diner — API для звичайного PHP-хостингу (те самі функції, що й server.js)
// Дані зберігаються в папці data/ (поруч із public/ або всередині public/ — див. README).
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$DATA = is_dir(__DIR__ . '/../data') ? realpath(__DIR__ . '/../data') : __DIR__ . '/data';
const DEFAULT_PASSWORD = 'route66admin';
const TOKEN_TTL = 43200;

function out(int $code, $data): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function rjson(string $name, $fallback) {
  global $DATA; $f = "$DATA/$name";
  if (!is_file($f)) return $fallback;
  $v = json_decode((string)file_get_contents($f), true);
  return $v === null ? $fallback : $v;
}
function wjson(string $name, $value): void {
  global $DATA; $f = "$DATA/$name";
  file_put_contents("$f.tmp", json_encode($value, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
  rename("$f.tmp", $f);
}
function body(): array { $b = json_decode((string)file_get_contents('php://input'), true); return is_array($b) ? $b : []; }
function hashPw(string $pw, string $salt): string { return hash_pbkdf2('sha256', $pw, $salt, 100000, 64); }
function getAuth(): array {
  $a = rjson('auth.json', null);
  if (!$a) {
    $salt = bin2hex(random_bytes(16));
    $a = ['salt' => $salt, 'hash' => hashPw(DEFAULT_PASSWORD, $salt), 'secret' => bin2hex(random_bytes(32)), 'isDefault' => true];
    wjson('auth.json', $a);
  }
  return $a;
}
function makeToken(array $a): string { $exp = time() + TOKEN_TTL; return $exp . '.' . hash_hmac('sha256', (string)$exp, $a['secret']); }
function authed(): bool {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$h && function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v; }
  if (strpos($h, 'Bearer ') !== 0) return false;
  $parts = explode('.', substr($h, 7));
  if (count($parts) !== 2 || (int)$parts[0] < time()) return false;
  return hash_equals(hash_hmac('sha256', $parts[0], getAuth()['secret']), $parts[1]);
}
function need(): void { if (!authed()) out(401, ['error' => 'Потрібен вхід адміністратора']); }
function clean($s, int $max): string { return mb_substr(trim(preg_replace('/[\x00-\x1f]/u', ' ', (string)$s)), 0, $max); }

$route = trim($_GET['r'] ?? '', '/');
$m = $_SERVER['REQUEST_METHOD'];

if ($route === 'login' && $m === 'POST') {
  $b = body(); $a = getAuth();
  if (!hash_equals($a['hash'], hashPw((string)($b['password'] ?? ''), $a['salt']))) { usleep(600000); out(401, ['error' => 'Невірний пароль']); }
  out(200, ['token' => makeToken($a), 'isDefault' => !empty($a['isDefault'])]);
}
if ($route === 'password' && $m === 'POST') {
  need(); $b = body(); $a = getAuth();
  if (!hash_equals($a['hash'], hashPw((string)($b['old'] ?? ''), $a['salt']))) out(400, ['error' => 'Старий пароль невірний']);
  $pw = (string)($b['new'] ?? '');
  if (mb_strlen($pw) < 6) out(400, ['error' => 'Пароль має містити щонайменше 6 символів']);
  $salt = bin2hex(random_bytes(16));
  $n = ['salt' => $salt, 'hash' => hashPw($pw, $salt), 'secret' => bin2hex(random_bytes(32)), 'isDefault' => false];
  wjson('auth.json', $n);
  out(200, ['ok' => true, 'token' => makeToken($n)]);
}
if ($route === 'menu') {
  if ($m === 'GET') out(200, rjson('menu.json', ['categories' => []]));
  if ($m === 'PUT') { need(); $b = body(); if (!isset($b['categories']) || !is_array($b['categories'])) out(400, ['error' => 'Невірний формат меню']); wjson('menu.json', $b); out(200, ['ok' => true]); }
}
if ($route === 'settings') {
  if ($m === 'GET') out(200, (object)rjson('settings.json', []));
  if ($m === 'PUT') { need(); wjson('settings.json', body()); out(200, ['ok' => true]); }
}
if ($route === 'reviews') {
  $list = rjson('reviews.json', []);
  if ($m === 'GET') {
    $all = !empty($_GET['all']) && authed();
    out(200, $all ? $list : array_values(array_filter($list, fn($r) => empty($r['hidden']))));
  }
  if ($m === 'POST') {
    $b = body();
    if (!empty($b['website'])) out(200, ['ok' => true]);
    $ipFile = sys_get_temp_dir() . '/r66_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
    if (is_file($ipFile) && time() - filemtime($ipFile) < 30) out(429, ['error' => 'Зачекайте трохи перед наступним відгуком']);
    $name = clean($b['name'] ?? '', 40); $text = clean($b['text'] ?? '', 600); $rating = (int)($b['rating'] ?? 0);
    if (mb_strlen($name) < 2 || mb_strlen($text) < 5 || $rating < 1) out(400, ['error' => 'Заповніть імʼя, оцінку та текст відгуку']);
    $s = rjson('settings.json', []);
    $r = ['id' => bin2hex(random_bytes(6)), 'name' => $name, 'rating' => min(5, $rating), 'text' => $text, 'date' => gmdate('c'), 'hidden' => !empty($s['reviewsModeration'])];
    array_unshift($list, $r); wjson('reviews.json', $list); touch($ipFile);
    out(200, ['ok' => true, 'pending' => $r['hidden']]);
  }
}
if (preg_match('#^reviews/([a-f0-9]+)$#', $route, $mm)) {
  need(); $list = rjson('reviews.json', []); $i = null;
  foreach ($list as $k => $r) if ($r['id'] === $mm[1]) $i = $k;
  if ($i === null) out(404, ['error' => 'Відгук не знайдено']);
  if ($m === 'DELETE') { array_splice($list, $i, 1); wjson('reviews.json', $list); out(200, ['ok' => true]); }
  if ($m === 'PATCH') { $b = body(); if (array_key_exists('hidden', $b)) $list[$i]['hidden'] = (bool)$b['hidden']; wjson('reviews.json', $list); out(200, ['ok' => true]); }
}
out(404, ['error' => 'Не знайдено']);
