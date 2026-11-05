import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { ArrowsUpDownIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useIsMobile } from '@/hooks/use-is-mobile'

type SortMenuProps<K extends string> = {
  value: K
  /** Each option's label, in menu order. */
  options: Record<K, string>
  onChange: (value: K) => void
}

// A list's sort order: a labelled menu on desktop; an icon on phones, where it shares a
// row with a picker or search box. The current choice is ticked.
export function SortMenu<K extends string>({ value, options, onChange }: SortMenuProps<K>) {
  const isMobile = useIsMobile()
  return (
    <DropdownMenu
      button={{
        label: isMobile ? `Sort: ${options[value]}` : options[value],
        variant: 'ghost',
        size: 'sm',
        ...(isMobile && { icon: <Icon icon={ArrowsUpDownIcon} />, isIconOnly: true }),
      }}
      hasChevron={!isMobile}
      alignment="end"
      items={(Object.keys(options) as K[]).map((option) => ({
        label: options[option],
        endContent: option === value ? <Icon icon={CheckIcon} size="sm" color="accent" /> : undefined,
        onClick: () => onChange(option),
      }))}
    />
  )
}
