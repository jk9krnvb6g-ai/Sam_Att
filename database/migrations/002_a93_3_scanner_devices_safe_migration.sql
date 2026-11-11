-- ============================================================================
-- Sam_Att V2 — A93.3 Non-Destructive Safe Migration for `scanner_devices`
-- Target Database: `samchuk_attendance_v2` (MySQL 8.0+ / MariaDB 10.5+)
--
-- SAFETY GUARANTEES:
-- 1. Zero destructive DDL statements; existing table data is 100% preserved.
-- 2. Idempotent: Safe to run multiple times on existing production databases.
-- 3. Ensures `scanner_devices` table, all required columns (`device_port`, etc.),
--    and the unique constraint on `machine_no` exist without losing existing rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS scanner_devices (
  id VARCHAR(20) PRIMARY KEY,
  machine_no INT NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  device_port INT NOT NULL DEFAULT 4370,
  location VARCHAR(150) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('ONLINE', 'OFFLINE', 'SYNCING', 'ERROR') NOT NULL DEFAULT 'ONLINE',
  last_sync_at TIMESTAMP NULL,
  last_event_at TIMESTAMP NULL,
  last_error TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS sam_att_a93_3_apply_scanner_devices_migration;

DELIMITER $$
CREATE PROCEDURE sam_att_a93_3_apply_scanner_devices_migration()
BEGIN
  -- Ensure `device_port` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'device_port'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN device_port INT NOT NULL DEFAULT 4370 AFTER ip;
  END IF;

  -- Ensure `location` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'location'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN location VARCHAR(150) NULL AFTER device_port;
  END IF;

  -- Ensure `enabled` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'enabled'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER location;
  END IF;

  -- Ensure `auto_sync_enabled` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'auto_sync_enabled'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER enabled;
  END IF;

  -- Ensure `status` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'status'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN status ENUM('ONLINE', 'OFFLINE', 'SYNCING', 'ERROR') NOT NULL DEFAULT 'ONLINE' AFTER auto_sync_enabled;
  END IF;

  -- Ensure `last_sync_at` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'last_sync_at'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN last_sync_at TIMESTAMP NULL AFTER status;
  END IF;

  -- Ensure `last_event_at` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'last_event_at'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN last_event_at TIMESTAMP NULL AFTER last_sync_at;
  END IF;

  -- Ensure `last_error` column exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'last_error'
  ) THEN
    ALTER TABLE scanner_devices ADD COLUMN last_error TEXT NULL AFTER last_event_at;
  END IF;

  -- Ensure unique index on `machine_no` exists
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scanner_devices'
      AND COLUMN_NAME = 'machine_no'
      AND NON_UNIQUE = 0
  ) THEN
    ALTER TABLE scanner_devices ADD UNIQUE INDEX uq_scanner_devices_machine_no (machine_no);
  END IF;
END$$
DELIMITER ;

CALL sam_att_a93_3_apply_scanner_devices_migration();
DROP PROCEDURE IF EXISTS sam_att_a93_3_apply_scanner_devices_migration;
