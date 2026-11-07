-- =====================================================================
-- Sam_Att V2 — Complete Database Schema Definition (Phase 1 + Phase 2)
-- Database Name: samchuk_attendance
-- Target Engine: MySQL 8.0+ / MariaDB compatible
-- Designed exclusively for Samchuk Hospital Attendance System
-- Strictly isolated from Procurement and Cash_Cheque databases
-- Zero DROP / Zero TRUNCATE statements (Safe Idempotent DDL)
-- =====================================================================

-- 1. Users Table (System Accounts, Roles & Verified User-to-PERSON_ID Mapping)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL DEFAULT '',
  role ENUM('ADMIN', 'RESPONSIBLE_STAFF', 'GENERAL_USER') NOT NULL DEFAULT 'GENERAL_USER',
  person_id VARCHAR(20) NULL, -- Authoritative mapping to personnel.person_id for GENERAL_USER
  department VARCHAR(100) NULL,
  position VARCHAR(150) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_person_id (person_id),
  INDEX idx_users_role_active (role, active)
);

-- 2. Personnel Table (Authoritative source: Synchronized from HOSOffice.hr_person)
CREATE TABLE IF NOT EXISTS personnel (
  person_id VARCHAR(20) PRIMARY KEY,
  fingle_id_current INT NULL,
  cid_masked VARCHAR(30) NULL,
  prefix VARCHAR(30) NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  position VARCHAR(150) NULL,
  department VARCHAR(100) NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  personnel_type VARCHAR(80) NOT NULL,
  mapping_status ENUM('MAPPED', 'UNMAPPED', 'DISPUTED') NOT NULL DEFAULT 'MAPPED',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_hosoffice_sync TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_personnel_fingle (fingle_id_current),
  INDEX idx_personnel_dept (department),
  INDEX idx_personnel_group (group_name),
  INDEX idx_personnel_type (personnel_type)
);

-- 3. Fingerprint Mappings with Effective Dates (Preserves history when FINGLE_ID changes)
CREATE TABLE IF NOT EXISTS fingerprint_mappings (
  id VARCHAR(36) PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  fingle_id INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status ENUM('ACTIVE', 'SUPERSEDED', 'DISPUTED') NOT NULL DEFAULT 'ACTIVE',
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES personnel(person_id),
  INDEX idx_mapping_lookup (fingle_id, status, effective_from, effective_to),
  INDEX idx_mapping_person (person_id, effective_from)
);

-- 4. Personnel Type Schedule Rules (Schedule Matrix by Personnel Type)
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

-- 5. Shifts Table (Supports Morning, Afternoon, Night, Double Shifts, Office, Special & Cross-Midnight)
CREATE TABLE IF NOT EXISTS shifts (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category ENUM('MORNING', 'AFTERNOON', 'NIGHT', 'MORNING_AFTERNOON', 'AFTERNOON_NIGHT', 'ALL_DAY', 'OFFICE', 'SPECIAL', 'OTHER') NOT NULL DEFAULT 'MORNING',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  cross_midnight BOOLEAN NOT NULL DEFAULT FALSE,
  grace_minutes INT NOT NULL DEFAULT 15,
  early_scan_window_minutes INT NOT NULL DEFAULT 180,
  late_scan_window_minutes INT NOT NULL DEFAULT 240,
  personnel_type_rule_id VARCHAR(36) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at TIMESTAMP NULL,
  deactivated_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shifts_category_active (category, active)
);

-- 6. Shift Assignments Matrix (Supports Multiple Shifts per Person per Day + Historical Snapshots)
CREATE TABLE IF NOT EXISTS shift_assignments (
  id VARCHAR(36) PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  shift_id VARCHAR(36) NOT NULL,
  assignment_type ENUM('DAILY', 'RECURRING', 'STANDARD_FALLBACK') NOT NULL DEFAULT 'DAILY',
  shift_name_snapshot VARCHAR(120) NULL,
  shift_start_snapshot TIME NULL,
  shift_end_snapshot TIME NULL,
  cross_midnight_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  grace_minutes_snapshot INT NOT NULL DEFAULT 15,
  shift_category_snapshot VARCHAR(30) NULL,
  status ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  cancelled_at TIMESTAMP NULL,
  cancelled_by VARCHAR(100) NULL,
  cancel_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES personnel(person_id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  UNIQUE KEY uq_person_work_shift (person_id, work_date, shift_id),
  INDEX idx_sa_work_date_status (work_date, status),
  INDEX idx_sa_person_date (person_id, work_date)
);

-- 7. Shift Cancellation History Log (Audit trail for cancelled shift assignments)
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

-- 8. Scanner Devices
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
);

-- 9. Scanner Sync Schedules
CREATE TABLE IF NOT EXISTS sync_schedules (
  id VARCHAR(36) PRIMARY KEY,
  sync_time TIME NOT NULL,
  label VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Bangkok',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Scanner Sync Runs History
CREATE TABLE IF NOT EXISTS sync_runs (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(20) NOT NULL,
  machine_no INT NOT NULL,
  mode ENUM('SCHEDULED', 'MANUAL') NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NOT NULL,
  status ENUM('SUCCESS', 'FAILED', 'PARTIAL') NOT NULL,
  total_read INT NOT NULL DEFAULT 0,
  new_scans INT NOT NULL DEFAULT 0,
  duplicate_scans INT NOT NULL DEFAULT 0,
  unmapped_scans INT NOT NULL DEFAULT 0,
  latest_event_at TIMESTAMP NULL,
  error_message TEXT NULL,
  INDEX idx_sync_runs_started (started_at),
  INDEX idx_sync_runs_machine (machine_no, started_at)
);

-- 11. Raw Scans Table (Immutable 6-field Raw Events from Scanner Reader EXE)
-- Fields: machineNo, enrollNumber, scanDateTime, verifyMode, inOutMode, workCode
CREATE TABLE IF NOT EXISTS raw_scans (
  id VARCHAR(64) PRIMARY KEY,
  machine_no INT NOT NULL,
  enroll_number INT NOT NULL,
  scan_datetime_raw VARCHAR(30) NOT NULL, -- Exact string "yyyy-MM-dd HH:mm:ss"
  scan_date DATE GENERATED ALWAYS AS (STR_TO_DATE(SUBSTRING(scan_datetime_raw, 1, 10), '%Y-%m-%d')) VIRTUAL,
  verify_mode INT NOT NULL,
  in_out_mode INT NOT NULL,
  work_code INT NULL,
  mapped_person_id VARCHAR(20) NULL,
  mapping_status ENUM('MAPPED', 'PENDING_MAPPING', 'DISPUTED_MAPPING') NOT NULL DEFAULT 'MAPPED',
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dedupe_key VARCHAR(100) NOT NULL UNIQUE, -- Composite: machine_no + '_' + enroll_number + '_' + scan_datetime_raw
  INDEX idx_raw_enroll_time (enroll_number, scan_datetime_raw),
  INDEX idx_raw_machine_time (machine_no, scan_datetime_raw),
  INDEX idx_raw_mapping_status (mapping_status, scan_datetime_raw)
);

-- 12. Attendance Table (Derived & Rebuildable from Raw Scans + Shift Assignments)
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(64) PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  shift_id VARCHAR(36) NOT NULL,
  checkin_at TIME NULL,
  checkout_at TIME NULL,
  checkin_datetime DATETIME NULL,
  checkout_datetime DATETIME NULL,
  late_minutes INT NOT NULL DEFAULT 0,
  early_checkout_minutes INT NOT NULL DEFAULT 0,
  has_missing_checkout BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('NORMAL', 'LATE', 'NO_SCAN', 'MISSING_CHECKOUT', 'EARLY_CHECKOUT', 'NO_SCHEDULE', 'PENDING_MAPPING') NOT NULL,
  evaluation_state ENUM('EVALUATED', 'IN_PROGRESS', 'FUTURE', 'AMBIGUOUS_REQUIRES_REVIEW') NOT NULL DEFAULT 'EVALUATED',
  hr_review_status ENUM('PENDING_REVIEW', 'REVIEWED', 'NOT_REQUIRED') NOT NULL DEFAULT 'NOT_REQUIRED',
  ambiguous_scan_flag BOOLEAN NOT NULL DEFAULT FALSE,
  evaluation_note VARCHAR(255) NULL,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  raw_scan_in_id VARCHAR(64) NULL,
  raw_scan_out_id VARCHAR(64) NULL,
  related_raw_scan_ids JSON NULL,
  is_pushed_to_hosoffice BOOLEAN NOT NULL DEFAULT FALSE,
  last_pushed_at TIMESTAMP NULL,
  modified_after_push BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (person_id) REFERENCES personnel(person_id),
  UNIQUE KEY uq_attendance_entry (person_id, work_date, shift_id),
  INDEX idx_att_date_status (work_date, status),
  INDEX idx_att_hr_review (work_date, hr_review_status),
  INDEX idx_att_person_date (person_id, work_date)
);

-- 13. Attendance HR Notes Table (Separated from Raw Scans; survives Reprocess)
CREATE TABLE IF NOT EXISTS attendance_notes (
  id VARCHAR(36) PRIMARY KEY,
  attendance_id VARCHAR(64) NOT NULL UNIQUE,
  reason_code ENUM(
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
  ) NOT NULL,
  reason_label VARCHAR(120) NOT NULL,
  note TEXT NULL,
  author_user_id VARCHAR(36) NOT NULL,
  author_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_id) REFERENCES attendance(id)
);

-- 14. HR Review History Table (Complete Revision Trail per Attendance Item — §7 Table #7)
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

-- 15. HOSOffice Push History Log (Separated from Attendance; tracks preview/live pushes)
CREATE TABLE IF NOT EXISTS push_history (
  id VARCHAR(36) PRIMARY KEY,
  attendance_id VARCHAR(64) NOT NULL,
  person_id VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  shift_id VARCHAR(36) NULL,
  status VARCHAR(30) NOT NULL,
  target VARCHAR(50) NOT NULL DEFAULT 'HOSOffice_Attend',
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  pushed_by VARCHAR(36) NOT NULL,
  pushed_by_name VARCHAR(100) NOT NULL,
  pushed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  response_status ENUM('SUCCESS', 'FAILED', 'DRY_RUN_PREVIEW') NOT NULL,
  response_summary TEXT NULL,
  payload_json JSON NULL,
  INDEX idx_push_history_date (work_date),
  INDEX idx_push_history_person (person_id, work_date)
);

-- 16. HOSOffice Personnel Sync Logs
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

-- 17. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  actor VARCHAR(50) NOT NULL,
  actor_name VARCHAR(120) NULL,
  actor_role VARCHAR(30) NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  summary TEXT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON NULL,
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_entity (entity_type, entity_id)
);

-- 18. Revoked Sessions Table (Persists revoked JWT jti across Backend Restarts & Multiple Processes — §9)
CREATE TABLE IF NOT EXISTS revoked_sessions (
  jti VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at_sec BIGINT NOT NULL,
  INDEX idx_revoked_user (user_id),
  INDEX idx_revoked_expires (expires_at_sec)
);

-- 19. Auth Login Rate Limits Table (Persists brute-force lockout counters across Backend Restarts & Multiple Processes — §9)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key VARCHAR(120) PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 0,
  first_failed_at_ms BIGINT NOT NULL,
  locked_until_ms BIGINT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

