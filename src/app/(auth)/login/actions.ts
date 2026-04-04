'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function loginAction(
  formData: FormData,
  callbackUrl: string
): Promise<{ error: string } | undefined> {
  try {
    await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'E-mail ou senha incorretos.' };
        case 'CallbackRouteError':
          // Rate limit error vem como cause
          const message = (error as any)?.cause?.err?.message;
          if (message?.includes('Muitas tentativas')) {
            return { error: message };
          }
          return { error: 'E-mail ou senha incorretos.' };
        default:
          return { error: 'Erro ao fazer login. Tente novamente.' };
      }
    }
    throw error; // NextAuth redirect throws (não é erro real)
  }
}
