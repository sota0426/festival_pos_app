import type { Menu, MenuCategory } from '../../../types/database';

export interface CategoryVisual {
  headerBgClass: string;
  headerTextClass: string;
  cardBgClass: string;
  cardBorderClass: string;
  chipBgClass: string;
  chipTextClass: string;
}

export interface CategoryMeta {
  id: string;
  name: string;
  index: number;
  code: string;
  visual: CategoryVisual;
}

const CATEGORY_PALETTE: CategoryVisual[] = [
  {
    headerBgClass: 'bg-blue-100',
    headerTextClass: 'text-blue-800',
    cardBgClass: 'bg-blue-50',
    cardBorderClass: 'border-blue-200',
    chipBgClass: 'bg-blue-200',
    chipTextClass: 'text-blue-800',
  },
  {
    headerBgClass: 'bg-emerald-100',
    headerTextClass: 'text-emerald-800',
    cardBgClass: 'bg-emerald-50',
    cardBorderClass: 'border-emerald-200',
    chipBgClass: 'bg-emerald-200',
    chipTextClass: 'text-emerald-800',
  },
  {
    headerBgClass: 'bg-amber-100',
    headerTextClass: 'text-amber-800',
    cardBgClass: 'bg-amber-50',
    cardBorderClass: 'border-amber-200',
    chipBgClass: 'bg-amber-200',
    chipTextClass: 'text-amber-800',
  },
  {
    headerBgClass: 'bg-rose-100',
    headerTextClass: 'text-rose-800',
    cardBgClass: 'bg-rose-50',
    cardBorderClass: 'border-rose-200',
    chipBgClass: 'bg-rose-200',
    chipTextClass: 'text-rose-800',
  },
  {
    headerBgClass: 'bg-indigo-100',
    headerTextClass: 'text-indigo-800',
    cardBgClass: 'bg-indigo-50',
    cardBorderClass: 'border-indigo-200',
    chipBgClass: 'bg-indigo-200',
    chipTextClass: 'text-indigo-800',
  },
  {
    headerBgClass: 'bg-teal-100',
    headerTextClass: 'text-teal-800',
    cardBgClass: 'bg-teal-50',
    cardBorderClass: 'border-teal-200',
    chipBgClass: 'bg-teal-200',
    chipTextClass: 'text-teal-800',
  },
];

export const UNCATEGORIZED_VISUAL: CategoryVisual = {
  headerBgClass: 'bg-gray-200',
  headerTextClass: 'text-gray-700',
  cardBgClass: 'bg-gray-100',
  cardBorderClass: 'border-gray-200',
  chipBgClass: 'bg-gray-300',
  chipTextClass: 'text-gray-700',
};

export const sortMenusByDisplay = (menus: Menu[]) =>
  [...menus].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.menu_name.localeCompare(b.menu_name, 'ja');
  });

export const getCategoryMetaMap = (categories: MenuCategory[]) => {
  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const map = new Map<string, CategoryMeta>();

  orderedCategories.forEach((category, index) => {
    map.set(category.id, {
      id: category.id,
      name: category.category_name,
      index,
      code: `C${String(index + 1).padStart(2, '0')}`,
      visual: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
    });
  });

  return { orderedCategories, categoryMetaMap: map };
};

export const formatMenuCode = (menuNumber: number) => `M${String(menuNumber).padStart(3, '0')}`;

export const buildMenuCodeMap = (menus: Menu[], categories: MenuCategory[]) => {
  const { orderedCategories } = getCategoryMetaMap(categories);
  const menuCodeMap = new Map<string, string>();
  let menuNumber = 1;

  orderedCategories.forEach((category) => {
    const categoryMenus = sortMenusByDisplay(menus.filter((menu) => menu.category_id === category.id));
    categoryMenus.forEach((menu) => {
      menuCodeMap.set(menu.id, formatMenuCode(menuNumber));
      menuNumber += 1;
    });
  });

  const uncategorized = sortMenusByDisplay(
    menus.filter((menu) => !menu.category_id || !categories.find((category) => category.id === menu.category_id)),
  );
  uncategorized.forEach((menu) => {
    menuCodeMap.set(menu.id, formatMenuCode(menuNumber));
    menuNumber += 1;
  });

  return menuCodeMap;
};
