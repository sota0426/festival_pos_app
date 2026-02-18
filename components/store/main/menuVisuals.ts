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
  digit: number;
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
  // MenuManagement と同じ sort_order 基準でソート（同値時は id でタイブレーク）
  const orderedCategories = [...categories].sort((a, b) => {
    const diff = a.sort_order - b.sort_order;
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id, 'ja', { numeric: true });
  });
  const map = new Map<string, CategoryMeta>();

  orderedCategories.forEach((category, index) => {
    const digit = (index % 9) + 1;
    map.set(category.id, {
      id: category.id,
      name: category.category_name,
      index,
      code: String(digit),
      digit,
      visual: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
    });
  });

  return { orderedCategories, categoryMetaMap: map };
};

export const formatMenuCode = (menuNumber: number) => String(menuNumber).padStart(3, '0');

export const buildMenuCodeMap = (menus: Menu[], categories: MenuCategory[]) => {
  const { orderedCategories, categoryMetaMap } = getCategoryMetaMap(categories);
  const menuCodeMap = new Map<string, string>();
  const menusWithFixedNumber = menus.filter((menu) => typeof menu.menu_number === 'number');
  menusWithFixedNumber.forEach((menu) => menuCodeMap.set(menu.id, formatMenuCode(menu.menu_number as number)));

  const withoutFixedNumber = menus.filter((menu) => !menuCodeMap.has(menu.id));
  if (withoutFixedNumber.length > 0) {
    orderedCategories.forEach((category) => {
      const categoryMenus = sortMenusByDisplay(withoutFixedNumber.filter((menu) => menu.category_id === category.id));
      const digit = categoryMetaMap.get(category.id)?.digit ?? 0;
      let slot = 1;
      categoryMenus.forEach((menu) => {
        menuCodeMap.set(menu.id, formatMenuCode(digit * 100 + slot));
        slot += 1;
      });
    });

    const uncategorized = sortMenusByDisplay(
      withoutFixedNumber.filter(
        (menu) => !menu.category_id || !categories.find((category) => category.id === menu.category_id),
      ),
    );
    let uncategorizedSlot = 1;
    uncategorized.forEach((menu) => {
      menuCodeMap.set(menu.id, formatMenuCode(uncategorizedSlot));
      uncategorizedSlot += 1;
    });
  }

  return menuCodeMap;
};
