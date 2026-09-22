import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

// Extracts text from a PDF on native (iOS/Android) by running pdf.js inside a
// hidden WebView — pdf.js is browser-only and crashes if imported directly
// into React Native's JS engine, but a WebView is a real browser engine
// (WKWebView / Chromium), so it works there exactly as it does on the web.
//
// Two native WebView quirks this works around:
//  - A WebView sized 0x0 often doesn't actually load/run its content on iOS,
//    so it's given a real (but invisible, off-screen) 1x1 size instead.
//  - postMessage calls sent before the page's scripts finish loading are
//    silently dropped, so the page signals "ready" once pdf.js is loaded,
//    and extraction requests are queued until then.
const PDF_EXTRACTOR_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';

  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function extract(base64) {
    try {
      const data = base64ToUint8Array(base64);
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\\n';
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, text: fullText }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
    }
  }

  document.addEventListener('message', (e) => extract(e.data));
  window.addEventListener('message', (e) => extract(e.data));
  window.ReactNativeWebView.postMessage(JSON.stringify({ ready: true }));
</script>
</body>
</html>
`;

export interface PdfTextExtractorHandle {
  extractText(base64: string): Promise<string>;
}

const EXTRACTION_TIMEOUT_MS = 30000;

const PdfTextExtractorWebView = forwardRef<PdfTextExtractorHandle>((_props, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pendingRef = useRef<{ resolve: (text: string) => void; reject: (err: Error) => void } | null>(null);
  const readyRef = useRef(false);
  const queuedBase64Ref = useRef<string | null>(null);

  const sendIfReady = (base64: string) => {
    if (readyRef.current) {
      webviewRef.current?.postMessage(base64);
    } else {
      queuedBase64Ref.current = base64;
    }
  };

  useImperativeHandle(ref, () => ({
    extractText(base64: string) {
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pendingRef.current) {
            pendingRef.current = null;
            reject(new Error('PDF extraction timed out. Check your internet connection and try again.'));
          }
        }, EXTRACTION_TIMEOUT_MS);

        pendingRef.current = {
          resolve: (text) => { clearTimeout(timeout); resolve(text); },
          reject: (err) => { clearTimeout(timeout); reject(err); },
        };
        sendIfReady(base64);
      });
    },
  }));

  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', top: -1000 }}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: PDF_EXTRACTOR_HTML }}
        onMessage={(event) => {
          let payload: any;
          try {
            payload = JSON.parse(event.nativeEvent.data);
          } catch {
            return;
          }

          if (payload.ready) {
            readyRef.current = true;
            if (queuedBase64Ref.current) {
              webviewRef.current?.postMessage(queuedBase64Ref.current);
              queuedBase64Ref.current = null;
            }
            return;
          }

          const pending = pendingRef.current;
          pendingRef.current = null;
          if (!pending) return;
          if (payload.ok) pending.resolve(payload.text);
          else pending.reject(new Error(payload.error || 'PDF extraction failed'));
        }}
      />
    </View>
  );
});

export default PdfTextExtractorWebView;
