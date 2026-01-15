// lib/types/purchase.ts
export type PurchaseSubmit = {
  upc: string;

  productName: string;
  brand?: string;
  sizeUnit?: string;
  googleCategoryId?: string;
  googleCategoryName?: string;

  qtyPurchased: number;
  totalPrice: number;
  storeVendor: string;
  assignedLocation: "Kitchen" | "Front";
  notes?: string;
};
