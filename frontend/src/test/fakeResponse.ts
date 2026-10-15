/**
 * Minimal stand-in for a `fetch` Response, exposing only what the API client
 * reads (`ok`, `status`, `text()`), so tests don't depend on a full fetch stack.
 */
export function fakeResponse(status: number, text = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as Response
}

export function jsonResponse(body: unknown, status = 200): Response {
  return fakeResponse(status, body === undefined ? '' : JSON.stringify(body))
}
