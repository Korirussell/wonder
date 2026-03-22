interface AppFooterProps {
  leftLabel: string;
  rightLabel?: string;
}

export default function AppFooter({ leftLabel, rightLabel = "Ableton Live 12 // localhost:9877" }: AppFooterProps) {
  return (
    <footer className="flex-shrink-0 border-t-2 border-[#2D2D2D] bg-[#FDFDFB] px-8 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 bg-[#C1E1C1] border border-[#2D2D2D] rounded-full" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
          {leftLabel}
        </span>
      </div>
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-30">
        {rightLabel}
      </span>
    </footer>
  );
}
