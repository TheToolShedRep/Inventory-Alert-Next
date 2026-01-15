export type UpcLookupResult =
  | {
      ok: true;
      upc: string; // digits only (what was scanned)
      ean?: string; // if provider returns EAN/GTIN
      name: string; // fallback "Unknown Item"
      brand?: string;
      sizeUnit?: string;
      imageUrl?: string;

      googleCategoryId?: string;
      googleCategoryName?: string;

      issuingCountry?: string;
      raw?: unknown; // only for debugging
    }
  | {
      ok: false;
      upc: string;
      error: string;
    };
