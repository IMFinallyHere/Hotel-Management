import api from '../api/client';
import { notifyError } from '../api/notify';

const blobUrlCache = new Map();
const inFlight = new Map();

function fetchBlobUrl(fileUrl) {
  if (blobUrlCache.has(fileUrl)) return Promise.resolve(blobUrlCache.get(fileUrl));

  let promise = inFlight.get(fileUrl);
  if (!promise) {
    promise = api.get(fileUrl, { responseType: 'blob' })
      .then((res) => {
        const blobUrl = URL.createObjectURL(res.data);
        blobUrlCache.set(fileUrl, blobUrl);
        return blobUrl;
      })
      .finally(() => inFlight.delete(fileUrl));
    inFlight.set(fileUrl, promise);
  }
  return promise;
}

export function openAttachment(fileUrl) {
  // Open the tab synchronously, inside the click handler, so browsers don't
  // treat it as a popup once the (async) file fetch resolves later. Can't
  // pass noopener/noreferrer here - those make window.open() return null,
  // and we need the handle to navigate the tab once the blob is ready.
  const tab = window.open('', '_blank');

  fetchBlobUrl(fileUrl)
    .then((blobUrl) => {
      if (tab) tab.location.href = blobUrl;
    })
    .catch(() => {
      if (tab) tab.close();
      notifyError('Could not load attachment.');
    });
}
