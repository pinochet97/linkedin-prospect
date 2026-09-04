import { login } from './actions';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/shell/submit-button';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 py-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-base font-semibold tracking-tight">LinkedIn Prospect</h1>
            <p className="text-xs text-muted-foreground">Acesso interno.</p>
          </div>
          <form action={login} className="flex flex-col gap-4">
            <Field label="Senha">
              <Input name="password" type="password" autoFocus required autoComplete="current-password" />
            </Field>
            {error ? <p className="text-xs text-danger">Senha incorreta.</p> : null}
            <SubmitButton className="w-full">Entrar</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
