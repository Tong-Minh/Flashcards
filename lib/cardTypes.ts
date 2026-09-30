import type { CardType } from './types'

export const CARD_TYPES: CardType[] = ['open_ended', 'typed', 'multiple_choice', 'true_false', 'fill_blank', 'matching']

export const TYPE_LABELS: Record<CardType, string> = {
  open_ended:      'Open Ended',
  multiple_choice: 'Multiple Choice',
  fill_blank:      'Fill in Blank',
  typed:           'Type Answer',
  true_false:      'True / False',
  matching:        'Matching',
}

export const TYPE_BADGES: Record<CardType, string> = {
  open_ended:      'OE',
  multiple_choice: 'MC',
  fill_blank:      'FB',
  typed:           'TY',
  true_false:      'TF',
  matching:        'MA',
}
