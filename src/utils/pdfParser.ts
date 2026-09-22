import { Platform } from 'react-native';
// @ts-ignore — pdfjs-dist's legacy build has no bundled RN-friendly types
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

// pdfjs-dist spawns a real Web Worker unless told otherwise, and that worker
// never loads without an explicit script URL — the getDocument() call just
// hangs forever. On web, point it at the worker script copied into public/;
// on native there's no Worker API at all, so it always falls back to
// main-thread parsing regardless of this setting.
if (Platform.OS === 'web') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

// Decodes base64 without relying on atob/Buffer, since Hermes (React Native) has neither by default.
function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    const e1 = chars.indexOf(cleaned[i]);
    const e2 = chars.indexOf(cleaned[i + 1]);
    const e3 = chars.indexOf(cleaned[i + 2]);
    const e4 = chars.indexOf(cleaned[i + 3]);

    bytes.push((e1 << 2) | (e2 >> 4));
    if (cleaned[i + 2] !== '=' && e3 !== -1) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (cleaned[i + 3] !== '=' && e4 !== -1) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new Uint8Array(bytes);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms)),
  ]);
}

export async function extractPdfText(base64: string): Promise<string> {
  const data = base64ToUint8Array(base64);
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true } as any);
  const pdf = await withTimeout(loadingTask.promise, 15000, 'pdfjs getDocument');

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }
  return fullText;
}
