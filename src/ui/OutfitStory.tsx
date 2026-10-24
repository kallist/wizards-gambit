import { useEffect, useState } from "react";
import {
  datePages,
  dateTitle,
  initialReading,
  readDate,
  saveDate,
} from "../story/outfitStories";
import { outfitById, type OutfitId } from "../story/companion";
import { outfitCG } from "./art";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { getPlayerStorage } from "../platform/playerStorage";

export function OutfitStory({
  outfit,
  onClose,
}: {
  outfit: OutfitId;
  onClose: () => void;
}) {
  const [storage] = useState(() => getPlayerStorage());
  const [reading, setReading] = useState(() => readDate(outfit, storage));
  const [saved, setSaved] = useState(true);
  const pages = datePages(outfit, reading.choices),
    page = pages[reading.line];
  const pending = page.choice && reading.choices[page.choice.index] === null;
  useEffect(() => {
    setSaved(saveDate(outfit, reading, storage));
  }, [outfit, reading, storage]);
  const next = () => {
    if (!pending && reading.line < pages.length - 1)
      setReading({ ...reading, line: reading.line + 1 });
  };
  return (
    <Modal
      title={dateTitle(outfit)}
      eyebrow={`${outfitById(outfit).name} · 衣装番外 · ${reading.line + 1} / ${pages.length}`}
      onClose={onClose}
      wide
    >
      <div className="date-scene" data-testid="outfit-story">
        <img
          className="date-cg"
          src={outfitCG(outfit)}
          alt={`${outfitById(outfit).name} · 成年哈利与马尔福的专属约会CG`}
        />
        <div className="date-shade" />
        <div className="date-copy" aria-live="polite">
          <span>{page.speaker}</span>
          <p>{page.text}</p>
          {page.choice && (
            <div className="date-choices">
              {page.choice.labels.map((label, index) => (
                <button
                  key={label}
                  aria-pressed={reading.choices[page.choice!.index] === index}
                  onClick={() => {
                    const choices = [
                      ...reading.choices,
                    ] as typeof reading.choices;
                    choices[page.choice!.index] = index;
                    setReading({ line: reading.line + 1, choices });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="date-controls">
          <button
            className="button compact"
            disabled={reading.line === 0}
            onClick={() => setReading({ ...reading, line: reading.line - 1 })}
          >
            <Icon name="left" size={16} />
            上一页
          </button>
          <span>{saved ? "阅读位置已保存" : "阅读位置尚未保存"}</span>
          {reading.line === pages.length - 1 ? (
            <div className="date-finish-actions">
              <button
                className="text-button"
                onClick={() => setReading(initialReading())}
              >
                从头阅读
                <Icon name="redo" size={16} />
              </button>
              <button className="button primary" onClick={onClose}>
                读完了
                <Icon name="right" size={16} />
              </button>
            </div>
          ) : (
            <button
              className="button primary"
              disabled={!!pending}
              onClick={next}
            >
              继续
              <Icon name="right" size={16} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
