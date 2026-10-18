import * as fs from 'fs';
import * as path from 'path';
import { APIRequestContext, expect } from '@playwright/test';

// PUT a file directly to the dropbox bucket via a presigned URL (no Bearer header —
// the presigned query string is the auth; sending both makes S3 reject the request).
// Resolves with the staged key the server assigned ({username}/{key}) — send that
// as audioKey/imageKey, not the requested key.
export async function putToDropbox(
  apiContext: APIRequestContext,
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const presign = await apiContext.get(`/buckets/dropbox?key=${encodeURIComponent(key)}`);
  expect(presign.status()).toBe(200);
  const { url, key: stagedKey } = await presign.json();

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(body),
  });
  expect(putRes.status).toBe(200);
  return stagedKey;
}

export function readImageFixture(): Buffer {
  return fs.readFileSync(path.join(__dirname, 'assets', 'image.jpg'));
}
