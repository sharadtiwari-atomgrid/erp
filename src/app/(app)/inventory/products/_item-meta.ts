/** Labels and short explanations for item classification. Safe on the client. */

export const ITEM_TYPES = {
  RAW_MATERIAL: { label: "Raw material", hint: "Bought in and consumed in production." },
  SEMI_FINISHED: { label: "Semi-finished", hint: "Made in-house and used in further production." },
  FINISHED_GOOD: { label: "Finished good", hint: "Made in-house and sold to customers." },
  TRADING: { label: "Trading good", hint: "Bought and resold as-is." },
  CONSUMABLE: { label: "Consumable", hint: "Used up in operations (packing, fasteners…), not sold." },
  SERVICE: { label: "Service", hint: "Non-stock item such as installation or repair." },
} as const;

export const SUPPLY_MODES = {
  BUY: { label: "Buy", hint: "Procured from suppliers on purchase orders." },
  MTS: { label: "Make to stock (MTS)", hint: "Produced ahead of demand to keep stock on hand." },
  MTO: { label: "Make to order (MTO)", hint: "Produced only against a confirmed sales order." },
  ATO: { label: "Assemble to order (ATO)", hint: "Components are stocked; final assembly starts on an order." },
} as const;

export type ItemTypeKey = keyof typeof ITEM_TYPES;
export type SupplyModeKey = keyof typeof SUPPLY_MODES;
