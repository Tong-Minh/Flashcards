import {
  Activity, Anchor, Atom, Binary, Bird, Book, BookOpen, Bone, Braces, Brain, Briefcase, Bug, Calculator,
  Calendar, Camera, Castle, ChartColumn, ChartPie, Church, Clock, Code, Coffee, Cog, Compass, Cpu, Crown,
  Database, DollarSign, Dna, Droplet, Dumbbell, Earth, FileText, Film, Flag, Flame, FlaskConical, Folder,
  Gavel, Globe, GraduationCap, Guitar, Hammer, Hash, Headphones, HeartPulse, Key, Landmark, Languages,
  Layers, Leaf, Library, Lightbulb, Lock, Magnet, Map, MessageCircle, Mic, Microscope, Moon, Mountain,
  Music, Network, Notebook, Orbit, Palette, PawPrint, PenTool, Pencil, Pi, Piano, Pill, Plane, Puzzle,
  Quote, Rocket, Ruler, Scale, Scroll, Shapes, Shield, Sigma, Sparkles, Sprout, Star, Stethoscope, Sun,
  Syringe, Target, Telescope, Terminal, TreePine, TrendingUp, Trophy, Users, Utensils, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

// Keys are what gets stored in sets.icon / collections.icon, so never rename one.
export const ICONS: Record<string, LucideIcon> = {
  layers: Layers, folder: Folder, book: Book, 'book-open': BookOpen, library: Library, notebook: Notebook,
  'file-text': FileText, 'graduation-cap': GraduationCap, pencil: Pencil, 'pen-tool': PenTool, lightbulb: Lightbulb,
  brain: Brain, puzzle: Puzzle, target: Target, star: Star, sparkles: Sparkles, trophy: Trophy, flag: Flag,
  // Science
  flask: FlaskConical, microscope: Microscope, atom: Atom, dna: Dna, magnet: Magnet, telescope: Telescope,
  orbit: Orbit, rocket: Rocket, zap: Zap, flame: Flame, droplet: Droplet,
  // Nature
  leaf: Leaf, sprout: Sprout, tree: TreePine, paw: PawPrint, bird: Bird, mountain: Mountain, earth: Earth,
  sun: Sun, moon: Moon,
  // Math & computing
  calculator: Calculator, sigma: Sigma, pi: Pi, ruler: Ruler, shapes: Shapes, compass: Compass, hash: Hash,
  code: Code, braces: Braces, terminal: Terminal, binary: Binary, database: Database, cpu: Cpu,
  network: Network, bug: Bug,
  // Humanities
  globe: Globe, languages: Languages, map: Map, 'message-circle': MessageCircle, quote: Quote,
  landmark: Landmark, scroll: Scroll, castle: Castle, crown: Crown, church: Church, anchor: Anchor,
  scale: Scale, gavel: Gavel, users: Users,
  // Arts
  palette: Palette, camera: Camera, film: Film, music: Music, mic: Mic, headphones: Headphones,
  guitar: Guitar, piano: Piano,
  // Health
  'heart-pulse': HeartPulse, stethoscope: Stethoscope, pill: Pill, syringe: Syringe, bone: Bone,
  activity: Activity, dumbbell: Dumbbell, utensils: Utensils, coffee: Coffee,
  // Business & practical
  briefcase: Briefcase, dollar: DollarSign, 'trending-up': TrendingUp, 'chart-column': ChartColumn,
  'chart-pie': ChartPie, plane: Plane, wrench: Wrench, hammer: Hammer, cog: Cog, shield: Shield, key: Key,
  lock: Lock, clock: Clock, calendar: Calendar,
}

// Full literal class strings so Tailwind keeps them. hex/bgHex are for the server-rendered link-preview image.
export const ICON_COLORS: Record<string, { tile: string; swatch: string; hex: string; bgHex: string }> = {
  indigo:  { tile: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',    swatch: 'bg-indigo-500',  hex: '#4f46e5', bgHex: '#e0e7ff' },
  blue:    { tile: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',            swatch: 'bg-blue-500',    hex: '#2563eb', bgHex: '#dbeafe' },
  teal:    { tile: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300',            swatch: 'bg-teal-500',    hex: '#0d9488', bgHex: '#ccfbf1' },
  emerald: { tile: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', swatch: 'bg-emerald-500', hex: '#059669', bgHex: '#d1fae5' },
  amber:   { tile: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',        swatch: 'bg-amber-500',   hex: '#d97706', bgHex: '#fef3c7' },
  orange:  { tile: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300',    swatch: 'bg-orange-500',  hex: '#ea580c', bgHex: '#ffedd5' },
  rose:    { tile: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',            swatch: 'bg-rose-500',    hex: '#e11d48', bgHex: '#ffe4e6' },
  purple:  { tile: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',    swatch: 'bg-purple-500',  hex: '#9333ea', bgHex: '#f3e8ff' },
  gray:    { tile: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',               swatch: 'bg-gray-500',    hex: '#4b5563', bgHex: '#f3f4f6' },
}

export const DEFAULT_SET_ICON        = { icon: 'layers', color: 'indigo' }
export const DEFAULT_COLLECTION_ICON = { icon: 'folder', color: 'amber' }

// First matching keyword wins, so more specific words come first.
const SUGGESTIONS: [RegExp, string][] = [
  [/\b(organic|chem)/i, 'flask'],
  [/\b(bio|genetic|cell)/i, 'dna'],
  [/\b(physic|quantum|mechanic)/i, 'atom'],
  [/\b(astro|space|planet)/i, 'telescope'],
  [/\b(anatomy|bone|skelet)/i, 'bone'],
  [/\b(pharm|drug)/i, 'pill'],
  [/\b(med|nurs|clinic|patho|mcat|usmle)/i, 'stethoscope'],
  [/\b(psych|neuro|cognit)/i, 'brain'],
  [/\b(stat|probab)/i, 'chart-column'],
  [/\b(calc|algebra|math|geometr|trig)/i, 'calculator'],
  [/\b(algo|data struct|leetcode|dsa)/i, 'braces'],
  [/\b(code|coding|program|python|java|javascript|typescript|react|rust|c\+\+|sql|software|computer|cs\b)/i, 'code'],
  [/\b(linux|bash|shell|devops)/i, 'terminal'],
  [/\b(network|aws|cloud)/i, 'network'],
  [/\b(spanish|french|german|japanese|chinese|korean|italian|language|vocab|latin|mandarin)/i, 'languages'],
  [/\b(geograph|capital|countr|map)/i, 'map'],
  [/\b(history|war|ancient|civil)/i, 'landmark'],
  [/\b(law|legal|bar exam|constitution)/i, 'scale'],
  [/\b(econ|financ|account|invest)/i, 'trending-up'],
  [/\b(business|market|manage)/i, 'briefcase'],
  [/\b(music|chord|scale theory)/i, 'music'],
  [/\b(art|paint|design)/i, 'palette'],
  [/\b(literat|book|novel|poem|poetry|english)/i, 'book-open'],
  [/\b(philosoph|relig|theolog)/i, 'scroll'],
  [/\b(plant|botan|ecolog|environment)/i, 'leaf'],
  [/\b(animal|zoolog)/i, 'paw'],
  [/\b(cook|food|nutrition|recipe)/i, 'utensils'],
  [/\b(fitness|workout|exercise|sport)/i, 'dumbbell'],
  [/\b(interview|prep|exam|test|quiz)/i, 'target'],
]

export function suggestIcon(name: string): string | null {
  for (const [re, icon] of SUGGESTIONS) if (re.test(name)) return icon
  return null
}
