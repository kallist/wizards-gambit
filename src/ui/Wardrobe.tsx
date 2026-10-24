import { useState } from "react";
import {
  OUTFITS,
  EXPRESSION_NAMES,
  ownsOutfit,
  wardrobeCount,
  type CompanionProgress,
  type Expression,
  type OutfitId,
} from "../story/companion";
import { OutfitSprite } from "./OutfitSprite";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
export function Wardrobe({
  companion,
  equipped,
  onEquip,
  onStory,
  onClose,
}: {
  companion: CompanionProgress;
  equipped: OutfitId;
  onEquip: (id: OutfitId) => void;
  onStory: (id: OutfitId) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(equipped),
    [expression, setExpression] = useState<Expression>(0);
  const owned = ownsOutfit(companion, selected),
    meta = OUTFITS.find((o) => o.id === selected)!;
  return (
    <Modal
      title="她的私人衣橱"
      eyebrow={`衣间拾光 · ${wardrobeCount(companion)} / ${OUTFITS.length}`}
      onClose={onClose}
      wide
    >
      <div className="wardrobe-layout">
        <div className="wardrobe-preview">
          {owned ? (
            <OutfitSprite outfit={selected} expression={expression} />
          ) : (
            <div className="outfit-locked-preview">
              <Icon name="lock" size={45} />
              <p>下一局，会遇见怎样的她？</p>
            </div>
          )}
          <div className="wardrobe-preview-name">
            <span>{meta.style}</span>
            <h3>{meta.name}</h3>
          </div>
        </div>
        <div className="wardrobe-browser">
          <div className="wardrobe-cards">
            {OUTFITS.map((outfit) => (
              <button
                key={outfit.id}
                className={`${selected === outfit.id ? "selected" : ""} ${ownsOutfit(companion, outfit.id) ? "owned" : "locked"}`}
                aria-label={`衣装 ${outfit.name}${ownsOutfit(companion, outfit.id) ? " 已拥有" : " 未解锁"}`}
                onClick={() => {
                  setSelected(outfit.id);
                  setExpression(0);
                }}
              >
                {ownsOutfit(companion, outfit.id) ? (
                  <OutfitSprite outfit={outfit.id} lazy />
                ) : (
                  <span className="locked-dress">
                    <Icon name="lock" size={20} />
                  </span>
                )}
                <span>{outfit.name}</span>
              </button>
            ))}
          </div>
          <div className="wardrobe-controls">
            <div className="expression-tabs" aria-label="表情差分">
              {EXPRESSION_NAMES.map((name, value) => (
                <button
                  key={name}
                  disabled={!owned}
                  aria-pressed={expression === value}
                  className={expression === value ? "active" : ""}
                  onClick={() => setExpression(value as Expression)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="two-buttons">
              <button
                className="button primary"
                disabled={!owned}
                onClick={() => onEquip(selected)}
              >
                {equipped === selected ? "正在穿着" : "穿给你看"}
                <Icon name="heart" size={16} />
              </button>
              <button
                className="button"
                disabled={!owned}
                onClick={() => onStory(selected)}
              >
                专属番外
                <Icon name="book" size={16} />
              </button>
            </div>
          </div>
          <p className="wardrobe-note">
            正常完成一局，随机解锁一套未拥有衣装、八种表情和专属约会。输赢都算；认输、退出不领取。
          </p>
        </div>
      </div>
    </Modal>
  );
}
