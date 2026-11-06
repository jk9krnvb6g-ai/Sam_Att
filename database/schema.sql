-- =====================================================================
-- Sam_Att V2 — Database Schema Definition
-- Database Name: samchuk_attendance
-- Target Engine: MySQL 8.0+ / MariaDB / PostgreSQL compatible
-- Designed exclusively for Samchuk Hospital Attendance System
-- Isolated from Procurement and Cash_Cheque databases
-- =====================================================================

-- 1. Users Table (System Accounts & Role-Based Access Control)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'RESPONSIBLE_STAFF', 'GENERAL_USER') NOT NULL DEFAULT 'GENERAL_USER',
  person_id VARCHAR(20) NULL, -- Mapping to personnel.person_id for GENERAL_USER
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_person_id (person_id)
);

-- 2. Personnel Table (Authoritative source: Synchronized from HOSOffice)
CREATE TABLE IF NOT EXISTS personnel (
  person_id VARCHAR(20) PRIMARY KEY,
  fingle_id_current INT NOT NULL,
  prefix VARCHAR(20),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  position VARCHAR(150),
  department VARCHAR(100) NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  personnel_type VARCHAR(50) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_hosoffice_sync TIMESTAMP NULL,
  INDEX idx_personnel_fingle (fingle_id_current),
  INDEX idx_personnel_dept (department)
);

-- 3. Fingerprint Mappings with Effective Dates
CREATE TABLE IF NOT EXISTS fingerprint_mappings (
  id VARCHAR(36) PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  fingle_id INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status ENUM('ACTIVE', 'SUPERSEDED', 'DISPUTED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES personnel(person_id),
  INDEX idx_mapping_lookup (fingle_id, effective_from, effective_to)
);

-- 4. Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
  id VARCHAR(20) PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  cross_midnight BOOLEAN NOT NULL DEFAULT FALSE,
  grace_minutes INT NOT NULL DEFAULT 15,
  early_scan_window_minutes INT NOT NULL DEFAULT 60,
  late_scan_window_minutes INT NOT NULL DEFAULT 120,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Shift Assignments Matrix
CREATE TABLE IF NOT EXISTS shift_assignments (
  id VARCHAR(36) PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  shift_id VARCHAR(20) NOT NULL,
  assignment_type ENUM('DAILY', 'RECURRING', 'STANDARD_FALLBACK') NOT NULL DEFAULT 'DAILY',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES personnel(person_id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  UNIQUE KEY uq_person_work_shift (person_id, work_date, shift_id)
);

-- 6. Scanner Devices
CREATE TABLE IF NOT EXISTS scanner_devices (
  id VARCHAR(20) PRIMARY KEY,
  machine_no INT NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  device_port INT NOT NULL DEFAULT 4370,
  location VARCHAR(150),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('ONLINE', 'OFFLINE', 'SYNCING', 'ERROR') NOT NULL DEFAULT 'ONLINE',
  last_sync_at TIMESTAMP NULL,
  last_event_at TIMESTAMP NULL,
  last_error TEXT NULL
);

-- 7. Sync Runs Log
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
  error_message TEXT NULL
);

-- 8. Raw Scans Table (Immutable Raw Events from Scanner Reader EXE)
-- 6 exact fields: machineNo, enrollNumber, scanDateTime, verifyMode, inOutMode, workCode
CREATE TABLE IF NOT EXISTS raw_scans (
  id VARCHAR(36) PRIMARY KEY,
  machine_no INT NOT NULL,
  enroll_number INT NOT NULL,
  scan_datetime_raw VARCHAR(30) NOT NULL, -- e.g. "2026-11-06 07:45:00"
  verify_mode INT NOT NULL,
  in_out_mode INT NOT NULL,
  work_code INT NULL,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dedupe_key VARCHAR(100) NOT NULL UNIQUE, -- Composite: machine_no + '_' + enroll_number + '_' + scan_datetime_raw
  INDEX idx_raw_enroll_time (enroll_number, scan_datetime_raw)
);

-- 9. Attendance Table (Derived / Rebuildable from Raw Scans + Shifts)
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(36) PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  shift_id VARCHAR(20) NOT NULL,
  checkin_at TIME NULL,
  checkout_at TIME NULL,
  late_minutes INT NOT NULL DEFAULT 0,
  status ENUM('NORMAL', 'LATE', 'NO_SCAN', 'MISSING_CHECKOUT', 'EARLY_CHECKOUT', 'NO_SCHEDULE', 'PENDING_MAPPING') NOT NULL,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  raw_scan_in_id VARCHAR(36) NULL,
  raw_scan_out_id VARCHAR(36) NULL,
  is_pushed_to_hosoffice BOOLEAN NOT NULL DEFAULT FALSE,
  last_pushed_at TIMESTAMP NULL,
  modified_after_push BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (person_id) REFERENCES personnel(person_id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  UNIQUE KEY uq_attendance_entry (person_id, work_date, shift_id),
  INDEX idx_att_date_status (work_date, status)
);

-- 10. Attendance Notes Table (Reasons for NO_SCAN, etc.)
CREATE TABLE IF NOT EXISTS attendance_notes (
  id VARCHAR(36) PRIMARY KEY,
  attendance_id VARCHAR(36) NOT NULL UNIQUE,
  reason_code ENUM('SICK_LEAVE', 'BUSINESS_LEAVE', 'VACATION_LEAVE', 'OFFICIAL_DUTY', 'TRAINING', 'DAY_OFF', 'OTHER') NOT NULL,
  reason_label VARCHAR(100) NOT NULL,
  note TEXT,
  author_user_id VARCHAR(36) NOT NULL,
  author_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_id) REFERENCES attendance(id)
);

-- 11. Push History Log (Direct manual push audit trail)
CREATE TABLE IF NOT EXISTS push_history (
  id VARCHAR(36) PRIMARY KEY,
  attendance_id VARCHAR(36) NOT NULL,
  person_id VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL,
  target VARCHAR(50) NOT NULL DEFAULT 'HOSOffice_Attend',
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  pushed_by VARCHAR(36) NOT NULL,
  pushed_by_name VARCHAR(100) NOT NULL,
  pushed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  response_status ENUM('SUCCESS', 'FAILED') NOT NULL,
  response_summary TEXT,
  INDEX idx_push_history_date (work_date)
);

-- 12. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  actor VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON NULL
);
