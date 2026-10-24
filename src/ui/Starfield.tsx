import { useEffect, useRef, useState } from "react";
import type { GalaxyOptions } from "../renderers/galaxy";

export function Starfield(options: GalaxyOptions) {
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(options);
  const update = useRef<(options: GalaxyOptions) => void>(() => {});
  latest.current = options;
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    import("../renderers/galaxy")
      .then(({ mountGalaxy }) => {
        if (cancelled) return;
        const galaxy = mountGalaxy(canvas.current!, latest.current);
        update.current = galaxy.setOptions;
        dispose = galaxy.dispose;
      })
      .catch(() => {
        if (!cancelled) {
          canvas.current!.dataset.renderEngine = "unavailable";
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      update.current = () => {};
      dispose();
    };
  }, []);
  useEffect(() => update.current(options), [options.comfort, options.subdued]);
  return (
    <>
      <canvas
        ref={canvas}
        className="quiet-stars"
        data-testid="galaxy-backdrop"
        aria-hidden="true"
      />
      {failed && (
        <p className="galaxy-unavailable" role="status">
          动态银河暂不可用，你仍可正常游玩。
        </p>
      )}
    </>
  );
}
