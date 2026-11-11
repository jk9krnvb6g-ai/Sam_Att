# Sam_Att V2 — A93.3 Scanner Registry & A94 Production Release Runbook

**Repository:** `jk9krnvb6g-ai/Sam_Att`  
**Target Server:** Windows Server `FILESERVER`  
**Frontend:** HTTPS Port `3001`, Path `/Sam_Att/`  
**Backend:** Shared Central API Gateway Port `3002`, Path `/api/Sam_Att/`  
**Database:** MySQL `samchuk_attendance_v2`  

---

## 1. Release Scope Summary (A93.3 – A94)

1. **A93.2 Dependency Compatibility Fix**:
   - Root `package.json` `esbuild` devDependency aligned to `^0.28.0` (compatible with Vite `8.3.x` on Node.js `v24.13.0` / npm `v11.6.2`).
2. **A93.3 Persistent Scanner Registry**:
   - Added persistent Scanner Device CRUD endpoints under `/api/Sam_Att`:
     - `GET /api/Sam_Att/scanners` (`ADMIN`, `RESPONSIBLE_STAFF`)
     - `POST /api/Sam_Att/scanners` (`ADMIN` only)
     - `PUT /api/Sam_Att/scanners/:id` (`ADMIN` only)
     - `PATCH /api/Sam_Att/scanners/:id/enabled` (`ADMIN` only)
     - `DELETE /api/Sam_Att/scanners/:id` (`ADMIN` only; safely deletes only the `scanner_devices` registry row while preserving 100% of `raw_scans` and `attendance` records)
   - Added non-destructive SQL migration `database/migrations/002_a93_3_scanner_devices_safe_migration.sql`.
   - Removed frontend derivation of scanner devices from Raw Scans so registered scanners with zero Raw Scans remain visible across refreshes, sync runs, and server restarts.
   - Preserved the existing Scanner Reader EXE and `/api/Sam_Att/scanners/sync` 6-field contract unchanged.

---

## 2. Pre-Deployment Verification & Backup Checklist (On `FILESERVER`)

Before touching any live directory on `FILESERVER`:

1. **Verify Procurement Health (Must Not Be Disrupted)**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:3002/api/Procurement/health" -Method GET
   ```
2. **Create Timestamped Backup of MySQL Database (`samchuk_attendance_v2`)**:
   ```powershell
   $ts = Get-Date -Format "yyyyMMdd_HHmmss"
   $backupDir = "D:\Backups\Sam_Att_V2\$ts"
   New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

   mysqldump -u $env:SAM_ATT_DB_USER -p"$env:SAM_ATT_DB_PASSWORD" `
     --single-transaction --routines --triggers `
     samchuk_attendance_v2 > "$backupDir\samchuk_attendance_v2_$ts.sql"
   ```
3. **Create Timestamped Backup of Current Sam_Att Frontend & Gateway Module**:
   ```powershell
   Copy-Item -Path "C:\inetpub\Sam_Att_Frontend\dist" -Destination "$backupDir\dist_backup" -Recurse
   Copy-Item -Path "C:\CentralApiGateway\modules\sam_att" -Destination "$backupDir\sam_att_module_backup" -Recurse
   ```

---

## 3. Isolated Staging Build & Test Procedure

Run in an isolated staging directory (e.g., `D:\Staging\Sam_Att_A94`) before copying artifacts to production:

```powershell
cd D:\Staging\Sam_Att_A94
git fetch origin main
git checkout main
git pull origin main

# 1. Install dependencies cleanly
npm ci

# 2. Run TypeScript check
npm run typecheck

# 3. Run Unit Tests (21/21)
npm run test:unit

# 4. Build Production Frontend Bundle (dist/)
npm run build

# 5. Run Full Integration Test Suite (12/12 scenarios including Scenario 22 Scanner Registry)
npm run test:integration
```

All four checks (`typecheck`, `test:unit`, `build`, `test:integration`) must exit with code `0` before proceeding.

---

## 4. Non-Destructive Database Migration (`samchuk_attendance_v2`)

Apply `002_a93_3_scanner_devices_safe_migration.sql` against `samchuk_attendance_v2`:

```powershell
mysql -u $env:SAM_ATT_DB_USER -p"$env:SAM_ATT_DB_PASSWORD" samchuk_attendance_v2 `
  < "D:\Staging\Sam_Att_A94\database\migrations\002_a93_3_scanner_devices_safe_migration.sql"
```

Verify the `scanner_devices` schema and existing rows:

```sql
USE samchuk_attendance_v2;
SHOW COLUMNS FROM scanner_devices;
SHOW INDEX FROM scanner_devices WHERE Column_name = 'machine_no';
SELECT id, machine_no, name, ip, device_port, location, enabled, auto_sync_enabled, status, last_sync_at FROM scanner_devices ORDER BY machine_no ASC;
```

---

## 5. Production Release Steps (`FILESERVER`)

1. **Update Sam_Att Backend Module in Central API Gateway (Port `3002`)**:
   - Copy updated `backend/` files into the Central API Gateway's `sam_att` module directory (`C:\CentralApiGateway\modules\sam_att\backend`).
   - Confirm `.env` in Central API Gateway has:
     - `NODE_ENV=production`
     - `SAM_ATT_REPO_MODE=REAL`
     - `SAM_ATT_DB_NAME=samchuk_attendance_v2`
     - `SAM_ATT_JWT_SECRET` (minimum 32 characters)
2. **Update Frontend Static Bundle (Port `3001`, `/Sam_Att/`)**:
   - Copy the newly built `dist/*` contents to the `/Sam_Att/` web root (`C:\inetpub\Sam_Att_Frontend\dist`).
3. **Graceful Reload of Central API Gateway**:
   - Reload the Gateway service during a low-traffic window and immediately verify both `/api/Procurement` and `/api/Sam_Att`.

---

## 6. Post-Deployment Smoke Verification

1. **Verify Procurement Remains Healthy**:
   - Confirm `Procurement` web UI and `/api/Procurement/*` respond normally on Port `3002`.
2. **Verify Sam_Att Database Hub**:
   - Log in as `ADMIN` at `https://FILESERVER:3001/Sam_Att/`.
   - Open **Database Hub** and confirm `samchukAttendanceDb.database` reports `samchuk_attendance_v2` with status `CONNECTED`.
3. **Verify Scanner Registry Persistence**:
   - Open **จัดการเครื่องสแกน (Scanner Management)**.
   - Add or edit a scanner device (`POST /api/Sam_Att/scanners` / `PUT /api/Sam_Att/scanners/:id`).
   - Refresh the browser (`F5`) and verify the scanner remains listed even with `0` Raw Scans.
   - Toggle enable/disable (`PATCH /api/Sam_Att/scanners/:id/enabled`) and refresh to verify persistence.

---

## 7. Rollback Plan

If any post-deployment check fails:

1. **Restore Frontend & Backend Module Files**:
   ```powershell
   Copy-Item -Path "$backupDir\dist_backup\*" -Destination "C:\inetpub\Sam_Att_Frontend\dist" -Recurse -Force
   Copy-Item -Path "$backupDir\sam_att_module_backup\*" -Destination "C:\CentralApiGateway\modules\sam_att" -Recurse -Force
   ```
2. **Restart/Reload Central API Gateway on Port `3002`** and verify `/api/Procurement` and `/api/Sam_Att`.
3. **Database Note**:
   - Because `002_a93_3_scanner_devices_safe_migration.sql` is strictly additive and non-destructive, existing `scanner_devices`, `raw_scans`, and `attendance` data remain compatible with the previous release without requiring a destructive restore. If a full database snapshot restore is ever needed, restore strictly from `$backupDir\samchuk_attendance_v2_$ts.sql` into `samchuk_attendance_v2` (never touching `Procurement` databases).
