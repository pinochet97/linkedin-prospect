import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { getSettings } from '@/lib/db/repositories/settings';
import { getConfig } from '@/lib/config';
import { Nav } from '@/components/shell/nav';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { KillSwitch } from '@/components/shell/kill-switch';
import { SubmitButton } from '@/components/shell/submit-button';
import { logout } from '@/app/(app)/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const settings = await getSettings();
  const config = getConfig();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col justify-between border-r bg-surface px-3 py-4">
        <div className="flex flex-col gap-6">
          <Link href="/dashboard" className="px-3 text-sm font-semibold tracking-tight">
            LinkedIn Prospect
          </Link>
          <Nav />
        </div>
        <div className="flex flex-col gap-3 px-1">
          <div className="flex flex-wrap gap-1.5 px-2 text-[10px] text-muted-foreground">
            {config.DRY_RUN ? <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning">DRY RUN</span> : null}
            <span className="rounded bg-surface-muted px-1.5 py-0.5">
              {config.LINKEDIN_ADAPTER === 'mock' ? 'adapter: mock' : 'adapter: real'}
            </span>
          </div>
          <KillSwitch paused={settings.automation_paused} />
          <div className="flex items-center justify-between">
            <form action={logout}>
              <SubmitButton variant="ghost" size="sm">
                Sair
              </SubmitButton>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        {settings.automation_paused ? (
          <div className="flex items-center gap-2 border-b bg-warning/10 px-8 py-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            Automação pausada globalmente. {settings.paused_reason}
          </div>
        ) : null}
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
