// Map pins shared by the Google map and the offline preview map.
import { CATEGORIES, initials, type NexusEvent, type Person } from '../../lib/nexus'
import { cx } from '../ui'

export function EventPin({ event, selected, dimmed }: { event: NexusEvent; selected?: boolean; dimmed?: boolean }) {
  const cat = CATEGORIES[event.categories[0]]
  const Icon = cat.icon
  return (
    <span className={cx('relative flex flex-col items-center transition', dimmed && 'opacity-35', selected && 'z-10 scale-125')}>
      <span
        className={cx('grid size-9 place-items-center rounded-full border-[3px] border-white text-white shadow-lg', selected && 'ring-4 ring-brand/40')}
        style={{ background: cat.color }}
      >
        <Icon className="size-4.5" aria-hidden strokeWidth={2.5} />
      </span>
      <span className="-mt-1 size-2.5 rotate-45 border-b-[3px] border-r-[3px] border-white" style={{ background: cat.color }} aria-hidden />
      {event.lookingForBuddy > 0 && (
        <span className="absolute -right-2 -top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full border-2 border-white bg-fg px-1 text-[10px] font-extrabold leading-none text-bg" aria-hidden>
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
        className={cx('grid size-10 place-items-center rounded-full border-[3px] text-sm font-extrabold text-white shadow-lg',
          person.relation === 'connection' ? 'border-white' : 'border-dashed border-white', selected && 'ring-4 ring-brand/40')}
        style={{ background: person.color }}
      >
        {initials(person.name)}
      </span>
      {person.openToBuddy && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white bg-success" aria-hidden />
      )}
    </span>
  )
}

export function YouPin() {
  return (
    <span className="relative grid size-5 place-items-center" aria-hidden>
      <span className="absolute size-5 animate-ping rounded-full bg-[#1a73e8]/40" />
      <span className="size-4 rounded-full border-[3px] border-white bg-[#1a73e8] shadow" />
    </span>
  )
}
