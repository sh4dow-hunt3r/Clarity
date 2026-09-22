// Category keys are open-ended strings — the 11 below ship as defaults,
// and users can add their own via the Category picker.
export type CategoryKey = string;

export type FoodSubcategory = 'fruits' | 'vegetables' | 'prepared' | 'dairy' | 'grains' | 'other';

export interface FoodMacros {
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g: number;
}

export interface FoodItem extends FoodMacros {
  id: number;
  transaction_id: number;
  name: string;
  subcategory: FoodSubcategory;
  quantity_g: number;
}

export interface Transaction {
  id: number;
  date: string; // ISO YYYY-MM-DD
  amount: number;
  description: string;
  category: CategoryKey;
  subcategory: string | null;
  shop: string | null;
  source: 'manual' | 'scan' | 'statement';
  notes: string | null;
}

export interface MonthlySummary {
  year: number;
  month: number;
  total: number;
  by_category: Record<CategoryKey, number>;
}

export const KNOWN_SHOPS = [
  'Costco',
  'Walmart',
  'Desi Mandi',
  'Target',
  'Whole Foods',
  'Trader Joe\'s',
  'Amazon',
  'Walgreens',
  'CVS',
  'Home Depot',
  'IKEA',
  'Other',
] as const;

export type KnownShop = typeof KNOWN_SHOPS[number];

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  icon: string;
  color: string;
  isCustom: boolean;
}

// Default categories the app ships with. Users can add more at runtime —
// those are stored in the custom_categories table and merged in via useCategories().
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { key: 'food',          label: 'Food',          icon: 'food-fork-drink', color: '#4CAF50', isCustom: false },
  { key: 'clothes',       label: 'Clothes',       icon: 'hanger',          color: '#2196F3', isCustom: false },
  { key: 'medicine',      label: 'Medicine',      icon: 'pill',            color: '#F44336', isCustom: false },
  { key: 'entertainment', label: 'Entertainment', icon: 'movie-open',     color: '#9C27B0', isCustom: false },
  { key: 'gifting',       label: 'Gifting',       icon: 'gift',            color: '#FF9800', isCustom: false },
  { key: 'furniture',     label: 'Furniture',     icon: 'sofa',            color: '#795548', isCustom: false },
  { key: 'gym',           label: 'Gym',            icon: 'dumbbell',        color: '#00BCD4', isCustom: false },
  { key: 'fuel',          label: 'Fuel',           icon: 'gas-station',     color: '#607D8B', isCustom: false },
  { key: 'insurance',     label: 'Insurance',      icon: 'shield-check',    color: '#3F51B5', isCustom: false },
  { key: 'utilities',     label: 'Utilities',      icon: 'lightning-bolt', color: '#FFC107', isCustom: false },
  { key: 'rent',          label: 'Rent',           icon: 'home',            color: '#E91E63', isCustom: false },
];

// Preset icon + color choices offered when a user creates a custom category.
export const ICON_CHOICES = [
  'shape', 'tag', 'cart', 'briefcase', 'airplane', 'car', 'school',
  'paw', 'baby-face-outline', 'tools', 'book-open-variant', 'music',
  'cellphone', 'laptop', 'gamepad-variant', 'silverware-fork-knife',
  'party-popper', 'heart', 'umbrella', 'wrench',
];

export const COLOR_CHOICES = [
  '#4CAF50', '#2196F3', '#F44336', '#9C27B0', '#FF9800', '#795548',
  '#00BCD4', '#607D8B', '#3F51B5', '#FFC107', '#E91E63', '#009688',
  '#8BC34A', '#FF5722', '#673AB7', '#CDDC39',
];
