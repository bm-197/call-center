import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PhoneNumber = {
  id: string;
  organizationId: string;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  number: string;
  friendlyName: string | null;
  provider: 'ethiotelecom' | 'twilio';
  capabilities: Record<string, boolean> | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

export type PhoneNumberInput = {
  number: string;
  friendlyName?: string | null;
  agentId?: string | null;
  provider?: 'ethiotelecom' | 'twilio';
  status?: 'active' | 'inactive';
};

export const phoneKeys = {
  all: ['phone-numbers'] as const,
  list: () => [...phoneKeys.all, 'list'] as const,
};

export function usePhoneNumbers() {
  return useQuery({
    queryKey: phoneKeys.list(),
    queryFn: () => api<PhoneNumber[]>('/api/phone-numbers'),
  });
}

export function useCreatePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PhoneNumberInput) =>
      api<PhoneNumber>('/api/phone-numbers', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneKeys.all }),
  });
}

export function useUpdatePhoneNumber(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<PhoneNumberInput>) =>
      api<PhoneNumber>(`/api/phone-numbers/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneKeys.all }),
  });
}

export function useDeletePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/phone-numbers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneKeys.all }),
  });
}
