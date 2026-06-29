"use client";

import { useMemo, useState } from "react";
import type { DietType, Food, MealType, Recipe } from "@/lib/types";
import { findFood, searchFoods } from "@/lib/food-engine";
import { sumIngredients } from "@/lib/nutrition";

const MEALS: MealType[] = ["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"];
const ALL_DIETS: DietType[] = ["omnivore", "flexitarien", "pescetarien", "vegetarien", "vegan", "sans_porc"];

function computeDiets(ingredients: { foodId: string; qty: number }[]): DietType[] {
  const foodsList = ingredients.map((i) => findFood(i.foodId)).filter((f): f is Food => !!f);
  if (!foodsList.length) return ["omnivore", "flexitarien", "sans_porc"];
  const diets = ALL_DIETS.filter((d) => foodsList.every((f) => f.diets.includes(d)));
  return diets.length ? diets : ["omnivore"];
}

export default function CreateRecipeModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (recipe: Recipe) => void;
}) {
  const [title, setTitle] = useState("");
  const [mealType, setMealType] = useState<MealType>("Déjeuner");
  const [prepTime, setPrepTime] = useState(20);
  const [storageDays, setStorageDays] = useState(3);
  const [query, setQuery] = useState("");
  const [ingredients, setIngredients] = useState<{ foodId: string; qty: number }[]>([]);

  const results = useMemo(() => (query.trim().length >= 2 ? searchFoods(query).slice(0, 8) : []), [query]);
  const macros = useMemo(() => sumIngredients(ingredients), [ingredients]);

  if (!open) return null;

  function addIngredient(foodId: string) {
    setIngredients((prev) => (prev.some((i) => i.foodId === foodId) ? prev : [...prev, { foodId, qty: 100 }]));
    setQuery("");
  }
  function updateQty(foodId: string, qty: number) {
    setIngredients((prev) => prev.map((i) => (i.foodId === foodId ? { ...i, qty: Math.max(0, qty) } : i)));
  }
  function removeIngredient(foodId: string) {
    setIngredients((prev) => prev.filter((i) => i.foodId !== foodId));
  }
  function reset() {
    setTitle(""); setMealType("Déjeuner"); setPrepTime(20); setStorageDays(3); setQuery(""); setIngredients([]);
  }
  function close() { reset(); onClose(); }

  function save() {
    const clean = ingredients.filter((i) => i.qty > 0);
    if (!title.trim() || !clean.length) return;
    const tags = ["perso"];
    if (storageDays >= 3) tags.push("meal prep");
    const recipe: Recipe = {
      id: `recipe_custom_${Math.random().toString(36).slice(2, 9)}`,
      title: title.trim(),
      mealType,
      servings: 1,
      prepTime: Math.max(1, prepTime),
      difficulty: "facile",
      storageDays: Math.max(1, storageDays),
      tags,
      diets: computeDiets(clean),
      instructions: ["Préparer les ingrédients.", "Assembler, assaisonner puis servir."],
      ingredients: clean,
      isCustom: true,
    };
    onSave(recipe);
    close();
  }

  return (
    <div className="snap-overlay" role="dialog" aria-modal="true">
      <div className="snap-modal">
        <div className="snap-head">
          <h2>➕ Créer une recette</h2>
          <button className="snap-close" onClick={close} aria-label="Fermer">✕</button>
        </div>

        <div className="grid" style={{ marginTop: 6 }}>
          <div className="span-12"><label>Nom de la recette</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Bowl poulet patate douce maison" /></div>
          <div className="span-4"><label>Repas</label><select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>{MEALS.map((m) => (<option key={m}>{m}</option>))}</select></div>
          <div className="span-4"><label>Temps (min)</label><input type="number" min="1" value={prepTime} onChange={(e) => setPrepTime(Number(e.target.value) || 0)} /></div>
          <div className="span-4"><label>Conservation (j)</label><input type="number" min="1" value={storageDays} onChange={(e) => setStorageDays(Number(e.target.value) || 0)} /></div>
        </div>

        <label style={{ marginTop: 10 }}>Ajouter un ingrédient</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un aliment…" />
        {results.length > 0 && (
          <div className="product-results" style={{ marginTop: 8 }}>
            {results.map((f) => (
              <button type="button" key={f.id} className="product-choice" onClick={() => addIngredient(f.id)}>
                <span className="product-choice-text"><strong>{f.name}</strong><small>{f.macros.kcal} kcal/100g · P{f.macros.protein} G{f.macros.carbs} L{f.macros.fat}</small></span>
                <span className="source-badge">+ Ajouter</span>
              </button>
            ))}
          </div>
        )}

        {ingredients.length > 0 && (
          <div className="list" style={{ marginTop: 10 }}>
            {ingredients.map((i) => {
              const f = findFood(i.foodId);
              return (
                <div className="item space" key={i.foodId}>
                  <span>{f?.name || i.foodId}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <input type="number" min="0" value={i.qty} onChange={(e) => updateQty(i.foodId, Number(e.target.value) || 0)} style={{ width: 80, textAlign: "center" }} />
                    <span className="unit-pill">g</span>
                    <button className="btn danger" onClick={() => removeIngredient(i.foodId)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="macro-preview" style={{ marginTop: 12 }}>
          <span>{Math.round(macros.kcal)} kcal</span>
          <span>P {Math.round(macros.protein)}g</span>
          <span>G {Math.round(macros.carbs)}g</span>
          <span>L {Math.round(macros.fat)}g</span>
          <span>Fibres {Math.round(macros.fiber)}g</span>
        </div>

        <div className="snap-footer">
          <button className="btn secondary" onClick={close}>Annuler</button>
          <button className="btn" disabled={!title.trim() || !ingredients.some((i) => i.qty > 0)} onClick={save}>Enregistrer la recette</button>
        </div>
      </div>
    </div>
  );
}
