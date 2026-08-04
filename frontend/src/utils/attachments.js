import api from '../api/client';

export async function openAttachment(fileUrl) {
  const res = await api.get(fileUrl, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
