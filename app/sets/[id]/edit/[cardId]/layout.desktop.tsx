// Desktop build only: built once for the placeholder card id "_" (see app/sets/[id]/layout.desktop.tsx)
export function generateStaticParams() {
  return [{ cardId: '_' }]
}

export default function DesktopCardLayout({ children }: { children: React.ReactNode }) {
  return children
}
