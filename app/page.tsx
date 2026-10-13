import { redirect } from 'next/navigation';
import { hasPageSession } from '@/lib/auth';
import Studio from '@/components/Studio';

export default async function Home() {
  if (!(await hasPageSession())) redirect('/login');
  return <Studio mock={process.env.GENERATION_PROVIDER === 'mock'} />;
}
