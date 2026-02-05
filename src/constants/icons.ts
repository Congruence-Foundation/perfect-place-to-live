import {
  ShoppingCart,
  Train,
  TrainFront,
  HeartPulse,
  Trees,
  GraduationCap,
  Package,
  Utensils,
  Landmark,
  Dumbbell,
  Baby,
  Factory,
  Route,
  Trophy,
  Wine,
  BookOpen,
  Church,
  Dog,
  Laptop,
  Film,
  Store,
  Waves,
  Plane,
  TrainTrack,
  Cross,
  HardHat,
  Scale,
  Users,
  Briefcase,
  Activity,
  Heart,
  Gem,
  Building2,
  Volume2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon mapping for factor types
 * Used in WeightSliders and other components that display factor icons
 */
export const FACTOR_ICON_MAP: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  train: Train,
  'train-front': TrainFront,
  'heart-pulse': HeartPulse,
  trees: Trees,
  'graduation-cap': GraduationCap,
  package: Package,
  utensils: Utensils,
  landmark: Landmark,
  dumbbell: Dumbbell,
  baby: Baby,
  factory: Factory,
  road: Route,
  trophy: Trophy,
  wine: Wine,
  'book-open': BookOpen,
  church: Church,
  dog: Dog,
  laptop: Laptop,
  film: Film,
  store: Store,
  waves: Waves,
  plane: Plane,
  'train-track': TrainTrack,
  cross: Cross,
  'hard-hat': HardHat,
  'building-2': Building2,
  'volume-2': Volume2,
};

/**
 * Icon mapping for profile types
 * Used in ProfileSelector component
 */
export const PROFILE_ICON_MAP: Record<string, LucideIcon> = {
  scale: Scale,
  users: Users,
  briefcase: Briefcase,
  laptop: Laptop,
  activity: Activity,
  heart: Heart,
  'graduation-cap': GraduationCap,
  gem: Gem,
  'train-front': TrainFront,
};

/**
 * Default icon to use when a mapping is not found
 */
export const DEFAULT_FACTOR_ICON = ShoppingCart;
export const DEFAULT_PROFILE_ICON = Scale;
