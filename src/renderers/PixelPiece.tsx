import type { Color, Kind } from "../domain/types";

const silhouettes: Record<Kind, string[]> = {
  p: [
    "      ####      ",
    "     ######     ",
    "     ######     ",
    "      ####      ",
    "       ##       ",
    "      ####      ",
    "      ####      ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
    "   ##########   ",
  ],
  r: [
    "   ##  ##  ##   ",
    "   ##  ##  ##   ",
    "   ##########   ",
    "    ########    ",
    "     ######     ",
    "     ######     ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
    "   ##########   ",
  ],
  n: [
    "      ##        ",
    "     #####      ",
    "    #######     ",
    "   #########    ",
    "   #### #####   ",
    "      #######   ",
    "     ########   ",
    "    ########    ",
    "    ########    ",
    "   ##########   ",
    "   ##########   ",
  ],
  b: [
    "       ##       ",
    "      ####      ",
    "     ######     ",
    "    ### ####    ",
    "    ## #####    ",
    "     ######     ",
    "       ##       ",
    "      ####      ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
  ],
  q: [
    "   ##  ##  ##   ",
    "   ## #### ##   ",
    "    ########    ",
    "    ########    ",
    "     ######     ",
    "      ####      ",
    "      ####      ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
    "   ##########   ",
  ],
  k: [
    "       ##       ",
    "     ######     ",
    "       ##       ",
    "       ##       ",
    "     ######     ",
    "    ########    ",
    "     ######     ",
    "      ####      ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
  ],
};

export function PixelPiece({ kind, color }: { kind: Kind; color: Color }) {
  const map = silhouettes[kind];
  const outline = new Set<string>();
  map.forEach((line, y) =>
    [...line].forEach((cell, x) => {
      if (cell !== "#") return;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (map[ny]?.[nx] !== "#") outline.add(`${nx},${ny + 2}`);
      }
    }),
  );
  return (
    <svg
      viewBox="0 0 16 16"
      className={`piece-icon pixel-piece ${color}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {[...outline].map((point) => {
        const [x, y] = point.split(",").map(Number);
        return (
          <rect
            key={point}
            x={x}
            y={y}
            width="1"
            height="1"
            fill={color === "white" ? "#667568" : "#a5b89f"}
          />
        );
      })}
      {map.flatMap((line, y) =>
        [...line].map((cell, x) =>
          cell === "#" ? (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y + 2}
              width="1"
              height="1"
              fill={
                color === "white"
                  ? x < 7
                    ? "#f2e5ca"
                    : "#c4b99f"
                  : x < 7
                    ? "#344b48"
                    : "#213330"
              }
            />
          ) : null,
        ),
      )}
      <path
        d="M3 13h10v1H3zM2 14h12v1H2z"
        fill={color === "white" ? "#a59a83" : "#142521"}
      />
      {kind === "n" && (
        <rect
          x="7"
          y="5"
          width="1"
          height="1"
          fill={color === "white" ? "#263833" : "#e8d9b8"}
        />
      )}
    </svg>
  );
}
