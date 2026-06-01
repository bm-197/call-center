import { AuthPageShell } from '@/components/auth-page-shell';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthPageShell>{children}</AuthPageShell>;
}
