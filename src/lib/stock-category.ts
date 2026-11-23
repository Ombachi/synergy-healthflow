/** PostgREST category filter shared by departmental stock request pickers. */
export function stockCategoryFilter(categoryHint: string): string {
  const category = categoryHint.trim().toLowerCase();
  if (category === "pharmacy" || category === "pharmaceutical") {
    return "category.ilike.%pharmacy%,category.ilike.%pharmaceutical%";
  }
  return `category.ilike.%${category}%`;
}