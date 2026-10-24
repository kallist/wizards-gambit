/** A single cup coaster with two earned appearances, not a new inventory. */
export function JourneyKeepsake({ ribbon }: { ribbon: boolean }) {
  return (
    <svg
      viewBox="0 0 64 48"
      width="64"
      height="48"
      aria-label={ribbon ? "系着绿缎带的星纹杯垫" : "留有茶杯温痕的星纹杯垫"}
      role="img"
      shapeRendering="crispEdges"
    >
      <path fill="#302d22" d="M4 14h4V8h48v6h4v24h-4v6H8v-6H4z" />
      <path fill="#b29b63" d="M8 14h4v-2h40v2h4v20h-4v4H12v-4H8z" />
      <path fill="#385a49" d="M12 16h40v16h-4v2H16v-2h-4z" />
      <path
        fill="none"
        stroke="#d2bd85"
        strokeWidth="2"
        d="M23 17h18v2h4v10h-4v2H23v-2h-4V19h4z"
        opacity=".8"
      />
      <path fill="#ecdbad" d="M30 18h4v4h4v4h-4v4h-4v-4h-4v-4h4z" />
      {ribbon && (
        <path
          fill="#7b9a6b"
          d="M44 8h6v28h4v10l-7-4-7 4V36h4zM40 5h8v8h-8zM50 5h8v8h-8z"
        />
      )}
    </svg>
  );
}
