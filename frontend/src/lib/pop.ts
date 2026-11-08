// The card palette (red, green, yellow), picked in a fixed order or steadily per person.
export const POP_CARDS = ['card-red', 'card-green', 'card-yellow'] as const
export const POP_DOTS = ['pop-dot-red', 'pop-dot-green', 'pop-dot-yellow'] as const
/** Colour card class for the i-th card in a list. */
export const popCard = (i: number) => `card-pop ${POP_CARDS[i % POP_CARDS.length]}`
/** A person's avatar colour: the same every time, from their id. */
export const popDot = (id: number) => POP_DOTS[Math.abs(id) % POP_DOTS.length]
