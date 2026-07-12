import * as fs from 'fs';
import * as path from 'path';
import { APIRequestContext, expect } from '@playwright/test';

// PUT a file directly to the dropbox bucket via a presigned URL (no Bearer header —
// the presigned query string is the auth; sending both makes S3 reject the request)
export async function putToDropbox(
  apiContext: APIRequestContext,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const presign = await apiContext.get(`/buckets/dropbox?key=${encodeURIComponent(key)}`);
  expect(presign.status()).toBe(200);
  const { url } = await presign.json();

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(body),
  });
  expect(putRes.status).toBe(200);
}

export function readImageFixture(): Buffer {
  return fs.readFileSync(path.join(__dirname, 'assets', 'image.jpg'));
}
