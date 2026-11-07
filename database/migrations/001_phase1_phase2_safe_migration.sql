-- =====================================================================
-- Sam_Att V2 — Version-Aware Idempotent Migration (Phase 1+2 Hardening)
-- File: 001_phase1_phase2_safe_migration.sql
-- Target Database: samchuk_attendance
-- Target Environment: TEST / STAGING ONLY (Do NOT run on Production without backup verification)
--
-- IMPORTANT MYSQL VERSION COMPATIBILITY NOTE (§3):
-- Standard Oracle MySQL 8.0 / 5.7 does NOT support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
-- (which is MariaDB-only syntax and causes ER_PARSE_ERROR on Oracle MySQL).
-- Therefore, this migration uses `INFORMATION_SCHEMA.COLUMNS` inspection inside a temporary
-- Stored Procedure (`sam_att_add_column_if_missing`) so it works safely on BOTH
-- Oracle MySQL 8.0+ and MariaDB 10.4+ without syntax errors!
--
-- RULES (§3):
-- 1. Zero DROP TABLE / Zero TRUNCATE on any domain table.
-- 2. Does NOT mutate existing production data rows automatically.
-- 3. Verifies MySQL/MariaDB server version before applying DDL.
-- =====================================================================

-- Step 0: Record and verify MySQL / MariaDB Server Version
SELECT VERSION() AS detected_db_version, DATABASE() AS current_database;

-- Helper Stored Procedure for MySQL 8.0+ & MariaDB safe column addition
DROP PROCEDURE IF EXISTS sam_att_add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE sam_att_add_column_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_column_ddl TEXT
)
BEGIN
  DECLARE v_col_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO v_col_exists
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = p_table_name
    AND COLUMN_NAME = p_column_name;

  IF v_col_exists = 0 THEN
    SET @sql_stmt = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN ', p_column_ddl);
    PREPARE stmt FROM @sql_stmt;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 1. Upgrade `users` table
CALL sam_att_add_column_if_missing('users', 'full_name', '`full_name` VARCHAR(150) NOT NULL DEFAULT '''' AFTER `password_hash`');
CALL sam_att_add_column_if_missing('users', 'department', '`department` VARCHAR(100) NULL AFTER `person_id`');
CALL sam_att_add_column_if_missing('users', 'position', '`position` VARCHAR(150) NULL AFTER `department`');

-- 2. Upgrade `personnel` table
CALL sam_att_add_column_if_missing('personnel', 'cid_masked', '`cid_masked` VARCHAR(30) NULL AFTER `fingle_id_current`');
CALL sam_att_add_column_if_missing('personnel', 'mapping_status', '`mapping_status` ENUM(''MAPPED'', ''UNMAPPED'', ''DISPUTED'') NOT NULL DEFAULT ''MAPPED'' AFTER `personnel_type`');

-- 3. Upgrade `shifts` table
CALL sam_att_add_column_if_missing('shifts', 'category', '`category` ENUM(''MORNING'', ''AFTERNOON'', ''NIGHT'', ''MORNING_AFTERNOON'', ''AFTERNOON_NIGHT'', ''ALL_DAY'', ''OFFICE'', ''SPECIAL'', ''OTHER'') NOT NULL DEFAULT ''MORNING'' AFTER `name`');
CALL sam_att_add_column_if_missing('shifts', 'personnel_type_rule_id', '`personnel_type_rule_id` VARCHAR(36) NULL AFTER `late_scan_window_minutes`');
CALL sam_att_add_column_if_missing('shifts', 'deactivated_at', '`deactivated_at` TIMESTAMP NULL AFTER `active`');
CALL sam_att_add_column_if_missing('shifts', 'deactivated_reason', '`deactivated_reason` VARCHAR(255) NULL AFTER `deactivated_at`');

-- 4. Upgrade `shift_assignments` table
CALL sam_att_add_column_if_missing('shift_assignments', 'shift_name_snapshot', '`shift_name_snapshot` VARCHAR(120) NULL AFTER `assignment_type`');
CALL sam_att_add_column_if_missing('shift_assignments', 'shift_start_snapshot', '`shift_start_snapshot` TIME NULL AFTER `shift_name_snapshot`');
CALL sam_att_add_column_if_missing('shift_assignments', 'shift_end_snapshot', '`shift_end_snapshot` TIME NULL AFTER `shift_start_snapshot`');
CALL sam_att_add_column_if_missing('shift_assignments', 'cross_midnight_snapshot', '`cross_midnight_snapshot` BOOLEAN NOT NULL DEFAULT FALSE AFTER `shift_end_snapshot`');
CALL sam_att_add_column_if_missing('shift_assignments', 'grace_minutes_snapshot', '`grace_minutes_snapshot` INT NOT NULL DEFAULT 15 AFTER `cross_midnight_snapshot`');
CALL sam_att_add_column_if_missing('shift_assignments', 'shift_category_snapshot', '`shift_category_snapshot` VARCHAR(30) NULL AFTER `grace_minutes_snapshot`');
CALL sam_att_add_column_if_missing('shift_assignments', 'status', '`status` ENUM(''ACTIVE'', ''CANCELLED'') NOT NULL DEFAULT ''ACTIVE'' AFTER `shift_category_snapshot`');
CALL sam_att_add_column_if_missing('shift_assignments', 'cancelled_at', '`cancelled_at` TIMESTAMP NULL AFTER `status`');
CALL sam_att_add_column_if_missing('shift_assignments', 'cancelled_by', '`cancelled_by` VARCHAR(100) NULL AFTER `cancelled_at`');
CALL sam_att_add_column_if_missing('shift_assignments', 'cancel_reason', '`cancel_reason` VARCHAR(255) NULL AFTER `cancelled_by`');

-- 5. Create `shift_cancellation_logs` table if not exists
CREATE TABLE IF NOT EXISTS shift_cancellation_logs (
  id VARCHAR(36) PRIMARY KEY,
  assignment_id VARCHAR(36) NOT NULL,
  person_id VARCHAR(20) NOT NULL,
  person_name VARCHAR(150) NOT NULL,
  work_date DATE NOT NULL,
  shift_id VARCHAR(36) NOT NULL,
  shift_name VARCHAR(120) NOT NULL,
  cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_by VARCHAR(100) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  INDEX idx_shift_cancel_person_date (person_id, work_date)
);

-- 6. Upgrade `raw_scans` table (preserving immutable 6 core fields + Unique dedupe_key)
CALL sam_att_add_column_if_missing('raw_scans', 'mapped_person_id', '`mapped_person_id` VARCHAR(20) NULL AFTER `work_code`');
CALL sam_att_add_column_if_missing('raw_scans', 'mapping_status', '`mapping_status` ENUM(''MAPPED'', ''PENDING_MAPPING'', ''DISPUTED_MAPPING'') NOT NULL DEFAULT ''MAPPED'' AFTER `mapped_person_id`');

-- 7. Upgrade `attendance` table
CALL sam_att_add_column_if_missing('attendance', 'checkin_datetime', '`checkin_datetime` DATETIME NULL AFTER `checkout_at`');
CALL sam_att_add_column_if_missing('attendance', 'checkout_datetime', '`checkout_datetime` DATETIME NULL AFTER `checkin_datetime`');
CALL sam_att_add_column_if_missing('attendance', 'early_checkout_minutes', '`early_checkout_minutes` INT NOT NULL DEFAULT 0 AFTER `late_minutes`');
CALL sam_att_add_column_if_missing('attendance', 'has_missing_checkout', '`has_missing_checkout` BOOLEAN NOT NULL DEFAULT FALSE AFTER `early_checkout_minutes`');
CALL sam_att_add_column_if_missing('attendance', 'evaluation_state', '`evaluation_state` ENUM(''EVALUATED'', ''IN_PROGRESS'', ''FUTURE'', ''AMBIGUOUS_REQUIRES_REVIEW'') NOT NULL DEFAULT ''EVALUATED'' AFTER `status`');
CALL sam_att_add_column_if_missing('attendance', 'hr_review_status', '`hr_review_status` ENUM(''PENDING_REVIEW'', ''REVIEWED'', ''NOT_REQUIRED'') NOT NULL DEFAULT ''NOT_REQUIRED'' AFTER `evaluation_state`');
CALL sam_att_add_column_if_missing('attendance', 'ambiguous_scan_flag', '`ambiguous_scan_flag` BOOLEAN NOT NULL DEFAULT FALSE AFTER `hr_review_status`');
CALL sam_att_add_column_if_missing('attendance', 'evaluation_note', '`evaluation_note` VARCHAR(255) NULL AFTER `ambiguous_scan_flag`');
CALL sam_att_add_column_if_missing('attendance', 'related_raw_scan_ids', '`related_raw_scan_ids` JSON NULL AFTER `raw_scan_out_id`');

-- 8. Expand `attendance_notes` reason_code enum
ALTER TABLE attendance_notes
  MODIFY COLUMN reason_code ENUM(
    'SICK_LEAVE',
    'BUSINESS_LEAVE',
    'VACATION_LEAVE',
    'OFFICIAL_DUTY',
    'FORGOT_CHECKIN',
    'FORGOT_CHECKOUT',
    'LATE_EXPLANATION',
    'SCANNER_ISSUE',
    'OFFSITE_DUTY',
    'SHIFT_SWAP',
    'TRAINING',
    'DAY_OFF',
    'OTHER'
  ) NOT NULL;

-- 9. Create `hr_review_history` table (Separated from Derived Attendance & Raw Scans)
CREATE TABLE IF NOT EXISTS hr_review_history (
  id VARCHAR(36) PRIMARY KEY,
  attendance_id VARCHAR(64) NOT NULL,
  reason_code VARCHAR(40) NOT NULL,
  reason_label VARCHAR(120) NOT NULL,
  note TEXT NULL,
  hr_review_status ENUM('PENDING_REVIEW', 'REVIEWED', 'NOT_REQUIRED') NOT NULL,
  author_user_id VARCHAR(36) NOT NULL,
  author_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_id) REFERENCES attendance(id),
  INDEX idx_hr_history_att (attendance_id, created_at)
);

-- 10. Create `personnel_type_rules`, `sync_schedules`, and `hosoffice_sync_logs`
CREATE TABLE IF NOT EXISTS personnel_type_rules (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  badge_char VARCHAR(10) NOT NULL DEFAULT 'บ',
  morning_start TIME NOT NULL DEFAULT '08:15:00',
  morning_end TIME NOT NULL DEFAULT '16:00:00',
  morning_grace_minutes INT NOT NULL DEFAULT 0,
  afternoon_start TIME NOT NULL DEFAULT '16:00:00',
  afternoon_end TIME NOT NULL DEFAULT '00:00:00',
  afternoon_grace_minutes INT NOT NULL DEFAULT 15,
  night_start TIME NOT NULL DEFAULT '00:00:00',
  night_end TIME NOT NULL DEFAULT '08:00:00',
  night_cross_midnight BOOLEAN NOT NULL DEFAULT TRUE,
  night_grace_minutes INT NOT NULL DEFAULT 15,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_schedules (
  id VARCHAR(36) PRIMARY KEY,
  sync_time TIME NOT NULL,
  label VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Bangkok',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hosoffice_sync_logs (
  id VARCHAR(36) PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NOT NULL,
  status ENUM('SUCCESS', 'PARTIAL_WITH_ISSUES', 'AWAITING_REAL_CREDENTIALS', 'FAILED') NOT NULL,
  total_read INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  fingle_id_changed_count INT NOT NULL DEFAULT 0,
  disputed_mapping_count INT NOT NULL DEFAULT 0,
  triggered_by VARCHAR(50) NOT NULL,
  summary TEXT NULL,
  INDEX idx_hos_sync_started (started_at)
);

-- 11. Create `revoked_sessions` and `auth_rate_limits` tables for persistent security state across restarts & multi-process (§9)
CREATE TABLE IF NOT EXISTS revoked_sessions (
  jti VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at_sec BIGINT NOT NULL,
  INDEX idx_revoked_user (user_id),
  INDEX idx_revoked_expires (expires_at_sec)
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key VARCHAR(120) PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 0,
  first_failed_at_ms BIGINT NOT NULL,
  locked_until_ms BIGINT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Cleanup helper procedure
DROP PROCEDURE IF EXISTS sam_att_add_column_if_missing;

