// lib/sheets/prep.ts
// Prep sheet logger (header-driven mapping)
// IMPORTANT: We do NOT write to "Do not edit auto calc" (formula column)

import { appendRowHeaderDriven } from "./sheets-utils";

export type PrepPayload = {
  date: string; // YYYY-MM-DD
  menu_item: string; // e.g., "Latte"
  menu_qty: number; // e.g., 88
  ingredient?: string; // optional for v1
  qty_used?: number; // optional for v1
  unit?: string; // optional for v1
  cost?: number; // optional for v1
  notes?: string;
  source?: string; // "toast" | "manual" | "prep" etc.
  ip?: string;
  user_agent?: string;
};

export async function logPrepToSheet(input: PrepPayload) {
  const rowObject: Record<string, any> = {
    // ✅ exact header names from your sheet
    date: input.date,
    menu_item: input.menu_item,
    menu_qty: input.menu_qty,

    // Optional: you can pass menu_item_clean now, or let formulas handle it.
    // If you want to write it, add menu_item_clean to payload and include it here.
    // menu_item_clean: input.menu_item_clean,

    // ⚠️ DO NOT WRITE: "Do not edit auto calc"

    ingredient: input.ingredient ?? "",
    qty_used: input.qty_used ?? "",
    unit: input.unit ?? "",
    cost: input.cost ?? "",
    notes: input.notes ?? "",
    source: input.source ?? "prep",
    IP: input.ip ?? "",
    user_agent: input.user_agent ?? "",
  };

  return appendRowHeaderDriven({
    tabName: "Prep",
    rowObject,
  });
}
