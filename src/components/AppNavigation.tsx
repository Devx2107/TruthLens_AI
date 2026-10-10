import { Bell, BookOpen, History, Search } from 'lucide-react';

export type MainView = 'home' | 'history' | 'watchlist' | 'trending';

export default function AppNavigation({ active, mobileOpen, onNavigate }: { active: MainView; mobileOpen: boolean; onNavigate: (view: MainView) => void }) {
  const links = [
    ['home', 'Scanner', Search],
    ['history', 'History', History],
    ['watchlist', 'Watchlist', Bell],
    ['trending', 'Recently debunked', BookOpen],
  ] as const;
  return <aside className={`${mobileOpen ? 'block' : 'hidden'} lg:block`}>
    <nav aria-label="Main navigation" className="app-sidebar sticky top-5 flex flex-col gap-1 rounded-2xl p-3">
      {links.map(([view, label, Icon]) => <a key={view} href={view === 'home' ? '/' : `/${view}`} onClick={(event) => { event.preventDefault(); onNavigate(view); }} aria-current={active === view ? 'page' : undefined} className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active === view ? 'nav-link-active' : ''}`}><Icon className="h-4 w-4" />{label}</a>)}
      <div className="mt-5 border-t border-slate-200 px-3 pt-5 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">AI analysis can be wrong. Check the linked evidence before making important decisions.</div>
    </nav>
  </aside>;
}
