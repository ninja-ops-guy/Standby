export const CATEGORIES = [
  { id: "stay", label: "Hotels & Stays", emoji: "🏨" },
  { id: "dining", label: "Dining & Tastings", emoji: "🍽️" },
  { id: "events", label: "Events & Shows", emoji: "🎟️" },
  { id: "wellness", label: "Wellness & Spa", emoji: "💆" },
  { id: "sport", label: "Sport & Outdoors", emoji: "⛳" },
  { id: "learning", label: "Classes & Workshops", emoji: "🎓" },
  { id: "travel", label: "Flights & Transit", emoji: "✈️" },
  { id: "workspace", label: "Workspaces", emoji: "🖥️" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? { id, label: id, emoji: "📦" };
}
