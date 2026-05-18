# scripts/cleanup-root.ps1
# Phase 2 : Nettoie la racine du projet (version Windows)
# Exécuter UNE SEULE FOIS depuis la racine du projet :
#   PowerShell -ExecutionPolicy Bypass -File scripts\cleanup-root.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n Nettoyage de la racine..." -ForegroundColor Cyan

# Création des dossiers de destination
New-Item -ItemType Directory -Force -Path "scripts\migrations\archived" | Out-Null
New-Item -ItemType Directory -Force -Path "scripts\tools" | Out-Null

# Scripts de migration à archiver
$migrationFiles = @(
    "add-author-col.js", "add-category-col.js", "add-contract.js",
    "add-cords.js", "add-discount-col.js", "add-language-col.js",
    "add-title-col.js", "add-title.js", "add-urgent.js",
    "add_ce_secondary.js", "add_name_de.js",
    "fix-db.js", "fix-logs-db.js", "fix-logs-meta.js",
    "fix-reports-db.js", "fix-rma-table.js", "fix-status-constraint.js",
    "fix-tags.js", "fix-users-db.js", "fix-workflow.js", "fix_stk_table.js",
    "init-attachments.js", "init-notifications.js", "init-rmas-db.js",
    "init-tags.js", "init-tickets-db.js",
    "migrate-reports.js", "migrate_eq_notes.js", "migrate_hidden.js",
    "migrate_included.js", "migrate_secondary.js", "migrate_tech.js",
    "migration-contract.js", "reinit-tickets.js",
    "update-clients-contract.js", "update-prefs.js", "update-rmas-title.js",
    "update-tickets-final.js", "update-tickets-multi.js",
    "update-workflow-db.js", "update_db.js", "clean-db-reports.js"
)

foreach ($file in $migrationFiles) {
    if (Test-Path $file) {
        Move-Item $file "scripts\migrations\archived\" -Force
        Write-Host "  [OK] $file -> scripts\migrations\archived\" -ForegroundColor Green
    }
}

# Outils divers
$toolFiles = @("backup.js", "reset-tables.js")
foreach ($file in $toolFiles) {
    if (Test-Path $file) {
        Move-Item $file "scripts\tools\" -Force
        Write-Host "  [OK] $file -> scripts\tools\" -ForegroundColor Green
    }
}

# todo.txt
if (Test-Path "todo.txt") {
    Write-Host "`n  [!] todo.txt trouve - utilise les Issues GitHub a la place." -ForegroundColor Yellow
    Write-Host "      Copie son contenu puis supprime-le : git rm todo.txt" -ForegroundColor Yellow
}

Write-Host "`n Nettoyage termine !" -ForegroundColor Green
Write-Host " Commande Git : git add -A && git commit -m 'refactor: nettoyage racine du projet'" -ForegroundColor Cyan
