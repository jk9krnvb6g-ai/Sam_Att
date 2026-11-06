import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

export type PageSizeOption = 10 | 50 | 100 | 'ALL';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortKey: string;
  currentSortDir?: 'ASC' | 'DESC';
  currentSortDirection?: 'ASC' | 'DESC';
  onSort: (key: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  currentSortDirection,
  onSort,
  align = 'left',
  className = '',
}) => {
  const isActive = currentSortKey === sortKey;
  const resolvedDir = currentSortDir ?? currentSortDirection ?? 'ASC';

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-2.5 px-3 font-semibold select-none cursor-pointer hover:bg-violet-50/70 transition-colors ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      <div
        className={`inline-flex items-center gap-1 ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        <span className={isActive ? 'text-violet-800 font-bold' : 'text-slate-600'}>{label}</span>
        {isActive ? (
          resolvedDir === 'ASC' ? (
            <ArrowUp className="w-3 h-3 text-violet-600 shrink-0" />
          ) : (
            <ArrowDown className="w-3 h-3 text-violet-600 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-300 shrink-0" />
        )}
      </div>
    </th>
  );
};

interface TablePaginationBarProps {
  totalItems: number;
  currentPage: number;
  pageSize: PageSizeOption;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSizeOption) => void;
  extraControls?: React.ReactNode;
}

export const TablePaginationBar: React.FC<TablePaginationBarProps> = ({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  extraControls,
}) => {
  const numericPageSize = pageSize === 'ALL' ? Math.max(1, totalItems) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / numericPageSize));
  const safePage = Math.min(currentPage, totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * numericPageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(totalItems, safePage * numericPageSize);

  const pageOptions: { label: string; value: PageSizeOption }[] = [
    { label: '10', value: 10 },
    { label: '50', value: 50 },
    { label: '100', value: 100 },
    { label: 'ทั้งหมด', value: 'ALL' },
  ];

  return (
    <div className="px-4 py-3 bg-white border-t border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* Left: Page Size Selector (Matches Reference Image 1 Footer) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500 font-medium">แสดง:</span>
        <div className="inline-flex items-center bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg p-0.5">
          {pageOptions.map((opt) => {
            const active = pageSize === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onPageSizeChange(opt.value);
                  onPageChange(1);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-violet-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-violet-700 hover:bg-violet-50/60'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="text-slate-500">แถว / หน้า</span>

        {extraControls && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            {extraControls}
          </>
        )}
      </div>

      {/* Right: Item Range & Page Navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-slate-600 font-mono-data">
          แสดง <strong className="text-slate-900">{startItem}</strong> ถึง{' '}
          <strong className="text-slate-900">{endItem}</strong> จากทั้งหมด{' '}
          <strong className="text-violet-700">{totalItems}</strong> รายการ
        </span>

        {pageSize !== 'ALL' && totalPages > 1 && (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              className="p-1.5 rounded-lg border border-[#E9E5F2] bg-white hover:bg-violet-50 disabled:opacity-40 disabled:pointer-events-none text-slate-700 cursor-pointer"
              title="หน้าก่อนหน้า"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2.5 py-1 text-xs font-mono-data font-semibold text-slate-700">
              หน้า {safePage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              className="p-1.5 rounded-lg border border-[#E9E5F2] bg-white hover:bg-violet-50 disabled:opacity-40 disabled:pointer-events-none text-slate-700 cursor-pointer"
              title="หน้าถัดไป"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
