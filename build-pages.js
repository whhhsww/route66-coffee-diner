// Збирає статичну вітрину для GitHub Pages у папку _site
// і (з прапорцем --publish) публікує її в гілку gh-pages.
//   node build-pages.js            — лише зібрати
//   node build-pages.js --publish  — зібрати й опублікувати
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const SKIP = ['api.php', '.htaccess', 'admin.html', 'css/admin.css', 'js/admin.js'];
const PUBLISH = process.argv.includes('--publish');

// Власник міняє меню прямо на сайті — ці зміни комітяться в гілку gh-pages.
// Перед публікацією забираємо їх, якщо вони новіші за локальні файли, щоб не затерти.
if (PUBLISH) {
  const git = cmd => execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  let fetched = false;
  try { git('git fetch -q origin gh-pages'); fetched = true; } catch (e) { console.log('Гілки gh-pages ще немає — публікуємо вперше.'); }
  if (fetched) for (const f of ['menu.json', 'settings.json']) {
    const remoteTime = Number(git(`git log -1 --format=%ct origin/gh-pages -- data/${f}`) || 0) * 1000;
    const local = path.join(ROOT, 'data', f);
    const localTime = fs.existsSync(local) ? fs.statSync(local).mtimeMs : 0;
    if (remoteTime > localTime) {
      fs.writeFileSync(local, git(`git show origin/gh-pages:data/${f}`) + '\n');
      console.log(`data/${f}: взято новішу версію з сайту (зміни власника).`);
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
for (const f of SKIP) fs.rmSync(path.join(OUT, f), { force: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
for (const f of ['menu.json', 'settings.json']) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Зібрано у _site/');

if (PUBLISH) {
  const run = cmd => execSync(cmd, { cwd: OUT, stdio: 'inherit' });
  const remote = execSync('git remote get-url origin', { cwd: ROOT }).toString().trim();
  const name = execSync('git config user.name', { cwd: ROOT }).toString().trim();
  const email = execSync('git config user.email', { cwd: ROOT }).toString().trim();
  run('git init -q -b gh-pages');
  run(`git config user.name "${name}"`);
  run(`git config user.email "${email}"`);
  run('git add -A');
  run(`git commit -q -m "Оновлення вітрини ${new Date().toISOString().slice(0, 16).replace('T', ' ')}"`);
  run(`git push -f "${remote}" gh-pages`);
  console.log('Опубліковано. Сайт оновиться за 1–2 хвилини.');
}
