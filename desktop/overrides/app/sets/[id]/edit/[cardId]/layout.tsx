// Desktop build only (swapped in by scripts/desktop.mjs): built once for the placeholder card id "_"
export function generateStaticParams() {
  return [{ cardId: '_' }]
}

export default function DesktopCardLayout({ children }: { children: React.ReactNode }) {
  return children
}
