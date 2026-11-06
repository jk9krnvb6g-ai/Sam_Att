import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Fingerprint,
  Users,
  FileBarChart2,
  Send,
  Sliders,
  Radio,
  FileText,
  UserCheck,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  onSelectView: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onSelectView, isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const role = currentUser?.role || 'GENERAL_USER';

  // Navigation Items by Role
  const navItems = [
    {
      id: 'my-attendance',
      label: 'เวลาปฏิบัติงานของฉัน',
      icon: Clock,
      roles: ['GENERAL_USER', 'RESPONSIBLE_STAFF', 'ADMIN'],
      badge: 'ส่วนตัว',
    },
    {
      id: 'dashboard',
      label: 'แดชบอร์ดภาพรวม',
      icon: LayoutDashboard,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
    },
    {
      id: 'attendance-review',
      label: 'ตรวจบันทึกเวลา & Reprocess',
      icon: UserCheck,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
    },
    {
      id: 'raw-scans',
      label: 'ข้อมูลสแกนดิบ (Raw Scans)',
      icon: Fingerprint,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
      badge: '6 ฟิลด์',
    },
    {
      id: 'scanners',
      label: 'จัดการเครื่องสแกน (Scanners)',
      icon: Radio,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
    },
    {
      id: 'personnel',
      label: 'บุคลากร HOSOffice',
      icon: Users,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
    },
    {
      id: 'shifts',
      label: 'ตารางเวร & การหมุนเวียน',
      icon: CalendarDays,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
    },
    {
      id: 'reports',
      label: 'รายงานสรุป & อันดับสาย',
      icon: FileBarChart2,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
    },
    {
      id: 'hosoffice-push',
      label: 'ส่งข้อมูลไป HOSOffice',
      icon: Send,
      roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
      badge: 'Direct Push',
    },
    {
      id: 'settings',
      label: 'ตั้งค่าระบบ & การเชื่อมต่อ',
      icon: Sliders,
      roles: ['ADMIN'],
    },
    {
      id: 'gateway-doc',
      label: 'คู่มือเชื่อม Central Gateway',
      icon: FileText,
      roles: ['ADMIN', 'RESPONSIBLE_STAFF'],
    },
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  const handleSelect = (viewId: string) => {
    onSelectView(viewId);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Mobile Header */}
        <div className="lg:hidden p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-slate-800">เมนูนำทาง</span>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section title */}
        <div className="px-4 pt-4 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {role === 'GENERAL_USER' ? 'บริการตนเอง' : 'เมนูระบบงาน'}
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200/80 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                      isActive ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Role information box */}
        <div className="p-3 m-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          <div className="text-[11px] font-semibold text-slate-500 mb-1">สิทธิ์ปัจจุบัน:</div>
          <div className="font-medium text-slate-800">{currentUser?.fullName}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {role === 'GENERAL_USER' && '🔒 เข้าถึงเฉพาะข้อมูลตนเองเท่านั้น'}
            {role === 'RESPONSIBLE_STAFF' && '⚡ จัดการเวลา & ส่ง HOSOffice ได้'}
            {role === 'ADMIN' && '🛡️ ดูแลเครื่องสแกน & สิทธิ์ระบบ'}
          </div>
        </div>
      </aside>
    </>
  );
};
