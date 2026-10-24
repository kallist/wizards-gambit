import { useState } from "react";
import type { SpellDef } from "../domain/types";
import { SpellArt } from "./SpellArt";
import { Icon } from "./Icon";
export function SpellLibrary({ spells }: { spells: SpellDef[] }) {
  const [selected, setSelected] = useState("protego");
  const current = spells.find((s) => s.id === selected) ?? spells[0];
  return (
    <div className="spell-codex">
      <div className="spell-library">
        {spells.map((s) => (
          <button
            key={s.id}
            className={`library-card tone-${s.tone} ${current?.id === s.id ? "selected" : ""}`}
            onClick={() => setSelected(s.id)}
            aria-label={`查看${s.name}`}
          >
            <SpellArt spell={s.id} />
            <h3>{s.name}</h3>
            <span>
              <Icon name={s.icon} size={13} />
              {s.category}
            </span>
          </button>
        ))}
      </div>
      {current && (
        <aside className="spell-detail">
          <SpellArt spell={current.id} />
          <small>{current.category}</small>
          <h3>{current.name}</h3>
          <em>{current.latin}</em>
          <p>{current.description}</p>
        </aside>
      )}
    </div>
  );
}
