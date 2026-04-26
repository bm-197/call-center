import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Contact = {
  id: string;
  organizationId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string;
  countryCode: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber: string;
  countryCode?: string;
  notes?: string | null;
};

export const contactsKeys = {
  all: ['contacts'] as const,
  list: () => [...contactsKeys.all, 'list'] as const,
};

export function useContacts() {
  return useQuery({
    queryKey: contactsKeys.list(),
    queryFn: () => api<Contact[]>('/api/contacts'),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput) =>
      api<Contact>('/api/contacts', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ContactInput>) =>
      api<Contact>(`/api/contacts/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}
