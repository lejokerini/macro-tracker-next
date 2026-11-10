"use client";

import { useState } from "react";
import type { Food } from "@/lib/types";
import { makeT } from "@/lib/i18n";
import CustomFoodForm from "@/components/CustomFoodForm";

// « Mes aliments » : créer un aliment absent des bases (recette maison, produit local,
// marque introuvable), modifier ou supprimer ceux déjà créés.
export default function CustomFoodModal({
  open,
  onClose,
  myFoods,
  usedIds,
  initialName = "",
  lang = "fr",
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  myFoods: Food[];
  usedIds: Set<string>;
  initialName?: string;
  lang?: string;
  onSave: (food: Food, isNew: boolean) => void;
  onDelete: (food: Food) => void;
}) {
  const tr = makeT(lang === "es" ? "es" : "fr");
  const [mode, setMode] = useState<"new" | "list" | { edit: Food }>(myFoods.length && !initialName ? "list" : "new");
  if (!open) return null;

  const editing = typeof mode === "object" ? mode.edit : undefined;

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>{editing ? tr("cf.editTitle") : mode === "list" ? tr("cf.listTitle") : tr("cf.newTitle")}</h2>
          <button className="snap-close" onClick={onClose} aria-label={tr("common.close")}>✕</button>
        </div>

        {mode === "list" && (
          <>
            <div className="list">
              {myFoods.map((f) => (
                <div className="item" key={f.id}>
                  <div className="space">
                    <strong>{f.name}{f.brand ? ` · ${f.brand}` : ""}</strong>
                    <span className="muted">{f.macros.kcal} kcal / 100 {f.unit === "ml" ? "ml" : "g"}</span>
                  </div>
                  <span className="muted">P {f.macros.protein} g · G {f.macros.carbs} g · L {f.macros.fat} g{f.barcode ? ` · ${tr("bc.code")}${f.barcode}` : ""}</span>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn secondary" onClick={() => setMode({ edit: f })}>{tr("cf.edit")}</button>
                    <button
                      className="btn danger"
                      disabled={usedIds.has(f.id)}
                      title={usedIds.has(f.id) ? tr("cf.usedHint") : undefined}
                      onClick={() => { if (confirm(tr("cf.deleteConfirm"))) onDelete(f); }}
                    >
                      {tr("common.delete")}
                    </button>
                  </div>
                  {usedIds.has(f.id) && <p className="form-help" style={{ margin: "6px 0 0" }}>{tr("cf.usedHint")}</p>}
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setMode("new")}>{tr("cf.newBtn")}</button>
            </div>
          </>
        )}

        {(mode === "new" || editing) && (
          <>
            {!editing && <p className="muted" style={{ marginTop: 0 }}>{tr("cf.intro")}</p>}
            {editing && <p className="form-help" style={{ marginTop: 0 }}>{tr("cf.editHint")}</p>}
            <CustomFoodForm
              key={editing?.id || "new"}
              editing={editing}
              initialName={editing ? "" : initialName}
              lang={lang}
              submitLabel={editing ? tr("cf.update") : tr("cf.saveAndSelect")}
              onSave={(food) => { onSave(food, !editing); if (editing) setMode("list"); }}
              onCancel={myFoods.length ? () => setMode("list") : onClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
