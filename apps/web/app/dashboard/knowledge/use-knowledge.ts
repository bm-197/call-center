import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type KnowledgeSource = {
  id: string;
  organizationId: string;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  name: string;
  description: string | null;
  language: 'am' | 'en';
  sourceType: 'text' | 'faq' | 'url' | 'file';
  sourceContent: string | null;
  sourceUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeInput = {
  name: string;
  description?: string | null;
  language?: 'am' | 'en';
  sourceType?: 'text' | 'faq';
  sourceContent: string;
  agentId?: string | null;
};

export type KnowledgeUpdate = Partial<KnowledgeInput>;

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  list: () => [...knowledgeKeys.all, 'list'] as const,
  detail: (id: string) => [...knowledgeKeys.all, 'detail', id] as const,
};

export function useKnowledgeSources() {
  return useQuery({
    queryKey: knowledgeKeys.list(),
    queryFn: () => api<KnowledgeSource[]>('/api/knowledge-base'),
  });
}

export function useKnowledgeSource(id: string | undefined) {
  return useQuery({
    queryKey: knowledgeKeys.detail(id ?? ''),
    queryFn: () => api<KnowledgeSource>(`/api/knowledge-base/${id}`),
    enabled: !!id,
  });
}

export function useCreateKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KnowledgeInput) =>
      api<KnowledgeSource>('/api/knowledge-base', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeKeys.all }),
  });
}

export function useUpdateKnowledge(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KnowledgeUpdate) =>
      api<KnowledgeSource>(`/api/knowledge-base/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.all });
      qc.invalidateQueries({ queryKey: knowledgeKeys.detail(id) });
    },
  });
}

export function useReindexKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<KnowledgeSource>(`/api/knowledge-base/${id}/reindex`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeKeys.all }),
  });
}

export type KnowledgeUploadInput = {
  file: File;
  name?: string;
  description?: string | null;
  language?: 'am' | 'en';
  agentId?: string | null;
};

export function useUploadKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KnowledgeUploadInput) => {
      const fd = new FormData();
      fd.append('file', input.file);
      if (input.name) fd.append('name', input.name);
      if (input.description) fd.append('description', input.description);
      if (input.language) fd.append('language', input.language);
      if (input.agentId) fd.append('agentId', input.agentId);
      return api<KnowledgeSource>('/api/knowledge-base/upload', {
        method: 'POST',
        body: fd,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeKeys.all }),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/knowledge-base/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeKeys.all }),
  });
}
