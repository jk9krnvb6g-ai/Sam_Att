import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SharedModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badgeText?: string;
  maxWidthClass?: string;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const SharedModal: React.FC<SharedModalProps> = ({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  badgeText,
  maxWidthClass,
  maxWidth,
  children,
  footer,
}) => {
  const isModalOpen = open ?? isOpen ?? false;
  const resolvedMaxWidth = maxWidthClass || maxWidth || 'max-w-4xl';

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, onClose]);

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white border border-[#E9E5F2] w-full ${resolvedMaxWidth} max-h-[92vh] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#F8F7FC] to-white border-b border-[#E9E5F2] flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
              {badgeText && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200">
                  {badgeText}
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-violet-50 transition-colors cursor-pointer"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">{children}</div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[#F8F7FC] border-t border-[#E9E5F2] flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400">
            กดปุ่ม Esc หรือคลิกพื้นที่ด้านนอกเพื่อปิดหน้าต่าง
          </span>
          <div className="flex items-center gap-2">
            {footer}
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-[#E9E5F2] rounded-xl transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
