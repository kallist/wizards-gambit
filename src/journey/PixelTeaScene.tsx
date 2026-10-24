import { useState } from "react";

export interface PixelTeaSceneProps {
  state: 0 | 1 | 2;
  caption: string;
  image?: string;
  comfort?: boolean;
}

/** Art may arrive later; the confirmed event caption remains readable without it. */
export function PixelTeaScene({
  state,
  caption,
  image,
  comfort = false,
}: PixelTeaSceneProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const showImage = !!image && image !== failedImage;
  return (
    <figure
      className={`journey-tea${comfort ? " journey-tea-comfort" : ""}`}
      data-tea-state={state}
      data-testid="journey-tea-scene"
    >
      <div className="journey-tea-picture" aria-hidden="true">
        {showImage ? (
          <img
            src={image}
            alt=""
            draggable={false}
            onError={() => setFailedImage(image)}
          />
        ) : (
          <div className="journey-tea-whitebox">
            <div className="journey-tea-light" />
            <div className="journey-tea-table">
              <span className="journey-tea-mat journey-tea-mat-left" />
              <span className="journey-tea-mat journey-tea-mat-right" />
              <span className="journey-tea-cup">
                <i />
              </span>
              <span className="journey-tea-saucer" />
            </div>
          </div>
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
