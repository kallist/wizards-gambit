import { useEffect, useState } from "react";
import { inCheck } from "../domain/engine";
import { effectName, file, pieceName, row, squareName } from "../domain/types";
import type { GameState, RecordEntry } from "../domain/types";
import { PixelPiece } from "./PixelPiece";

export interface BoardProps {
  state: GameState;
  selected: number | null;
  targets: number[];
  castTargets: number[];
  flipped: boolean;
  comfort: boolean;
  onSquare: (square: number) => void;
  disabled: boolean;
  lastEvent: RecordEntry | null;
  eventId: number;
}
export default function Board2D({
  state,
  selected,
  targets,
  castTargets,
  flipped,
  comfort,
  onSquare,
  disabled,
  lastEvent,
  eventId,
}: BoardProps) {
  const [burst, setBurst] = useState<{
    at: number;
    kind: NonNullable<RecordEntry["captured"]>;
    color: "white" | "black";
    id: number;
  } | null>(null);
  useEffect(() => {
    if (
      lastEvent?.type !== "move" ||
      !lastEvent.captured ||
      lastEvent.to === undefined
    )
      return;
    setBurst({
      at: lastEvent.to,
      kind: lastEvent.captured,
      color: lastEvent.color === "white" ? "black" : "white",
      id: eventId,
    });
    const t = setTimeout(() => setBurst(null), comfort ? 450 : 1050);
    return () => clearTimeout(t);
  }, [eventId]);
  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));
  const visible = (at: number) => (flipped ? 63 - at : at);
  return (
    <div
      className={`board-2d ${comfort ? "comfortable" : ""}`}
      data-testid="board-2d"
    >
      <div className="flat-grid" role="group" aria-label="国际象棋棋盘">
        {order.map((at) => {
          const p = state.board[at],
            tile = state.tiles.find((t) => t.square === at),
            check = p?.kind === "k" && inCheck(state, p.color);
          return (
            <button
              type="button"
              key={at}
              disabled={disabled}
              onClick={() => onSquare(at)}
              data-square={squareName(at)}
              aria-label={`${squareName(at)}${p ? ` ${p.color === "white" ? "白" : "黑"}${pieceName[p.kind]}` : " 空格"}${targets.includes(at) ? " 可走" : ""}`}
              className={`flat-square ${(row(at) + file(at)) % 2 ? "dark" : "light"} ${selected === at ? "selected" : ""} ${castTargets.includes(at) ? "spell-target" : ""} ${check ? "king-check" : ""} ${lastEvent?.type === "move" && [lastEvent.from, lastEvent.to].includes(at) ? "last-move" : ""}`}
            >
              {file(visible(at)) === 0 && (
                <span className="rank-coordinate">{8 - row(at)}</span>
              )}
              {row(visible(at)) === 7 && (
                <span className="file-coordinate">{"abcdefgh"[file(at)]}</span>
              )}
              {tile && (
                <span
                  className={`tile-rune ${tile.type}`}
                  aria-label={
                    tile.type === "fire"
                      ? "火印"
                      : tile.type === "wall"
                        ? "屏障"
                        : "水流"
                  }
                >
                  {tile.type === "fire"
                    ? "✦"
                    : tile.type === "wall"
                      ? "◇"
                      : "≈"}
                </span>
              )}
              {p && (
                <>
                  <PixelPiece kind={p.kind} color={p.color} />
                  {p.effects.length > 0 && (
                    <span
                      className={`status-dot ${p.effects[0].type}`}
                      title={p.effects
                        .map(
                          (e) =>
                            `${effectName[e.type]} · ${e.until - state.ply} 步后失效`,
                        )
                        .join("，")}
                    />
                  )}
                </>
              )}
              {targets.includes(at) && (
                <span className={`move-dot ${p ? "capture-target" : ""}`} />
              )}
            </button>
          );
        })}
      </div>
      {burst && (
        <div
          key={burst.id}
          className={`capture-burst ${comfort ? "soft" : ""}`}
          style={{
            left: `${(file(visible(burst.at)) + 0.5) * 12.5}%`,
            top: `${(row(visible(burst.at)) + 0.5) * 12.5}%`,
          }}
          data-testid="capture-feedback"
        >
          <div className="impact-ring" />
          <div className="victim-ghost">
            <PixelPiece kind={burst.kind} color={burst.color} />
          </div>
          {Array.from({ length: comfort ? 8 : 28 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--a": `${i * 137.5}deg`,
                  "--d": `${35 + (i % 7) * 12}px`,
                  "--delay": `${(i % 4) * 12}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
