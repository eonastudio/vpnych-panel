// The Mini App's icons: ВПНыч's own set (24px grid, 1.8 stroke), with a few more drawn the same way.
import type { ReactNode, SVGProps } from "react"

type P = SVGProps<SVGSVGElement> & { size?: number }

const Svg = ({ size = 22, children, ...rest }: P & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
)

export const IconChevronsLeft = (p: P) => <Svg {...p}><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></Svg>
export const IconDots = (p: P) => (
  <Svg {...p}><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></Svg>
)
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IconX = (p: P) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
export const IconCheck = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
export const IconCheckDouble = (p: P) => <Svg {...p}><path d="M18 7 7.5 17.5 3 13" /><path d="m22 7-9.5 10.5-1.2-1.2" /></Svg>
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
export const IconArrowRight = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
export const IconUsers = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8" r="4" /><path d="M1.5 21a7.5 7.5 0 0 1 15 0" /><path d="M16 4.2a4 4 0 0 1 0 7.6M19 14.5a7.5 7.5 0 0 1 3.5 6.5" /></Svg>
)
export const IconHistory = (p: P) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Svg>
)
export const IconHelp = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Svg>
)
export const IconLogout = (p: P) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>
)
export const IconSliders = (p: P) => (
  <Svg {...p}><path d="M4 8h9M19 8h1M4 16h1M11 16h9" /><circle cx="16" cy="8" r="2.5" /><circle cx="8" cy="16" r="2.5" /></Svg>
)
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="8" y="8" width="13" height="13" rx="2.5" /><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" /></Svg>
)
export const IconExternal = (p: P) => (
  <Svg {...p}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Svg>
)
export const IconShare = (p: P) => (
  <Svg {...p}><path d="M12 3v13" /><path d="m7 8 5-5 5 5" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></Svg>
)
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Svg>
export const IconGlobe = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></Svg>
)
export const IconHeadphones = (p: P) => (
  <Svg {...p}><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></Svg>
)
export const IconFlame = (p: P) => (
  <Svg {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.2 1.5 1.2 2.8 2.5 2.8z" /></Svg>
)
export const IconDevices = (p: P) => (
  <Svg {...p}><rect x="2" y="4" width="14" height="10" rx="2" /><path d="M6 18h6" /><rect x="15" y="9" width="7" height="12" rx="1.5" /></Svg>
)
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Svg>
)
export const IconLoader = (p: P) => <Svg {...p} className="spin"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Svg>

export const IconTelegram = ({ size = 22, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...p}>
    <circle cx="12" cy="12" r="12" fill="currentColor" />
    <path d="M5.4 11.8 16.9 7.4c.5-.2 1 .1.8.9l-2 9.3c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.3-.1l-6.6 4.1-2.8-.9c-.6-.2-.6-.6.1-.9z" fill="#0f1b24" />
  </svg>
)

// Platforms
export const IconAndroid = ({ size = 30, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M6 10.2a.9.9 0 0 0-.9.9v5a.9.9 0 0 0 1.8 0v-5a.9.9 0 0 0-.9-.9Zm12 0a.9.9 0 0 0-.9.9v5a.9.9 0 0 0 1.8 0v-5a.9.9 0 0 0-.9-.9ZM7.8 10v7.4c0 .6.4 1 1 1h.8v2.3a.9.9 0 0 0 1.8 0v-2.3h1.2v2.3a.9.9 0 0 0 1.8 0v-2.3h.8c.6 0 1-.4 1-1V10H7.8Zm7.3-4.5.9-1.4a.2.2 0 0 0-.4-.2l-.9 1.4a5.6 5.6 0 0 0-5.4 0l-.9-1.4a.2.2 0 1 0-.4.2l.9 1.4A4.4 4.4 0 0 0 7.8 9.2h8.4a4.4 4.4 0 0 0-1.1-3.7ZM10 7.8a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm4 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z" />
  </svg>
)
export const IconApple = ({ size = 30, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.400 1.200 9.800.8 1.200 1.800 2.500 3.100 2.400 1.200 0 1.700-.8 3.200-.8 1.500 0 1.900.8 3.200.8 1.300 0 2.200-1.200 3-2.400.9-1.400 1.300-2.700 1.300-2.800 0 0-2.600-1-2.700-3.900ZM14 5.400c.7-.8 1.100-1.900 1-3-1 0-2.100.6-2.800 1.400-.6.700-1.200 1.800-1 2.900 1.100.1 2.100-.5 2.800-1.300Z" />
  </svg>
)
export const IconWindows = ({ size = 30, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M3 5.6 10.4 4.6v7H3V5.6Zm0 12.8 7.4 1v-7H3v6Zm8.3 1.1L21 21v-8.7h-9.7v7.2Zm0-15 0 7.200H21V3l-9.700 1.500Z" />
  </svg>
)
export const IconTv = ({ size = 30, ...p }: P) => (
  <Svg size={size} {...p}><rect x="2" y="5" width="20" height="13" rx="2.5" /><path d="M8 21h8" /></Svg>
)
export const IconLaptop = ({ size = 30, ...p }: P) => (
  <Svg size={size} {...p}><rect x="4" y="4" width="16" height="11" rx="2" /><path d="M2 19h20" /></Svg>
)

export function PlatformIcon({ platform, size = 30 }: { platform: string; size?: number }) {
  switch (platform) {
    case "android": return <IconAndroid size={size} />
    case "ios": case "appletv": return <IconApple size={size} />
    case "macos": return <IconLaptop size={size} />
    case "windows": return <IconWindows size={size} />
    default: return <IconTv size={size} />
  }
}

// Mikan's: promo codes, docs, reissue, Stars, crypto, card, packages.
export const IconTicket = (p: P) => (
  <Svg {...p}><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></Svg>
)
export const IconBook = (p: P) => (
  <Svg {...p}><path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20" /><path d="M8 7h8M8 11h6" /></Svg>
)
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /></Svg>
)
export const IconStar = (p: P) => (
  <Svg {...p}><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8Z" /></Svg>
)
export const IconCard = (p: P) => (
  <Svg {...p}><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20M6 15h4" /></Svg>
)
export const IconLayers = (p: P) => (
  <Svg {...p}><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 12 10 5 10-5" /><path d="m2 17 10 5 10-5" /></Svg>
)
export const IconGift = (p: P) => (
  <Svg {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></Svg>
)
export const IconSwap = (p: P) => (
  <Svg {...p}><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></Svg>
)
