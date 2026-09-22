import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

// Extracts text from a PDF on native (iOS/Android) by running pdf.js inside a
// hidden WebView — pdf.js is browser-only and crashes if imported directly
// into React Native's JS engine, but a WebView is a real browser engine
// (WKWebView / Chromium), so it works there exactly as it does on the web.
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
</script>
</body>
</html>
`;

export interface PdfTextExtractorHandle {
  extractText(base64: string): Promise<string>;
}

const PdfTextExtractorWebView = forwardRef<PdfTextExtractorHandle>((_props, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pendingRef = useRef<{ resolve: (text: string) => void; reject: (err: Error) => void } | null>(null);

  useImperativeHandle(ref, () => ({
    extractText(base64: string) {
      return new Promise<string>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        webviewRef.current?.postMessage(base64);
      });
    },
  }));

  return (
    <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: PDF_EXTRACTOR_HTML }}
        onMessage={(event) => {
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (!pending) return;
          try {
            const result = JSON.parse(event.nativeEvent.data);
            if (result.ok) pending.resolve(result.text);
            else pending.reject(new Error(result.error || 'PDF extraction failed'));
          } catch (e) {
            pending.reject(new Error('Could not parse PDF extractor response'));
          }
        }}
      />
    </View>
  );
});

export default PdfTextExtractorWebView;
