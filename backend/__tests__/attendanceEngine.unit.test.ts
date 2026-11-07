/**
 * Sam_Att V2 — Phase 1 Unit Tests (§5)
 * Tests Attendance Calculation Engine & Raw Scan Processor across all 18 mandatory scenarios:
 *
 * 1. สแกนปกติ (Normal on-time check-in and check-out)
 * 2. มาสายเกิน Grace (Late check-in exceeding Grace Period)
 * 3. เข้าภายใน Grace (Check-in within Grace Period -> NORMAL, lateMinutes = 0)
 * 4. สแกนเข้าแต่ไม่สแกนออก (MISSING_CHECKOUT after shift ended)
 * 5. NO_SCAN (Assigned shift ended with 0 scans)
 * 6. สแกนหลายครั้งในกะเดียวกัน (Multiple taps/bounces in the same shift)
 * 7. หลายกะในวันเดียวกัน (Multiple shifts on the same day, including touching boundary)
 * 8. กะข้ามเที่ยงคืน (Cross-midnight shift e.g. 23:30-07:30 or 16:00-08:00)
 * 9. กะควบ (Double shifts: เช้า–บ่าย 08:00-24:00, บ่าย–ดึก 16:00-08:00, ทั้งวัน 24 ชม.)
 * 10. Raw Scan ซ้ำ (Exact event deduplication by machineNo_enrollNumber_scanDateTime vs same-day multi-scans)
 * 11. FINGLE_ID ไม่พบ Mapping (PENDING_MAPPING preserved without fake person)
 * 12. NO_SCHEDULE (Mapped scan on a day with no assigned shift)
 * 13. กะยังไม่สิ้นสุด (In-progress shift with check-in is NOT marked MISSING_CHECKOUT)
 * 14. กะในอนาคต (Future shift is NOT marked NO_SCAN)
 * 15. Reprocess ซ้ำ (Idempotent — running Reprocess multiple times creates 0 duplicates)
 * 16. หมายเหตุ HR ยังคงอยู่ (HR Notes & Review History preserved across Reprocess; abnormal status NOT turned into NORMAL)
 * 17. สแกนของวันถัดไปที่เกี่ยวข้องกับกะวันก่อน (Next-day morning scan paired to previous night shift, not orphaned)
 * 18. กรณีเวลาเข้าออกไม่สามารถระบุได้แน่นอน (Ambiguous mid-shift/checkout-only scan flagged PENDING_REVIEW instead of guessing)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScannerAdapter } from '../services/scannerAdapter';
import { AttendanceCalculator } from '../services/attendanceCalculator';
import {
  EnginePersonnel,
  EngineShiftAssignment,
  EngineShiftConfig,
  RawScanDto,
} from '../types';

const TEST_PERSONNEL: EnginePersonnel[] = [
  {
    personId: 'P001',
    fingleId: 101,
    prefix: 'นางสาว',
    firstName: 'กานดา',
    lastName: 'สุขใจ',
    position: 'พยาบาลวิชาชีพชำนาญการ',
    department: 'งานผู้ป่วยใน (IPD)',
    groupName: 'กลุ่มภารกิจด้านการพยาบาล',
    personnelType: 'ข้าราชการ',
    active: true,
  },
  {
    personId: 'P002',
    fingleId: 102,
    prefix: 'นาย',
    firstName: 'สมชาย',
    lastName: 'สายเสมอ',
    position: 'เจ้าพนักงานเวชสถิติ',
    department: 'งานเวชระเบียน',
    groupName: 'กลุ่มงานบริหารทั่วไป',
    personnelType: 'พนักงานกระทรวงสาธารณสุข',
    active: true,
  },
];

const TEST_SHIFTS: EngineShiftConfig[] = [
  {
    id: 'SH_MORNING',
    code: 'M01',
    name: 'กะเช้า (Morning)',
    category: 'MORNING',
    startTime: '08:00',
    endTime: '16:00',
    crossMidnight: false,
    graceMinutes: 15,
    earlyScanWindowMinutes: 120,
    lateScanWindowMinutes: 180,
    active: true,
  },
  {
    id: 'SH_AFTERNOON',
    code: 'A01',
    name: 'กะบ่าย (Afternoon)',
    category: 'AFTERNOON',
    startTime: '16:00',
    endTime: '24:00',
    crossMidnight: false,
    graceMinutes: 15,
    earlyScanWindowMinutes: 120,
    lateScanWindowMinutes: 180,
    active: true,
  },
  {
    id: 'SH_NIGHT_CROSS',
    code: 'N01',
    name: 'กะดึกข้ามเที่ยงคืน (Night Cross-Midnight)',
    category: 'NIGHT',
    startTime: '23:30',
    endTime: '07:30',
    crossMidnight: true,
    graceMinutes: 15,
    earlyScanWindowMinutes: 120,
    lateScanWindowMinutes: 180,
    active: true,
  },
  {
    id: 'SH_DOUBLE_MA',
    code: 'MA01',
    name: 'กะควบเช้า–บ่าย (Morning-Afternoon)',
    category: 'MORNING_AFTERNOON',
    startTime: '08:00',
    endTime: '24:00',
    crossMidnight: false,
    graceMinutes: 15,
    earlyScanWindowMinutes: 120,
    lateScanWindowMinutes: 180,
    active: true,
  },
  {
    id: 'SH_DOUBLE_AN',
    code: 'AN01',
    name: 'กะควบบ่าย–ดึก (Afternoon-Night)',
    category: 'AFTERNOON_NIGHT',
    startTime: '16:00',
    endTime: '08:00',
    crossMidnight: true,
    graceMinutes: 15,
    earlyScanWindowMinutes: 120,
    lateScanWindowMinutes: 180,
    active: true,
  },
  {
    id: 'SH_ALL_DAY',
    code: 'AD01',
    name: 'กะทั้งวัน 24 ชม. (All-Day)',
    category: 'ALL_DAY',
    startTime: '08:00',
    endTime: '08:00',
    crossMidnight: true,
    graceMinutes: 15,
    earlyScanWindowMinutes: 120,
    lateScanWindowMinutes: 180,
    active: true,
  },
];

describe('Sam_Att V2 Phase 1 — Attendance Engine & Raw Scan Unit Tests (§5)', () => {
  it('Test 1: สแกนปกติ (Normal on-time check-in and check-out)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA1', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:50:12', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:05:30', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    assert.equal(res.records.length, 1);
    const rec = res.records[0];
    assert.equal(rec.status, 'NORMAL');
    assert.equal(rec.lateMinutes, 0);
    assert.equal(rec.checkInAt, '07:50:12');
    assert.equal(rec.checkOutAt, '16:05:30');
    assert.equal(rec.hasMissingCheckout, false);
    assert.equal(rec.hrReviewStatus, 'NOT_REQUIRED');
  });

  it('Test 2: มาสายเกิน Grace (Late check-in exceeding Grace Period)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA2', personId: 'P002', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    // Shift starts 08:00 + 15 min grace = 08:15 cutoff. Scan at 08:28:45 -> 13 minutes late.
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 102, scanDateTime: '2026-11-06 08:28:45', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 102, scanDateTime: '2026-11-06 16:10:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const rec = res.records[0];
    assert.equal(rec.status, 'LATE');
    assert.equal(rec.lateMinutes, 13);
    assert.equal(rec.hasMissingCheckout, false);
    assert.equal(rec.hrReviewStatus, 'PENDING_REVIEW');
  });

  it('Test 3: เข้าภายใน Grace (Check-in within Grace Period -> NORMAL, lateMinutes = 0)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA3', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    // Shift starts 08:00 + 15 min grace = 08:15 cutoff. Scan at 08:15:00 -> on time!
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 08:15:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:02:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const rec = res.records[0];
    assert.equal(rec.status, 'NORMAL');
    assert.equal(rec.lateMinutes, 0);
  });

  it('Test 4: สแกนเข้าแต่ไม่สแกนออก (MISSING_CHECKOUT after shift has ended)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA4', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:55:00', verifyMode: 1, inOutMode: 1, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00', // After 16:00 shift end
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const rec = res.records[0];
    assert.equal(rec.status, 'MISSING_CHECKOUT');
    assert.equal(rec.hasMissingCheckout, true);
    assert.equal(rec.checkInAt, '07:55:00');
    assert.equal(rec.checkOutAt, null);
    assert.equal(rec.hrReviewStatus, 'PENDING_REVIEW');
  });

  it('Test 5: NO_SCAN (Shift ended with zero raw scans)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA5', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans: [],
    });

    const rec = res.records[0];
    assert.equal(rec.status, 'NO_SCAN');
    assert.equal(rec.checkInAt, null);
    assert.equal(rec.checkOutAt, null);
    assert.equal(rec.hrReviewStatus, 'PENDING_REVIEW');
  });

  it('Test 6: สแกนหลายครั้งในกะเดียวกัน (Multiple bounce scans preserved, earliest in & latest out paired)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA6', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    // Scanned twice in the morning (07:45:10 and 07:46:02) and twice in the afternoon (16:01:10 and 16:03:45)
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:45:10', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:46:02', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:01:10', verifyMode: 1, inOutMode: 2, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:03:45', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const rec = res.records[0];
    assert.equal(rec.status, 'NORMAL');
    assert.equal(rec.checkInAt, '07:45:10');
    assert.equal(rec.checkOutAt, '16:03:45');
    assert.equal(rec.relatedRawScanIds.length, 4);
  });

  it('Test 7: หลายกะในวันเดียวกัน (Multiple shifts on same day with touching boundary 08:00-16:00 & 16:00-24:00)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA7_1', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
      { id: 'SA7_2', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_AFTERNOON', assignmentType: 'DAILY' },
    ];

    // Validate that touching boundaries (16:00 == 16:00) are valid and do NOT overlap
    const overlapCheck = AttendanceCalculator.validateNonOverlappingAssignments([
      { assignment: assignments[0], shift: TEST_SHIFTS[0] },
      { assignment: assignments[1], shift: TEST_SHIFTS[1] },
    ]);
    assert.equal(overlapCheck.valid, true);

    // 4 distinct scans: Morning In (07:50), Morning Out (16:00:15), Afternoon In (16:02:10), Afternoon Out (23:58:00)
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:50:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:00:15', verifyMode: 1, inOutMode: 2, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:02:10', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 23:58:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-07 01:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    assert.equal(res.records.length, 2);
    const morningRec = res.records.find((r) => r.shiftId === 'SH_MORNING')!;
    const afternoonRec = res.records.find((r) => r.shiftId === 'SH_AFTERNOON')!;

    assert.equal(morningRec.status, 'NORMAL');
    assert.equal(morningRec.checkInAt, '07:50:00');
    assert.equal(morningRec.checkOutAt, '16:00:15');

    assert.equal(afternoonRec.status, 'NORMAL');
    assert.equal(afternoonRec.checkInAt, '16:02:10');
    assert.equal(afternoonRec.checkOutAt, '23:58:00');
    assert.notEqual(morningRec.rawScanOutId, afternoonRec.rawScanInId);
  });

  it('Test 8: กะข้ามเที่ยงคืน (Cross-midnight shift 23:30 - 07:30 next day)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA8', personId: 'P001', workDate: '2026-11-05', shiftId: 'SH_NIGHT_CROSS', assignmentType: 'DAILY' },
    ];
    const rawScans: RawScanDto[] = [
      { machineNo: 2, enrollNumber: 101, scanDateTime: '2026-11-05 23:25:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 2, enrollNumber: 101, scanDateTime: '2026-11-06 07:35:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-05',
      toDate: '2026-11-05',
      referenceDateTime: '2026-11-06 12:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    assert.equal(res.records.length, 1);
    const rec = res.records[0];
    assert.equal(rec.status, 'NORMAL');
    assert.equal(rec.crossMidnight, true);
    assert.equal(rec.checkInDateTime, '2026-11-05 23:25:00');
    assert.equal(rec.checkOutDateTime, '2026-11-06 07:35:00');
  });

  it('Test 9: กะควบ (Double shifts: เช้า–บ่าย 08:00-24:00, บ่าย–ดึก 16:00-08:00, กะทั้งวัน 24 ชม.)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA9_1', personId: 'P001', workDate: '2026-11-04', shiftId: 'SH_DOUBLE_MA', assignmentType: 'DAILY' },
      { id: 'SA9_2', personId: 'P001', workDate: '2026-11-05', shiftId: 'SH_DOUBLE_AN', assignmentType: 'DAILY' },
      { id: 'SA9_3', personId: 'P002', workDate: '2026-11-05', shiftId: 'SH_ALL_DAY', assignmentType: 'DAILY' },
    ];
    const rawScans: RawScanDto[] = [
      // P001 Morning-Afternoon on Nov 4 (08:00 - 24:00)
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-04 07:55:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-04 23:59:10', verifyMode: 1, inOutMode: 2, workCode: null },
      // P001 Afternoon-Night on Nov 5 (16:00 - 08:00 Nov 6)
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-05 15:52:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 08:04:00', verifyMode: 1, inOutMode: 2, workCode: null },
      // P002 All-Day 24h on Nov 5 (08:00 Nov 5 - 08:00 Nov 6)
      { machineNo: 1, enrollNumber: 102, scanDateTime: '2026-11-05 07:58:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 102, scanDateTime: '2026-11-06 08:02:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-04',
      toDate: '2026-11-05',
      referenceDateTime: '2026-11-06 12:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    assert.equal(res.records.length, 3);
    assert.ok(res.records.every((r) => r.status === 'NORMAL'));
  });

  it('Test 10: Raw Scan ซ้ำ (Deduplicates exact identical event, keeps different timestamps on same day)', () => {
    const incoming: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:45:10', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:45:10', verifyMode: 1, inOutMode: 1, workCode: null }, // Exact duplicate
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:46:02', verifyMode: 1, inOutMode: 1, workCode: null }, // Distinct timestamp
    ];

    const summary = ScannerAdapter.ingestAndDeduplicateScans({
      incomingScans: incoming,
      existingDedupeKeys: new Set(),
      personnel: TEST_PERSONNEL,
    });

    assert.equal(summary.totalRead, 3);
    assert.equal(summary.newScansCount, 2);
    assert.equal(summary.duplicateScansCount, 1);
    assert.equal(summary.newEvents.length, 2);
  });

  it('Test 11: FINGLE_ID ไม่พบ Mapping (Preserves Raw Scan with PENDING_MAPPING without fake person)', () => {
    const incoming: RawScanDto[] = [
      { machineNo: 2, enrollNumber: 999, scanDateTime: '2026-11-06 08:10:00', verifyMode: 1, inOutMode: 1, workCode: null },
    ];

    const summary = ScannerAdapter.ingestAndDeduplicateScans({
      incomingScans: incoming,
      existingDedupeKeys: new Set(),
      personnel: TEST_PERSONNEL,
    });

    assert.equal(summary.newScansCount, 1);
    assert.equal(summary.unmappedScansCount, 1);
    assert.equal(summary.newEvents[0].mappingStatus, 'PENDING_MAPPING');
    assert.equal(summary.newEvents[0].mappedPersonId, null);
  });

  it('Test 12: NO_SCHEDULE (Person has mapped scan on a date with no shift assignment)', () => {
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 08:00:00', verifyMode: 1, inOutMode: 1, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments: [], // No shift assigned
      rawScans,
    });

    assert.equal(res.noScheduleCount, 1);
    assert.equal(res.noScheduleRecords[0].status, 'NO_SCHEDULE');
    assert.equal(res.noScheduleRecords[0].personId, 'P001');
  });

  it('Test 13: กะยังไม่สิ้นสุด (Shift in progress is NOT marked MISSING_CHECKOUT)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA13', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:55:00', verifyMode: 1, inOutMode: 1, workCode: null },
    ];

    // Evaluated at 11:00:00 while Morning shift (08:00-16:00) is still in progress
    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 11:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const rec = res.records[0];
    assert.equal(rec.evaluationState, 'IN_PROGRESS');
    assert.equal(rec.status, 'NORMAL');
    assert.equal(rec.hasMissingCheckout, false);
    assert.equal(rec.hrReviewStatus, 'NOT_REQUIRED');
  });

  it('Test 14: กะในอนาคต (Future shift is skipped and NOT marked NO_SCAN)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA14', personId: 'P001', workDate: '2026-11-07', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];

    // Evaluated on 2026-11-06 12:00:00
    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-07',
      referenceDateTime: '2026-11-06 12:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans: [],
    });

    assert.equal(res.records.length, 0);
    assert.equal(res.skippedCount, 1);
    assert.ok(res.skippedReasons[0].reason.includes('กะในอนาคต'));
  });

  it('Test 15: Reprocess ซ้ำ (Idempotent — running Reprocess multiple times produces 0 duplicates and 0 changes on second run)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA15', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:50:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:05:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const firstRun = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const secondRun = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
      existingAttendance: firstRun.records,
    });

    assert.equal(secondRun.records.length, 1);
    assert.equal(secondRun.updatedCount, 0);
    assert.equal(secondRun.unchangedCount, 1);
    assert.equal(secondRun.records[0].id, firstRun.records[0].id);
  });

  it('Test 16: หมายเหตุ HR ยังคงอยู่ (HR Notes & Review History preserved across Reprocess; abnormal status NOT turned into NORMAL)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA16', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];

    // First run -> NO_SCAN
    const firstRun = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans: [],
    });

    // Simulate HR Officer recording a note and setting hrReviewStatus = 'REVIEWED'
    const reviewedRecord = {
      ...firstRun.records[0],
      hrReviewStatus: 'REVIEWED' as const,
      notes: {
        id: 'NOTE_1',
        attendanceId: firstRun.records[0].id,
        reasonCode: 'OFFICIAL_DUTY',
        reasonLabel: 'ไปราชการ',
        note: 'อบรมวิชาการ สสจ.สุพรรณบุรี',
        authorUserId: 'USR002',
        authorName: 'นางสาวพัชรี เจริญผล',
        createdAt: '2026-11-06 18:10:00',
        updatedAt: '2026-11-06 18:10:00',
      },
      noteHistory: [
        {
          id: 'NH_1',
          attendanceId: firstRun.records[0].id,
          reasonCode: 'OFFICIAL_DUTY',
          reasonLabel: 'ไปราชการ',
          note: 'อบรมวิชาการ สสจ.สุพรรณบุรี',
          hrReviewStatus: 'REVIEWED' as const,
          authorUserId: 'USR002',
          authorName: 'นางสาวพัชรี เจริญผล',
          timestamp: '2026-11-06 18:10:00',
        },
      ],
    };

    // Reprocess again
    const secondRun = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 19:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans: [],
      existingAttendance: [reviewedRecord],
    });

    const rec = secondRun.records[0];
    // Status MUST remain NO_SCAN (never turned into NORMAL just because of HR note!)
    assert.equal(rec.status, 'NO_SCAN');
    // HR Review status, notes, and noteHistory MUST be preserved
    assert.equal(rec.hrReviewStatus, 'REVIEWED');
    assert.equal(rec.notes?.reasonCode, 'OFFICIAL_DUTY');
    assert.equal(rec.noteHistory?.length, 1);
  });

  it('Test 17: สแกนของวันถัดไปที่เกี่ยวข้องกับกะวันก่อน (Next-day morning scan paired to previous night shift, not orphaned as NO_SCHEDULE)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA17', personId: 'P001', workDate: '2026-11-05', shiftId: 'SH_DOUBLE_AN', assignmentType: 'DAILY' },
    ];
    // Shift is 2026-11-05 16:00 -> 2026-11-06 08:00
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-05 15:50:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 08:05:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-05',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 12:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    // Should produce 1 NORMAL shift record on 2026-11-05 and 0 NO_SCHEDULE records on 2026-11-06!
    assert.equal(res.records.length, 1);
    assert.equal(res.noScheduleCount, 0);
    assert.equal(res.records[0].workDate, '2026-11-05');
    assert.equal(res.records[0].checkOutDateTime, '2026-11-06 08:05:00');
  });

  it('Test 18: กรณีเวลาเข้าออกไม่สามารถระบุได้แน่นอน (Single ambiguous mid-shift scan flagged PENDING_REVIEW instead of guessing)', () => {
    const assignments: EngineShiftAssignment[] = [
      { id: 'SA18', personId: 'P001', workDate: '2026-11-06', shiftId: 'SH_MORNING', assignmentType: 'DAILY' },
    ];
    // Morning shift 08:00-16:00, only a single scan at 12:30:00 right in the middle of the day
    const rawScans: RawScanDto[] = [
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 12:30:00', verifyMode: 1, inOutMode: 1, workCode: null },
    ];

    const res = AttendanceCalculator.evaluateAndReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
      personnel: TEST_PERSONNEL,
      shifts: TEST_SHIFTS,
      assignments,
      rawScans,
    });

    const rec = res.records[0];
    assert.equal(rec.ambiguousScanFlag, true);
    assert.equal(rec.evaluationState, 'AMBIGUOUS_REQUIRES_REVIEW');
    assert.equal(rec.hrReviewStatus, 'PENDING_REVIEW');
    assert.equal(rec.checkInAt, null);
    assert.equal(rec.relatedRawScanIds.length, 1);
  });
});
