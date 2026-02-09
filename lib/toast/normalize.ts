// lib/toast/normalize.ts
//
// Purpose:
// - Normalize Toast menu item + modifier strings into stable "menu keys" for Sales/Recipes
// - Virtualize certain items (like "The Outkast") into variant keys based on modifiers
//
// Current rules:
// - "The Outkast" splits by PROTEIN (required)
// - "Cheddar" is tracked as an OPTIONAL cheese replacement (American is assumed default)
//   Example keys:
//   - "the outkast - pork bacon"            (default American)
//   - "the outkast - pork bacon - cheddar"  (cheddar replaces American)

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
// If no cheese modifier is detected, we assume the default cheese = American.
const CHEESE_KEYWORDS = ["cheddar"] as const;

export function extractCheeseModifier(modifierDisplayNames: string[]) {
  const cleaned = modifierDisplayNames.map((s) => cleanName(String(s || "")));

  for (const c of CHEESE_KEYWORDS) {
    // "cheddar" should match things like "Cheddar", "Cheddar Cheese", etc.
    if (cleaned.some((name) => name.includes(c))) return c;
  }

  return null; // null means default cheese (American)
}

// ==========================
// Protein detection (Outkast)
// ==========================

// Treat only these as "protein" for The Outkast (simple + reliable).
// NOTE: We match by "includes" so Toast strings like "Turkey Sausage Patty"
// still map to "turkey sausage".
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
// Virtual menu key builder
// ======================

// Builds the stable "menu_item" key we write into the Sales sheet.
// - For most items: returns cleanName(baseItemDisplayName)
// - For "The Outkast": returns a variant key based on protein + optional cheddar
export function buildVirtualMenuKey(
  baseItemDisplayName: string,
  protein: string | null,
  cheese: string | null,
) {
  const base = cleanName(baseItemDisplayName);

  // Only The Outkast gets variant keys (for now)
  if (base === "the outkast") {
    // Protein is required for accurate inventory mapping.
    // If we can't detect it, bucket it loudly (so it doesn't silently skew inventory).
    const key = protein ? `${base} - ${protein}` : `${base} - unknown protein`;

    // Cheese:
    // - American is the default and is IMPLIED in the base recipes
    // - Cheddar is treated as a replacement, so we suffix "- cheddar"
    if (cheese === "cheddar") return `${key} - cheddar`;

    return key;
  }

  // Everything else uses the clean base name
  return base;
}
