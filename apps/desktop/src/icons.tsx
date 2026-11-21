import type { SVGProps } from 'react'
import * as R from '@radix-ui/react-icons'

type P = { size?: number; className?: string }
type RadixIcon = typeof R.PlusIcon

const wrap = (I: RadixIcon) => ({ size = 15, className }: P) => (
  <I width={size} height={size} className={className} aria-hidden />
)

export const IconSidebar = wrap(R.ViewVerticalIcon)
export const IconArrowLeft = wrap(R.ArrowLeftIcon)
export const IconArrowRight = wrap(R.ArrowRightIcon)
export const IconPlus = wrap(R.PlusIcon)
export const IconClose = wrap(R.Cross2Icon)
export const IconHome = wrap(R.HomeIcon)
export const IconCompose = wrap(R.Pencil2Icon)
export const IconChat = wrap(R.ChatBubbleIcon)
export const IconClock = wrap(R.ClockIcon)
export const IconSearch = wrap(R.MagnifyingGlassIcon)
export const IconFile = wrap(R.FileTextIcon)
export const IconPencil = wrap(R.Pencil1Icon)
export const IconTerminal = wrap(R.CodeIcon)
export const IconChevronDown = wrap(R.ChevronDownIcon)
export const IconChevronRight = wrap(R.ChevronRightIcon)
export const IconArrowUp = wrap(R.ArrowUpIcon)
export const IconStop = wrap(R.StopIcon)
export const IconShield = wrap(R.LockOpen1Icon)
export const IconRepo = wrap(R.ArchiveIcon)
export const IconMonitor = wrap(R.DesktopIcon)
export const IconCloud = wrap(R.GlobeIcon)
export const IconBolt = wrap(R.LightningBoltIcon)
export const IconCopy = wrap(R.CopyIcon)
export const IconCheck = wrap(R.CheckIcon)
export const IconSelector = wrap(R.CaretSortIcon)
export const IconBrain = wrap(R.ReaderIcon)
export const IconDots = wrap(R.DotsHorizontalIcon)
export const IconCube = wrap(R.CubeIcon)

export const IconBranch = ({ size = 15, ...rest }: P & SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth={1} aria-hidden {...rest}>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="11.5" r="1.5" />
    <circle cx="10.5" cy="5.5" r="1.5" />
    <path d="M4.5 5v5M10.5 7c0 2.5-6 1.5-6 3" />
  </svg>
)

export const IconLaptop = wrap(R.LaptopIcon)

const line = (size: number) => ({ width: size, height: size, viewBox: '0 0 15 15', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true })

export const IconSlashBox = ({ size = 15, className }: P) => (
  <svg {...line(size)} className={className}>
    <rect x="2.5" y="2.5" width="10" height="10" rx="1.5" />
    <path d="M9 5 6 10" />
  </svg>
)
export const IconMic = ({ size = 15, className }: P) => (
  <svg {...line(size)} className={className}>
    <rect x="5.5" y="1.5" width="4" height="7.5" rx="2" />
    <path d="M3.5 7a4 4 0 0 0 8 0M7.5 11v2.5" />
  </svg>
)
export const IconFolder = ({ size = 15, className }: P) => (
  <svg {...line(size)} className={className}>
    <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.3 1.5h5.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1Z" />
  </svg>
)

export const IconMixer = wrap(R.MixerHorizontalIcon)

export const IconEye = wrap(R.EyeOpenIcon)
export const IconLockOpen = wrap(R.LockOpen2Icon)
