// Conjunto curado de ícones para categorias. Importações nomeadas permitem tree-shaking:
// só estes ícones entram no bundle.
import {
  Baby, Banknote, Bike, BookOpen, Briefcase, Bus, Car, CircleDot, Coffee, CreditCard, Dog, Dumbbell,
  Film, Fuel, Gamepad2, Gift, GraduationCap, HandCoins, HeartPulse, House, Laptop, Link, Music, Palette,
  PenTool, PiggyBank, Pill, Plane, Play, Plug, Receipt, Repeat, Scissors, Shirt, ShoppingBag, ShoppingCart,
  Smartphone, Sparkles, Tag, TrendingUp, Utensils, Wallet, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  coffee: Coffee,
  car: Car,
  bus: Bus,
  fuel: Fuel,
  bike: Bike,
  plane: Plane,
  home: House,
  plug: Plug,
  zap: Zap,
  wifi: Wifi,
  "heart-pulse": HeartPulse,
  pill: Pill,
  dumbbell: Dumbbell,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  laptop: Laptop,
  smartphone: Smartphone,
  gamepad: Gamepad2,
  film: Film,
  music: Music,
  repeat: Repeat,
  "shopping-bag": ShoppingBag,
  gift: Gift,
  shirt: Shirt,
  scissors: Scissors,
  receipt: Receipt,
  "credit-card": CreditCard,
  wrench: Wrench,
  dog: Dog,
  baby: Baby,
  palette: Palette,
  sparkles: Sparkles,
  "circle-dot": CircleDot,
  tag: Tag,
  briefcase: Briefcase,
  "pen-tool": PenTool,
  play: Play,
  link: Link,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  wallet: Wallet,
  banknote: Banknote,
  "hand-coins": HandCoins,
};

// Paleta saturada estilo MS Paint (sem branco/preto, que somem no fundo).
export const CATEGORY_COLORS = [
  "#FF0000", "#FF8040", "#FFC800", "#808000", "#80C000", "#00C800", "#008000", "#00C080",
  "#008080", "#0080FF", "#0000FF", "#004080", "#8000FF", "#800080", "#FF00FF", "#FF0080",
  "#804000", "#808080",
];

/** Preto ou branco, o que tiver mais contraste sobre a cor. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#FFFFFF";
}

export function CategoryIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Tag;
  return <Icon size={size} className={className} strokeWidth={2.4} />;
}

/** Ícone da categoria num "adesivo" com a cor da categoria e contorno preto. */
export function CategoryBadge({ icon, color, size = 32 }: { icon: string; color: string; size?: number }) {
  return (
    <span
      className="wobbly inline-flex shrink-0 items-center justify-center border-2 border-ink"
      style={{ width: size, height: size, backgroundColor: color, color: inkOn(color) }}
    >
      <CategoryIcon name={icon} size={Math.round(size * 0.52)} />
    </span>
  );
}