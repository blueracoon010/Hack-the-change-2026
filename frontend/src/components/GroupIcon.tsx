// Icons for communities. Built-in groups and ones people create both store an icon key.
import { Baby, BookOpen, Coffee, Dumbbell, Footprints, Gamepad2, Globe, Heart, Music, Palette, Sprout, Users, type LucideIcon } from 'lucide-react'

export const GROUP_ICONS: Record<string, LucideIcon> = {
  users: Users, walk: Footprints, books: BookOpen, art: Palette, coffee: Coffee, music: Music,
  sports: Dumbbell, heart: Heart, sprout: Sprout, gamepad: Gamepad2, baby: Baby, globe: Globe,
}

export function GroupIcon({ icon, className, size }: { icon: string; className?: string; size?: number }) {
  const Icon = GROUP_ICONS[icon] ?? Users
  return <Icon className={className} size={size} aria-hidden />
}
