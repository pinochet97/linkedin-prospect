'use client';

import { useActionState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/shell/submit-button';
import type { SettingsRow } from '@/lib/db/types';
import { saveSettingsAction, type SettingsFormState } from '@/app/(app)/settings/actions';

export function SettingsForm({ settings }: { settings: SettingsRow }) {
  const [state, formAction] = useActionState<SettingsFormState, FormData>(saveSettingsAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Perfil de comunicação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Seu nome">
              <Input name="my_name" defaultValue={settings.my_name} placeholder="Kaio" />
            </Field>
            <Field label="Sua empresa">
              <Input name="my_company" defaultValue={settings.my_company} />
            </Field>
            <Field label="Seu cargo">
              <Input name="my_role" defaultValue={settings.my_role} />
            </Field>
          </div>

          <Field label="O que você faz" hint="Entra na geração das mensagens.">
            <Textarea
              name="what_i_do"
              defaultValue={settings.what_i_do}
              rows={3}
              placeholder="Atuo próximo a founders de startups, principalmente em M&A, governança financeira, FP&A e tecnologia."
            />
          </Field>

          <Field label="Público-alvo">
            <Textarea name="target_audience" defaultValue={settings.target_audience} rows={2} />
          </Field>

          <Field label="Tom de voz">
            <Input name="tone_of_voice" defaultValue={settings.tone_of_voice} placeholder="Informal, direto, curto, natural." />
          </Field>

          <Field label="O que evitar" hint="Uma regra por linha. Vai direto para o prompt da IA.">
            <Textarea
              name="things_to_avoid"
              defaultValue={settings.things_to_avoid}
              rows={6}
              placeholder={'linguagem comercial agressiva\n"solução inovadora"\n"sinergia"\n"gostaria de apresentar"\ntextos longos\nfrases genéricas\ncara de IA'}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton>Salvar</SubmitButton>
        {state.saved ? <span className="text-xs text-success">Salvo.</span> : null}
        {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
