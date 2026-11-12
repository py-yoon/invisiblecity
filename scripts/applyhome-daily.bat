@echo off
rem Daily: applyhome result post (plus schedule post on Mondays), then push. Called by Task Scheduler "applyhome-daily".
cd /d "%~dp0.."
git pull --rebase -q || exit /b 1
node scripts\digest.mjs applyhome || exit /b 1
for /f %%d in ('powershell -NoProfile -c "(Get-Date).DayOfWeek"') do if "%%d"=="Monday" node scripts\digest.mjs applyhome-week
git add src/content/posts
git diff --cached --quiet && exit /b 0
git commit -q -m "auto: applyhome posts %date%"
git push -q
