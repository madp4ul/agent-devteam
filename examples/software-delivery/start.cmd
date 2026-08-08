@echo off
setlocal

for %%I in ("%~dp0..\..") do set "REPOSITORY_ROOT=%%~fI"
for %%I in ("%REPOSITORY_ROOT%\..") do set "REPOSITORY_PARENT=%%~fI"
for %%I in ("%REPOSITORY_ROOT%") do set "REPOSITORY_NAME=%%~nxI"
set "DATABASE_PATH=%REPOSITORY_ROOT%\.data\software-delivery-example.sqlite3"
set "TASK_WORKSPACE_ROOT=%REPOSITORY_PARENT%\%REPOSITORY_NAME%-software-delivery-example-workspaces"

cd /d "%REPOSITORY_ROOT%"

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo Error: pnpm.cmd was not found on PATH.
  echo Complete docs\development-setup.md, then open a fresh terminal and try again.
  exit /b 1
)

git status --short >nul
if errorlevel 1 (
  echo.
  echo Error: Git cannot access this checkout as the current Windows account.
  echo Run this launcher from a normal, non-elevated terminal owned by the same account as the checkout.
  echo See docs\development-setup.md for the repository identity checks.
  exit /b 1
)

call pnpm.cmd run build
if errorlevel 1 exit /b %errorlevel%

call pnpm.cmd start -- --process "%~dp0process.yaml" --database "%DATABASE_PATH%" --project "%REPOSITORY_ROOT%" --task-workspaces "%TASK_WORKSPACE_ROOT%" %*
exit /b %errorlevel%
