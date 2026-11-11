import React, { useState } from 'react';
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
  UserCheck,
  Server,
  Rocket,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export type NavItemKey =
  | 'dashboard'
  | 'my-attendance'
  | 'hr-attendance'
  | 'hr-reports'
  | 'attendance-review'
  | 'personnel'
  | 'shifts'
  | 'scanners'
  | 'raw-scans'
  | 'hosoffice-push'
  | 'reports'
  | 'system-logs'
  | 'settings'
  | 'deployment-center';

interface SidebarProps {
  activeKey?: NavItemKey;
  onSelect?: (view: NavItemKey) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  activeView?: string;
  onSelectView?: (view: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  id: NavItemKey;
  label: string;
  subLabel?: string;
  icon: React.ElementType;
  roles: string[];
  badge?: string;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const activeView = (props.activeKey || props.activeView || 'dashboard') as NavItemKey;
  const isOpen = Boolean(props.mobileOpen ?? props.isOpen);
  const handleClose = () => {
    props.onCloseMobile?.();
    props.onClose?.();
  };
  const handleSelectView = (view: NavItemKey) => {
    props.onSelect?.(view);
    props.onSelectView?.(view);
  };

  const { currentUser } = useAuth();
  const role = currentUser?.role || 'GENERAL_USER';

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    group_dashboard: true,
    group_hr: true,
    group_scanners: true,
    group_system: true,
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const navGroups: NavGroup[] = [
    {
      id: 'group_dashboard',
      title: 'Dashboard',
      items: [
        {
          id: 'dashboard',
          label: 'แดชบอร์ดภาพรวม',
          subLabel: 'Attendance Overview',
          icon: LayoutDashboard,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
        },
        {
          id: 'my-attendance',
          label: 'เวลาปฏิบัติงานของฉัน',
          subLabel: 'My Attendance',
          icon: Clock,
          roles: ['GENERAL_USER', 'RESPONSIBLE_STAFF', 'ADMIN'],
          badge: 'ส่วนตัว',
        },
      ],
    },
    {
      id: 'group_hr',
      title: 'งานบุคลากรและการลงเวลา',
      items: [
        {
          id: 'hr-attendance',
          label: 'จัดการ HR และรายงานการลงเวลา',
          subLabel: 'HR Attendance & Reports',
          icon: FileBarChart2,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
          badge: 'HR & รายงาน',
        },
        {
          id: 'attendance-review',
          label: 'ตรวจสอบเวลาและการทำงาน',
          subLabel: 'Attendance Review & Reprocess',
          icon: UserCheck,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
        },
        {
          id: 'personnel',
          label: 'รายชื่อบุคลากร HOSOffice',
          subLabel: 'Personnel Roster',
          icon: Users,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
        },
        {
          id: 'shifts',
          label: 'ตารางกะและการหมุนเวียน',
          subLabel: 'Shift Management',
          icon: CalendarDays,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
        },
      ],
    },
    {
      id: 'group_scanners',
      title: 'เครื่องสแกนและข้อมูลดิบ',
      items: [
        {
          id: 'scanners',
          label: 'เครื่องสแกนและการดึงข้อมูล',
          subLabel: 'Scanner Devices',
          icon: Radio,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
        },
        {
          id: 'raw-scans',
          label: 'ข้อมูลสแกนดิบและรอบการ Sync',
          subLabel: 'Raw Scans & Sync Runs',
          icon: Fingerprint,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
          badge: '6 ฟิลด์',
        },
      ],
    },
    {
      id: 'group_system',
      title: 'ระบบและการตั้งค่า',
      items: [
        {
          id: 'hosoffice-push',
          label: 'ส่งข้อมูลไป HOSOffice',
          subLabel: 'HOSOffice Direct Push',
          icon: Send,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
          badge: 'Direct Push',
        },
        {
          id: 'system-logs',
          label: 'ระบบ & ประวัติการทำงาน',
          subLabel: 'System & Logs',
          icon: Server,
          roles: ['RESPONSIBLE_STAFF', 'ADMIN'],
        },
        {
          id: 'settings',
          label: 'ตั้งค่าระบบและผู้ใช้งาน',
          subLabel: 'Users & Settings',
          icon: Sliders,
          roles: ['ADMIN'],
          badge: 'ADMIN',
        },
        {
          id: 'deployment-center',
          label: 'Deployment Center',
          subLabel: 'ศูนย์ควบคุมการอัปเดต GitHub',
          icon: Rocket,
          roles: ['ADMIN'],
          badge: 'ADMIN',
        },
      ],
    },
  ];

  const handleSelect = (viewId: NavItemKey) => {
    handleSelectView(viewId);
    if (window.innerWidth < 1024) {
      handleClose();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={handleClose}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-68 bg-white border-r border-[#E9E5F2] flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="lg:hidden p-4 border-b border-[#E9E5F2] flex items-center justify-between">
          <span className="font-bold text-slate-800">เมนูนำทาง Sam_Att V2</span>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-2.5 overflow-y-auto">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.roles.includes(role));
            if (visibleItems.length === 0) return null;

            const isExpanded = openGroups[group.id] ?? true;
            const hasActiveChild = visibleItems.some((i) => i.id === activeView);

            return (
              <div
                key={group.id}
                className="rounded-xl border border-[#E9E5F2]/80 bg-[#F8F7FC]/60 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold tracking-wide transition-colors cursor-pointer ${
                    hasActiveChild
                      ? 'text-violet-800 bg-violet-100/60'
                      : 'text-slate-600 hover:text-violet-700 hover:bg-violet-50/50'
                  }`}
                >
                  <span>{group.title}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="p-1.5 space-y-1 bg-white">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-all cursor-pointer text-left ${
                            isActive
                              ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white font-semibold shadow-xs'
                              : 'text-slate-700 hover:bg-violet-50/80 hover:text-violet-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-white' : 'text-violet-500'
                              }`}
                            />
                            <div className="truncate">
                              <div className="truncate leading-tight">{item.label}</div>
                              {item.subLabel && (
                                <div
                                  className={`text-[10px] truncate mt-0.5 ${
                                    isActive ? 'text-violet-100' : 'text-slate-400'
                                  }`}
                                >
                                  {item.subLabel}
                                </div>
                              )}
                            </div>
                          </div>

                          {item.badge && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ml-1 ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-violet-50 text-violet-700 border border-violet-200/70'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3 m-3 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl text-xs text-slate-600">
          <div className="text-[11px] font-bold text-violet-700 mb-0.5">สิทธิ์ผู้ใช้งานปัจจุบัน:</div>
          <div className="font-bold text-slate-900 truncate">{currentUser?.fullName}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {role === 'GENERAL_USER' && 'เข้าถึงเฉพาะข้อมูลเวลาของตนเองเท่านั้น'}
            {role === 'RESPONSIBLE_STAFF' && 'จัดการเวลา รายงาน HR และส่ง HOSOffice ได้'}
            {role === 'ADMIN' && 'ดูแลเครื่องสแกน ฐานข้อมูล และสิทธิ์ระบบทั้งหมด'}
          </div>
        </div>
      </aside>
    </>
  );
};
