const toolbarBase =
  "border border-[#d8cbb8] bg-[#fff7ea] text-slate-700 hover:bg-[#fcedd8] disabled:cursor-not-allowed disabled:opacity-50";

export const toolbarIconButtonClass =
  `flex h-10 w-10 items-center justify-center rounded-full text-xl ${toolbarBase}`;

export const toolbarPillButtonClass =
  `min-h-[40px] rounded-full px-3 text-sm font-semibold ${toolbarBase}`;

export function toolbarFilterButtonClass(active: boolean): string {
  return active
    ? "min-h-[40px] rounded-full border border-teal-200 bg-teal-100 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-200"
    : toolbarPillButtonClass;
}
