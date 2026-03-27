// lib/toast/normalize.ts
//
// Purpose:
// - Normalize Toast menu item + modifier strings into stable "menu keys" for Sales/Recipes
// - Virtualize certain items into variant keys based on important modifiers
//
// Current rules:
// - "The Outkast" splits by PROTEIN (required)
// - "The Outkast" also tracks OPTIONAL cheddar replacement
//   Example keys:
//   - "the outkast - pork bacon"
//   - "the outkast - pork bacon - cheddar"
//
// - "Love N This Club" splits by PROTEIN
//   Example keys:
//   - "love n this club - pork bacon"
//   - "love n this club - turkey bacon"
//
// - "Fully Loaded Grits" splits by PROTEIN
//   Example keys:
//   - "fully loaded grits - pork bacon"
//   - "fully loaded grits - turkey sausage"

export function cleanName(input: string) {
  return (input || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s-]/g, "") // remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// =========================
// Cheese detection (Outkast)
// =========================

// We only care about detecting cheddar right now.
// If no cheese modifier is detected, we assume default cheese = American.
const CHEESE_KEYWORDS = ["cheddar"] as const;

export function extractCheeseModifier(modifierDisplayNames: string[]) {
  const cleaned = modifierDisplayNames.map((s) => cleanName(String(s || "")));

  for (const c of CHEESE_KEYWORDS) {
    if (cleaned.some((name) => name.includes(c))) return c;
  }

  return null; // null means default cheese (American)
}

// ==========================
// Protein detection
// ==========================

// These are the important protein choices that materially change recipe usage.
// NOTE: We match by "includes" so Toast strings like "Turkey Sausage Patty"
// still map cleanly to "turkey sausage".
const PROTEIN_KEYWORDS = [
  "pork bacon",
  "turkey bacon",
  "pork sausage",
  "turkey sausage",
  "egg",
] as const;

export function extractProteinModifier(modifierDisplayNames: string[]) {
  const cleaned = modifierDisplayNames.map((s) => cleanName(String(s || "")));

  for (const p of PROTEIN_KEYWORDS) {
    if (cleaned.some((name) => name.includes(p))) return p;
  }

  return null;
}

// ======================
// Simple alias handling
// ======================

// Some Toast item names may come through with side text attached,
// like "Adultish Jambino with Fruit" or "Adultish Jambino with Chips".
// We want all of those to normalize to the same sandwich key.
export function normalizeSimpleAliases(base: string) {
  if (base.startsWith("adultish jambino")) {
    return "adultish jambino";
  }

  return base;
}

// ======================
// Virtual menu key builder
// ======================

// Builds the stable "menu_item" key we write into the Sales sheet.
//
// Behavior:
// - Most items return a cleaned base name
// - Protein-variant items return "{base} - {protein}"
// - The Outkast also adds optional "- cheddar"
export function buildVirtualMenuKey(
  baseItemDisplayName: string,
  protein: string | null,
  cheese: string | null,
) {
  const rawBase = cleanName(baseItemDisplayName);
  const base = normalizeSimpleAliases(rawBase);

  // Items whose recipe materially changes based on protein
  const PROTEIN_VARIANT_ITEMS = new Set([
    "the outkast",
    "love n this club",
    "fully loaded grits",
  ]);

  if (PROTEIN_VARIANT_ITEMS.has(base)) {
    // Protein is required for accurate recipe mapping.
    // If missing, bucket loudly so it doesn't silently skew inventory.
    const key = protein ? `${base} - ${protein}` : `${base} - unknown protein`;

    // Only The Outkast tracks cheddar as a recipe-level variant for now.
    if (base === "the outkast" && cheese === "cheddar") {
      return `${key} - cheddar`;
    }

    return key;
  }

  // Everything else uses the cleaned base name.
  return base;
}
