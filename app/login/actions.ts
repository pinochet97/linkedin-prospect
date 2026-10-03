'use server';

import { redirect } from 'next/navigation';
import { checkPassword, startSession } from '@/lib/auth';

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (!checkPassword(password)) {
    redirect('/login?error=1');
  }
  await startSession();
  redirect('/dashboard');
}
