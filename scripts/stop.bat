@echo off
setlocal

where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is required but was not found on PATH.
  exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo Docker Compose is required but was not found.
  exit /b 1
)

cd /d "%~dp0.."
docker compose down
if errorlevel 1 (
  echo Failed to stop the Project Management MVP.
  exit /b 1
)

echo Project Management MVP stopped.
