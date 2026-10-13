import { redirect } from 'next/navigation';
import { hasPageSession } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage() {
  if (await hasPageSession()) redirect('/');
  return <LoginForm />;
}
