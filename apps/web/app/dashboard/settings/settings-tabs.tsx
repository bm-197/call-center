'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrgSettings } from './org-settings';
import { AccountSettings } from './account-settings';

type Org = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

type User = {
  id: string;
  name: string | null;
  email: string;
};

export function SettingsTabs({
  initialOrg,
  initialUser,
}: {
  initialOrg: Org;
  initialUser: User;
}) {
  return (
    <Tabs defaultValue="organization" className="space-y-6">
      <TabsList>
        <TabsTrigger value="organization">Organization</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
      </TabsList>
      <TabsContent value="organization" className="space-y-6">
        <OrgSettings initial={initialOrg} />
      </TabsContent>
      <TabsContent value="account" className="space-y-6">
        <AccountSettings initial={initialUser} />
      </TabsContent>
    </Tabs>
  );
}
