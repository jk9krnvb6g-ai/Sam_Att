-- =====================================================================
-- Sam_Att V2 — Safe Non-Destructive Migration (001_phase1_phase2_safe_migration.sql)
-- Target Database: samchuk_attendance
-- Rules (§6 & §7):
-- 1. Zero DROP TABLE / Zero TRUNCATE statements.
-- 2. Preserves all existing production/staging rows.
-- 3. Adds only missing columns, tables, and indexes required for Phase 1 + Phase 2.
-- =====================================================================

-- 1. Upgrade `users` table with full_name, department, position
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(150) NOT NULL DEFAULT '' AFTER password_hash,
  ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL AFTER person_id,
  ADD COLUMN IF NOT EXISTS position VARCHAR(150) NULL AFTER department;

-- 2. Upgrade `personnel` table with mapping_status and cid_masked
ALTER TABLE personnel
  ADD COLUMN IF NOT EXISTS cid_masked VARCHAR(30) NULL AFTER fingle_id_current,
  ADD COLUMN IF NOT EXISTS mapping_status ENUM('MAPPED', 'UNMAPPED', 'DISPUTED') NOT NULL DEFAULT 'MAPPED' AFTER personnel_type;

-- 3. Upgrade `shifts` table with category, personnel_type_rule_id, deactivation audit fields
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS category ENUM('MORNING', 'AFTERNOON', 'NIGHT', 'MORNING_AFTERNOON', 'AFTERNOON_NIGHT', 'ALL_DAY', 'OFFICE', 'SPECIAL', 'OTHER') NOT NULL DEFAULT 'MORNING' AFTER name,
  ADD COLUMN IF NOT EXISTS personnel_type_rule_id VARCHAR(36) NULL AFTER late_scan_window_minutes,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP NULL AFTER active,
  ADD COLUMN IF NOT EXISTS deactivated_reason VARCHAR(255) NULL AFTER deactivated_at;

-- 4. Upgrade `shift_assignments` with historical snapshots and soft-cancellation audit fields
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS shift_name_snapshot VARCHAR(120) NULL AFTER assignment_type,
  ADD COLUMN IF NOT EXISTS shift_start_snapshot TIME NULL AFTER shift_name_snapshot,
  ADD COLUMN IF NOT EXISTS shift_end_snapshot TIME NULL AFTER shift_start_snapshot,
  ADD COLUMN IF NOT EXISTS cross_midnight_snapshot BOOLEAN NOT NULL DEFAULT FALSE AFTER shift_end_snapshot,
  ADD COLUMN IF NOT EXISTS grace_minutes_snapshot INT NOT NULL DEFAULT 15 AFTER cross_midnight_snapshot,
  ADD COLUMN IF NOT EXISTS shift_category_snapshot VARCHAR(30) NULL AFTER grace_minutes_snapshot,
  ADD COLUMN IF NOT EXISTS status ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE' AFTER shift_category_snapshot,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL AFTER status,
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(100) NULL AFTER cancelled_at,
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255) NULL AFTER cancelled_by;

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

-- 6. Upgrade `raw_scans` with mapping tracking fields (preserving immutable 6 core fields)
ALTER TABLE raw_scans
  ADD COLUMN IF NOT EXISTS mapped_person_id VARCHAR(20) NULL AFTER work_code,
  ADD COLUMN IF NOT EXISTS mapping_status ENUM('MAPPED', 'PENDING_MAPPING', 'DISPUTED_MAPPING') NOT NULL DEFAULT 'MAPPED' AFTER mapped_person_id;

-- 7. Upgrade `attendance` table for cross-midnight full datetime, HR review status, and ambiguous scan flag
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS checkin_datetime DATETIME NULL AFTER checkout_at,
  ADD COLUMN IF NOT EXISTS checkout_datetime DATETIME NULL AFTER checkin_datetime,
  ADD COLUMN IF NOT EXISTS early_checkout_minutes INT NOT NULL DEFAULT 0 AFTER late_minutes,
  ADD COLUMN IF NOT EXISTS has_missing_checkout BOOLEAN NOT NULL DEFAULT FALSE AFTER early_checkout_minutes,
  ADD COLUMN IF NOT EXISTS evaluation_state ENUM('EVALUATED', 'IN_PROGRESS', 'FUTURE', 'AMBIGUOUS_REQUIRES_REVIEW') NOT NULL DEFAULT 'EVALUATED' AFTER status,
  ADD COLUMN IF NOT EXISTS hr_review_status ENUM('PENDING_REVIEW', 'REVIEWED', 'NOT_REQUIRED') NOT NULL DEFAULT 'NOT_REQUIRED' AFTER evaluation_state,
  ADD COLUMN IF NOT EXISTS ambiguous_scan_flag BOOLEAN NOT NULL DEFAULT FALSE AFTER hr_review_status,
  ADD COLUMN IF NOT EXISTS evaluation_note VARCHAR(255) NULL AFTER ambiguous_scan_flag,
  ADD COLUMN IF NOT EXISTS related_raw_scan_ids JSON NULL AFTER raw_scan_out_id;

-- 8. Expand `attendance_notes` reason_code enum to support operational HR review reasons
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

-- 9. Create `hr_review_history` table (Table #7 in §7)
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

-- 10. Create `personnel_type_rules`, `sync_schedules`, and `hosoffice_sync_logs` if not exists
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
