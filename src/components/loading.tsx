export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent-border)", borderTopColor: "transparent" }}
        />
        <p className="text-sm animate-pulse-slow" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      </div>
    </div>
  );
}
