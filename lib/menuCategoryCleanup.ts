import type { Menu, MenuCategory } from '../types/database';

type CleanupResult = {
  categories: MenuCategory[];
  menus: Menu[];
  removedCategoryIds: string[];
};

export const cleanupLegacyNoneCategory = (
  categories: MenuCategory[],
  menus: Menu[],
): CleanupResult => {
  const removedCategoryIds = categories
    .filter((category) => category.category_name.trim() === 'なし')
    .map((category) => category.id);

  if (removedCategoryIds.length === 0) {
    return { categories, menus, removedCategoryIds: [] };
  }

  const removedIdSet = new Set(removedCategoryIds);

  return {
    categories: categories.filter((category) => !removedIdSet.has(category.id)),
    menus: menus.map((menu) =>
      removedIdSet.has(menu.category_id ?? '') ? { ...menu, category_id: null } : menu,
    ),
    removedCategoryIds,
  };
};
