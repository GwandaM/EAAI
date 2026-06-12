/** Shared HTTP helper for the upstream business-API tool factories. */
export async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`${resp.status} from ${url}: ${body}`);
  }
  return resp.json();
}
