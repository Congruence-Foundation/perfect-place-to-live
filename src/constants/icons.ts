import {
  ShoppingCart,
  Train,
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
  MapPin,
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
} from 'lucide-react';

/**
 * Icon mapping for factor types
 * Used in WeightSliders and other components that display factor icons
 */
export const FACTOR_ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  'shopping-cart': ShoppingCart,
  train: Train,
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
  'map-pin': MapPin,
  'building-2': Building2,
  'volume-2': Volume2,
};

/**
 * Icon mapping for profile types
 * Used in ProfileSelector component
 */
export const PROFILE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  scale: Scale,
  users: Users,
  briefcase: Briefcase,
  laptop: Laptop,
  activity: Activity,
  heart: Heart,
  'graduation-cap': GraduationCap,
  gem: Gem,
};

/**
 * Default icon to use when a mapping is not found
 */
export const DEFAULT_FACTOR_ICON = ShoppingCart;
export const DEFAULT_PROFILE_ICON = Scale;
