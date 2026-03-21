"use client";

interface DevicePillProps {
  name: string;
  onRemove?: () => void;
}

export default function DevicePill({ name, onRemove }: DevicePillProps) {
  return (
    <span className="plugin-pill border-2 border-[#2D2D2D] px-2.5 py-1 rounded-md text-[10px] font-bold hard-shadow-sm flex items-center gap-1 font-label">
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity leading-none"
        >
          ×
        </button>
      )}
    </span>
  );
}
