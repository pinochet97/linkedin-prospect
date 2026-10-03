'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/shell/submit-button';
import { buttonVariants } from '@/components/ui/button';
import type { CampaignRow, CampaignStepDbRow } from '@/lib/db/types';
import { DEFAULT_STEPS, STEP_LABELS } from '@/lib/engine/sequence';
import type { FormState } from '@/app/(app)/campaigns/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function CampaignForm({
  action,
  campaign,
  steps,
  submitLabel,
}: {
  action: Action;
  campaign?: CampaignRow;
  steps?: CampaignStepDbRow[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  const stepValue = (type: string) => {
    const configured = steps?.find((step) => step.step_type === type);
    const fallback = DEFAULT_STEPS.find((step) => step.step_type === type)!;
    return configured ?? fallback;
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Campanha</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Nome">
            <Input name="name" defaultValue={campaign?.name ?? ''} placeholder="Founders SaaS Brasil" required />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Busca (texto)" hint="Ex.: Founder SaaS Brasil. O sistema monta a URL de pesquisa.">
              <Input name="search_query" defaultValue={campaign?.search_query ?? ''} placeholder="Founder SaaS Brasil" />
            </Field>
            <Field label="URL de pesquisa do LinkedIn" hint="Se preenchida, tem prioridade sobre a busca por texto.">
              <Input
                name="linkedin_search_url"
                defaultValue={campaign?.linkedin_search_url ?? ''}
                placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
              />
            </Field>
          </div>

          <Field
            label="ICP (perfil ideal)"
            hint="Usado pela IA para qualificar. Ex.: Founders, CEOs ou co-founders de SaaS B2B brasileiro."
          >
            <Textarea
              name="icp_description"
              defaultValue={campaign?.icp_description ?? ''}
              placeholder="Founders, CEOs ou co-founders de empresas SaaS B2B brasileiras."
              rows={3}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limites e qualificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Score mínimo" hint="0 a 100.">
            <Input
              name="qualification_threshold"
              type="number"
              min={0}
              max={100}
              defaultValue={campaign?.qualification_threshold ?? 60}
            />
          </Field>
          <Field label="Limite da nota (caracteres)" hint="O LinkedIn corta em ~200 na conta gratuita.">
            <Input
              name="connection_note_max_chars"
              type="number"
              min={50}
              max={300}
              defaultValue={campaign?.connection_note_max_chars ?? 200}
            />
          </Field>
          <Field label="Leads a coletar" hint="Alvo da descoberta.">
            <Input name="discovery_target" type="number" min={1} max={500} defaultValue={campaign?.discovery_target ?? 50} />
          </Field>
          <Field label="Convites por dia">
            <Input
              name="daily_connection_limit"
              type="number"
              min={1}
              max={100}
              defaultValue={campaign?.daily_connection_limit ?? 20}
            />
          </Field>
          <Field label="Mensagens por dia">
            <Input
              name="daily_message_limit"
              type="number"
              min={1}
              max={200}
              defaultValue={campaign?.daily_message_limit ?? 30}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sequência</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {DEFAULT_STEPS.map((step) => {
            const current = stepValue(step.step_type);
            const required = step.step_type === 'connection_request';
            return (
              <div key={step.step_type} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5">
                <span className="w-6 text-xs text-muted-foreground">{step.step_order}</span>
                <span className="w-44 text-sm">{STEP_LABELS[step.step_type]}</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  esperar
                  <Input
                    name={`step_${step.step_type}_delay`}
                    type="number"
                    min={0}
                    max={720}
                    defaultValue={current.delay_hours}
                    className="h-8 w-20"
                    disabled={required}
                  />
                  horas
                </label>
                <label className="ml-auto flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name={`step_${step.step_type}_enabled`}
                    defaultChecked={required ? true : current.enabled}
                    disabled={required}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {required ? 'sempre ativo' : 'ativo'}
                </label>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            O passo &ldquo;esperar aceite&rdquo; é implícito: o sistema só avança para a mensagem depois de detectar a
            conexão.
          </p>
        </CardContent>
      </Card>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <div className="flex gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link
          href={campaign ? `/campaigns/${campaign.id}` : '/campaigns'}
          className={buttonVariants({ variant: 'ghost' })}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
