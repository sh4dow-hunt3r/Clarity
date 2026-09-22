// expo-document-picker's web implementation hides its <input type="file"> with
// display:none. Chrome has a known bug where that triggers a false 'cancel' event
// right after a real file selection, so getDocumentAsync() reports canceled:true
// even when the user picked a file. Avoiding display:none (using off-screen
// positioning instead) sidesteps the bug; the grace period after 'cancel' guards
// against it further in case 'change' is just slow to arrive.
export function pickFileWeb(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.top = '0';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (document.body.contains(input)) document.body.removeChild(input);
    };

    input.addEventListener('change', () => {
      if (settled) return;
      settled = true;
      const file = input.files && input.files.length > 0 ? input.files[0] : null;
      cleanup();
      resolve(file);
    });

    input.addEventListener('cancel', () => {
      setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, 300);
    });

    input.click();
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file as text.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file as base64.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.split(',')[1] ?? ''); // strip the "data:...;base64," prefix
    };
    reader.readAsDataURL(file);
  });
}
