import type { Color, Kind } from "../domain/types";
const shapes: Record<Kind, React.ReactNode> = {
  p: (
    <>
      <circle cx="32" cy="17" r="8" />
      <path d="M25 27h14l-4 8 7 13H22l7-13z" />
      <path d="M20 50h24v6H20z" />
    </>
  ),
  r: (
    <>
      <path d="M18 10h7v7h5v-7h5v7h5v-7h7v16l-7 5v15H24V31l-6-5z" />
      <path d="M20 47h24v9H20zM23 25h18" />
    </>
  ),
  n: (
    <>
      <path d="M22 46c0-11 10-15 14-21l-8-1-8 6-5-6 10-15 6 3 7-3c9 7 12 19 8 37z" />
      <path d="m28 12-3-6-1 9M21 47h27v9H21z" />
      <circle cx="32" cy="19" r="1.8" className="piece-eye" />
    </>
  ),
  b: (
    <>
      <path d="M32 5c-9 9-12 14-8 20l8 5 8-5c4-6 1-11-8-20zM26 32h12l-3 6 7 10H22l7-10zM20 50h24v6H20z" />
      <path d="m33 13-6 8" />
    </>
  ),
  q: (
    <>
      <path d="m17 16 8 6 7-11 7 11 8-6-5 17H22zM23 36h18l-4 9 7 5H20l7-5zM19 51h26v6H19z" />
      <circle cx="16" cy="12" r="3" />
      <circle cx="32" cy="7" r="3" />
      <circle cx="48" cy="12" r="3" />
    </>
  ),
  k: (
    <>
      <path d="M30 4h4v6h6v4h-6v8h-4v-8h-6v-4h6zM23 24c0-7 18-7 18 0l-3 10H26zM26 37h12l-3 7 8 6H21l8-6zM19 52h26v6H19z" />
    </>
  ),
};
export function PieceIcon({
  kind,
  color,
  className = "",
}: {
  kind: Kind;
  color: Color;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`piece-icon ${color} ${className}`}
      aria-hidden="true"
    >
      <g
        fill="currentColor"
        stroke="var(--piece-stroke)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      >
        {shapes[kind]}
      </g>
    </svg>
  );
}
