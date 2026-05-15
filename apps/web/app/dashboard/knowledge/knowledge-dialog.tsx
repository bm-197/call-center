'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { CloudUploadIcon, File02Icon } from '@hugeicons/core-free-icons';
import {
  type KnowledgeInput,
  type KnowledgeSource,
  useCreateKnowledge,
  useUpdateKnowledge,
  useUploadKnowledge,
} from './use-knowledge';
import { useAgents } from '../agents/use-agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const ALL_AGENTS = '__all_agents__';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function KnowledgeDialog({
  source,
  onClose,
}: {
  source: KnowledgeSource | 'new';
  onClose: () => void;
}) {
  const isNew = source === 'new';

  // For edit mode, only show the same kind it was created as.
  const initialMode: 'text' | 'pdf' =
    !isNew && source.sourceType === 'file' ? 'pdf' : 'text';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'Add knowledge source' : 'Edit knowledge source'}
          </DialogTitle>
          <DialogDescription>
            Paste text or upload a PDF in Amharic or English. Content is
            normalized, chunked, and embedded for retrieval during calls.
          </DialogDescription>
        </DialogHeader>

        {isNew ? (
          <Tabs defaultValue={initialMode} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">Paste text</TabsTrigger>
              <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
            </TabsList>
            <TabsContent value="text">
              <TextForm onClose={onClose} />
            </TabsContent>
            <TabsContent value="pdf">
              <PdfForm onClose={onClose} />
            </TabsContent>
          </Tabs>
        ) : source.sourceType === 'file' ? (
          <FileEditView source={source} onClose={onClose} />
        ) : (
          <TextForm source={source} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Text form (create + edit) ───────────────────────────────────────────────

function TextForm({
  source,
  onClose,
}: {
  source?: KnowledgeSource;
  onClose: () => void;
}) {
  const isEdit = !!source;
  const create = useCreateKnowledge();
  const update = useUpdateKnowledge(source?.id ?? '');
  const { data: agents } = useAgents();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<KnowledgeInput>(
    isEdit
      ? {
          name: source.name,
          description: source.description ?? '',
          language: source.language,
          sourceType:
            source.sourceType === 'file'
              ? 'text'
              : (source.sourceType as 'text' | 'faq'),
          sourceContent: source.sourceContent ?? '',
          agentId: source.agentId,
        }
      : {
          name: '',
          description: '',
          language: 'am',
          sourceType: 'text',
          sourceContent: '',
          agentId: null,
        },
  );

  function update_<K extends keyof KnowledgeInput>(
    key: K,
    value: KnowledgeInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync(form);
        toast.success('Knowledge updated');
      } else {
        await create.mutateAsync(form);
        toast.success('Knowledge added — embedding in progress');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SharedFields
        form={form}
        update={update_}
        agents={agents ?? []}
        pending={pending}
      />

      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea
          id="content"
          required
          rows={18}
          value={form.sourceContent}
          onChange={(e) => update_('sourceContent', e.target.value)}
          placeholder={
            form.language === 'am'
              ? 'ይህ ጥያቄን ለመመለስ የሚያገለግል መረጃ ነው።'
              : 'Paste your FAQ, policies, or any reference text here.'
          }
          disabled={pending}
          className="max-h-[60vh] min-h-[420px] resize-y overflow-y-auto font-mono text-sm leading-relaxed"
        />
        <p className="text-muted-foreground text-xs">
          {form.sourceContent.length.toLocaleString()} characters
          {form.sourceContent.length > 200_000 && ' — too long, max 200,000'}
        </p>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            pending ||
            !form.name ||
            !form.sourceContent ||
            form.sourceContent.length > 200_000
          }
        >
          {pending ? 'Indexing…' : isEdit ? 'Save changes' : 'Add and index'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── PDF upload form (create only) ───────────────────────────────────────────

function PdfForm({ onClose }: { onClose: () => void }) {
  const upload = useUploadKnowledge();
  const { data: agents } = useAgents();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<'am' | 'en'>('am');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const pending = upload.isPending;
  const overSize = file && file.size > MAX_PDF_BYTES;

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted right now.');
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.pdf$/i, ''));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    try {
      await upload.mutateAsync({
        file,
        name: name || file.name,
        description: description || null,
        language,
        agentId,
      });
      toast.success('PDF uploaded — embedding in progress');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-muted-foreground/60',
          file && 'border-primary/40 bg-primary/5',
        )}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={pending}
        />
        {file ? (
          <>
            <HugeiconsIcon icon={File02Icon} size={28} strokeWidth={1.4} />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{file.name}</div>
              <div className="text-muted-foreground text-xs">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              Choose another file
            </button>
          </>
        ) : (
          <>
            <HugeiconsIcon
              icon={CloudUploadIcon}
              size={28}
              strokeWidth={1.4}
              className="text-muted-foreground"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                Click to upload or drag a PDF
              </div>
              <div className="text-muted-foreground text-xs">
                PDF files up to 25 MB
              </div>
            </div>
          </>
        )}
      </div>

      {overSize && (
        <p className="text-destructive text-xs">
          File is too large ({(file!.size / 1024 / 1024).toFixed(1)} MB). Max 25
          MB.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pdf-name">Name</Label>
          <Input
            id="pdf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer FAQ"
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pdf-language">Language</Label>
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as 'am' | 'en')}
            disabled={pending}
          >
            <SelectTrigger id="pdf-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="am">Amharic (አማርኛ)</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pdf-description">Description (optional)</Label>
        <Input
          id="pdf-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this document covers"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pdf-agentId">Scope</Label>
        <Select
          value={agentId ?? ALL_AGENTS}
          onValueChange={(v) => setAgentId(v === ALL_AGENTS ? null : v)}
          disabled={pending}
        >
          <SelectTrigger id="pdf-agentId">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_AGENTS}>All agents (org-wide)</SelectItem>
            {(agents ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending || !file || !!overSize || !name}
        >
          {pending ? 'Uploading & indexing…' : 'Upload and index'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Edit view for an already-uploaded file (metadata only) ──────────────────

function FileEditView({
  source,
  onClose,
}: {
  source: KnowledgeSource;
  onClose: () => void;
}) {
  const update = useUpdateKnowledge(source.id);
  const { data: agents } = useAgents();
  const [name, setName] = useState(source.name);
  const [description, setDescription] = useState(source.description ?? '');
  const [language, setLanguage] = useState<'am' | 'en'>(source.language);
  const [agentId, setAgentId] = useState<string | null>(source.agentId);
  const pending = update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        name,
        description: description || null,
        language,
        agentId,
      });
      toast.success('Knowledge updated');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="bg-muted/40 flex items-center gap-3 rounded-md border p-3">
        <HugeiconsIcon icon={File02Icon} size={22} strokeWidth={1.4} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {source.fileName ?? 'Unknown'}
          </div>
          <div className="text-muted-foreground text-xs">
            {source.fileSize
              ? `${(source.fileSize / 1024 / 1024).toFixed(2)} MB`
              : ''}{' '}
            · {source.chunkCount} chunks indexed
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="file-name">Name</Label>
          <Input
            id="file-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-language">Language</Label>
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as 'am' | 'en')}
            disabled={pending}
          >
            <SelectTrigger id="file-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="am">Amharic (አማርኛ)</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file-desc">Description</Label>
        <Input
          id="file-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="file-agentId">Scope</Label>
        <Select
          value={agentId ?? ALL_AGENTS}
          onValueChange={(v) => setAgentId(v === ALL_AGENTS ? null : v)}
          disabled={pending}
        >
          <SelectTrigger id="file-agentId">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_AGENTS}>All agents (org-wide)</SelectItem>
            {(agents ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Shared form fields ──────────────────────────────────────────────────────

function SharedFields({
  form,
  update,
  agents,
  pending,
}: {
  form: KnowledgeInput;
  update: <K extends keyof KnowledgeInput>(
    key: K,
    value: KnowledgeInput[K],
  ) => void;
  agents: { id: string; name: string }[];
  pending: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Customer support FAQ"
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sourceType">Type</Label>
          <Select
            value={form.sourceType ?? 'text'}
            onValueChange={(v) => update('sourceType', v as 'text' | 'faq')}
            disabled={pending}
          >
            <SelectTrigger id="sourceType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Plain text</SelectItem>
              <SelectItem value="faq">FAQ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Input
          id="description"
          value={form.description ?? ''}
          onChange={(e) => update('description', e.target.value)}
          placeholder="What this knowledge covers"
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="language">Language</Label>
          <Select
            value={form.language ?? 'am'}
            onValueChange={(v) => update('language', v as 'am' | 'en')}
            disabled={pending}
          >
            <SelectTrigger id="language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="am">Amharic (አማርኛ)</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agentId">Scope</Label>
          <Select
            value={form.agentId ?? ALL_AGENTS}
            onValueChange={(v) =>
              update('agentId', v === ALL_AGENTS ? null : v)
            }
            disabled={pending}
          >
            <SelectTrigger id="agentId">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENTS}>All agents (org-wide)</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
