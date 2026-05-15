import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-auth';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) redirect('/sign-in');

  return <DashboardClient firstName={session.user.name?.split(' ')[0]} />;
}
