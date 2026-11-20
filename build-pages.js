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

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
for (const f of SKIP) fs.rmSync(path.join(OUT, f), { force: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
for (const f of ['menu.json', 'settings.json']) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Зібрано у _site/');

if (process.argv.includes('--publish')) {
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
