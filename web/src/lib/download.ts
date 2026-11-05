// Starts a browser download of a URL the server has presigned as an attachment (S3 sends
// `Content-Disposition: attachment`), so the browser saves the file and the app stays where
// it is. A plain navigation rather than fetch + blob: no CORS needed, no file held in memory,
// and it works for large files. Its own module so tests can stand in for it.
export function startDownload(url: string): void {
  window.location.assign(url)
}
