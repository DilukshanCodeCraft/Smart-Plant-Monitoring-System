export function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read media file.'));
    reader.readAsDataURL(blob);
  });
}

export function splitDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return {
      base64: '',
      mimeType: 'application/octet-stream'
    };
  }

  const separatorIndex = dataUrl.indexOf(',');

  if (separatorIndex === -1) {
    return {
      base64: dataUrl,
      mimeType: 'application/octet-stream'
    };
  }

  const header = dataUrl.slice(0, separatorIndex);
  const mimeTypeMatch = header.match(/^data:(.*?);base64$/i);

  return {
    base64: dataUrl.slice(separatorIndex + 1),
    mimeType: mimeTypeMatch?.[1] || 'application/octet-stream'
  };
}

export async function blobToBase64Payload(blob) {
  const dataUrl = await readBlobAsDataUrl(blob);
  return splitDataUrl(dataUrl);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatTimeOfDay(value) {
  if (!value) {
    return 'Unknown time';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function groupFilesByDay(files) {
  const groups = new Map();

  for (const file of files) {
    const date = new Date(file.mtime);
    const key = date.toISOString().slice(0, 10);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: date.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }),
        items: []
      });
    }

    groups.get(key).items.push(file);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => new Date(right.mtime).getTime() - new Date(left.mtime).getTime())
    }))
    .sort((left, right) => new Date(right.key).getTime() - new Date(left.key).getTime());
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function dataUrlToFile(dataUrl, filename = `capture-${Date.now()}.jpg`) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File([blob], filename, {
    type: blob.type || 'image/jpeg'
  });
}