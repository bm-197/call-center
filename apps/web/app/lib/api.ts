export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

type ApiInit = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const isFormData = body instanceof FormData;

  const res = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: {
      ...(body !== undefined && !isFormData
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '');

  if (!res.ok) {
    const message =
      (typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) ||
      (typeof payload === 'string' && payload) ||
      res.statusText;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}
