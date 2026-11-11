import React from 'react';
import { AttendanceStatus, UserRole } from '../../types/attendance';

interface StatusBadgeProps {
  status: AttendanceStatus;
  size?: 'sm' | 'md';
  lateMinutes?: number;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  lateMinutes,
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  switch (status) {
    case 'NORMAL':
      return (
        <span className={`inline-flex items-center font-medium rounded text-emerald-800 bg-emerald-50 border border-emerald-200/80 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5" aria-hidden="true" />
          ปกติ
        </span>
      );
    case 'LATE':
      return (
        <span className={`inline-flex items-center font-medium rounded text-amber-800 bg-amber-50 border border-amber-200/80 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mr-1.5" aria-hidden="true" />
          มาสาย{lateMinutes && lateMinutes > 0 ? ` (+${lateMinutes}น.)` : ''}
        </span>
      );
    case 'NO_SCAN':
      return (
        <span className={`inline-flex items-center font-medium rounded text-rose-800 bg-rose-50 border border-rose-200/80 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1.5" aria-hidden="true" />
          ไม่พบสแกน
        </span>
      );
    case 'MISSING_CHECKOUT':
      return (
        <span className={`inline-flex items-center font-medium rounded text-purple-800 bg-purple-50 border border-purple-200/80 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-purple-600 mr-1.5" aria-hidden="true" />
          ขาดสแกนออก
        </span>
      );
    case 'EARLY_CHECKOUT':
      return (
        <span className={`inline-flex items-center font-medium rounded text-blue-800 bg-blue-50 border border-blue-200/80 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-1.5" aria-hidden="true" />
          ออกก่อนเวลา
        </span>
      );
    case 'NO_SCHEDULE':
      return (
        <span className={`inline-flex items-center font-medium rounded text-slate-700 bg-slate-100 border border-slate-200 ${sizeClasses}`}>
          ไม่มีตารางเวร
        </span>
      );
    case 'PENDING_MAPPING':
      return (
        <span className={`inline-flex items-center font-medium rounded text-orange-800 bg-orange-50 border border-orange-200/80 ${sizeClasses}`}>
          รอยืนยันรหัสนิ้ว
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center font-medium rounded text-slate-700 bg-slate-100 ${sizeClasses}`}>
          {status}
        </span>
      );
  }
};

export const AttendanceStatusBadge = StatusBadge;

export const RoleBadge: React.FC<{ role: UserRole }> = ({ role }) => {
  if (role === 'ADMIN') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
        ADMIN
      </span>
    );
  }
  if (role === 'RESPONSIBLE_STAFF') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
        RESPONSIBLE_STAFF
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
      GENERAL_USER
    </span>
  );
};
