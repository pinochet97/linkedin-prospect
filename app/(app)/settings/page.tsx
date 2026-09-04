import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/stat';
import { Badge } from '@/components/ui/badge';
import { SettingsForm } from '@/components/settings-form';
import { getSettings } from '@/lib/db/repositories/settings';
import { FEATURE_FLAG_KEYS, getConfig, isAiMocked } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getSettings();
  const config = getConfig();

  return (
    <>
      <PageHeader title="Configurações" description="Perfil de comunicação e estado da automação." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SettingsForm settings={settings} />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Ambiente</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={config.DRY_RUN ? 'warning' : 'success'}>
                {config.DRY_RUN ? 'DRY_RUN ativo' : 'DRY_RUN desligado'}
              </Badge>
              <Badge tone={config.LINKEDIN_ADAPTER === 'real' ? 'info' : 'neutral'}>
                adapter: {config.LINKEDIN_ADAPTER}
              </Badge>
              <Badge tone={isAiMocked() ? 'neutral' : 'info'}>IA: {isAiMocked() ? 'mock' : config.OPENAI_MODEL}</Badge>
              <Badge tone={settings.automation_paused ? 'danger' : 'success'}>
                {settings.automation_paused ? 'automação pausada' : 'automação liberada'}
              </Badge>
            </div>

            <div className="border-t pt-3">
              <p className="mb-1.5 text-xs text-muted-foreground">Feature flags</p>
              <div className="flex flex-wrap gap-1.5">
                {FEATURE_FLAG_KEYS.map((flag) => (
                  <Badge key={flag} tone={config[flag] ? 'success' : 'neutral'}>
                    {flag.replace('ENABLE_', '').toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="border-t pt-3 text-xs text-muted-foreground">
              <p>Ritmo: até {config.ACTIONS_PER_HOUR} ações/hora.</p>
              <p>Verificação de aceite a cada {config.CONNECTION_CHECK_INTERVAL_HOURS}h.</p>
              <p>Convite expira em {config.CONNECTION_EXPIRE_DAYS} dias.</p>
              <p className="mt-2">Essas opções vêm do arquivo .env — mude lá e reinicie o worker.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
