'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui/button';

/** Botão de formulário que desabilita sozinho enquanto a server action roda. */
export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? 'Aguarde…' : children}
    </Button>
  );
}
