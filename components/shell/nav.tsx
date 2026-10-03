'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Inbox, LayoutDashboard, Megaphone, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campanhas', icon: Megaphone },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/activity', label: 'Atividade', icon: Activity },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-surface-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
