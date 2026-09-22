import { useCallback, useEffect, useState } from 'react';
import { getCustomCategories, insertCustomCategory } from '../db/database';
import { CategoryDef, DEFAULT_CATEGORIES } from '../types';

export function useCategories() {
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);

  const refresh = useCallback(async () => {
    const custom = await getCustomCategories();
    setCategories([...DEFAULT_CATEGORIES, ...custom]);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addCategory = useCallback(async (label: string, icon: string, color: string) => {
    const created = await insertCustomCategory(label, icon, color);
    setCategories(prev => [...prev, created]);
    return created;
  }, []);

  const getCategory = useCallback((key: string): CategoryDef => {
    return categories.find(c => c.key === key)
      ?? { key, label: key, icon: 'shape', color: '#9E9E9E', isCustom: true };
  }, [categories]);

  return { categories, refresh, addCategory, getCategory };
}
