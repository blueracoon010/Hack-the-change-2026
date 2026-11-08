// Map pins shared by the Google map and the offline preview map.
import { CATEGORIES, initials, type NexusEvent, type Person } from '../../lib/nexus'
import { cx } from '../ui'

/** Icon colour for a category colour: var(--cat-arts) -> var(--cat-ink-arts) */
export const catInk = (color: string) => color.replace('--cat-', '--cat-ink-')

export function EventPin({ event, selected, dimmed }: { event: NexusEvent; selected?: boolean; dimmed?: boolean }) {
  const cat = CATEGORIES[event.categories[0]]
  const Icon = cat.icon
  return (
    <span className={cx('relative flex flex-col items-center transition', dimmed && 'opacity-35', selected && 'z-10 scale-125')}>
      <span
        className={cx('grid size-9 place-items-center rounded-full border-2 border-white shadow-md shadow-navy/25', selected && 'ring-4 ring-navy/30')}
        style={{ background: cat.color, color: catInk(cat.color) }}
      >
        <Icon className="size-4.5" aria-hidden strokeWidth={2.5} />
      </span>
      <span className="-mt-1 size-2.5 rotate-45 border-b-2 border-r-2 border-white" style={{ background: cat.color }} aria-hidden />
      {event.lookingForBuddy > 0 && (
        <span className="absolute -right-2 -top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full border-2 border-white bg-navy px-1 text-[10px] font-extrabold leading-none text-white" aria-hidden>
          {event.lookingForBuddy}
        </span>
      )}
    </span>
  )
}

export function PersonPin({ person, selected }: { person: Person; selected?: boolean }) {
  return (
    <span className={cx('relative flex flex-col items-center transition', selected && 'z-10 scale-125')}>
      <span
        className={cx('grid size-10 place-items-center rounded-full border-[3px] text-sm font-extrabold text-navy shadow-md',
          person.relation === 'connection' ? 'border-white' : 'border-dashed border-white', selected && 'ring-4 ring-navy/30')}
        style={{ background: person.color }}
      >
        {initials(person.name)}
      </span>
      {person.openToBuddy && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white bg-free" aria-hidden />
      )}
    </span>
  )
}

export function YouPin() {
  return (
    <span className="relative grid size-5 place-items-center" aria-hidden>
      <span className="absolute size-5 animate-ping rounded-full bg-mustard/45" />
      <span className="size-4 rounded-full border-[3px] border-white bg-navy shadow" />
    </span>
  )
}
