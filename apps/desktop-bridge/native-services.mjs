import {mkdtemp, open, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const maxBytes = 20 * 1024 * 1024;
const types = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'};

async function attachment(file, remaining, name = path.basename(file)) {
  // A pasted file URL can name a FIFO. Verify the opened descriptor without
  // waiting for a writer, including when the path changes after copying it.
  const handle = await open(file, constants.O_RDONLY | (constants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) return null;
    if (stat.size > remaining) throw new Error('Attachments exceed 20 MB');
    const chunks = [];
    let size = 0;
    for await (const chunk of handle.createReadStream({autoClose:false})) {
      size += chunk.length;
      if (size > remaining) throw new Error('Attachments exceed 20 MB');
      chunks.push(chunk);
    }
    return {name, type:types[path.extname(name).toLowerCase()] || 'application/octet-stream',
      size, modified:stat.mtimeMs, data:Buffer.concat(chunks,size).toString('base64')};
  } finally {
    await handle.close();
  }
}

export function createNativeServices(native) {
  return {
    async clipboardFiles() {
      const directory = await mkdtemp(path.join(tmpdir(),'suffice-paste-'));
      const png = path.join(directory,'clipboard.png');
      try {
        const snapshot = await native('clipboard.snapshot', png);
        if (!Array.isArray(snapshot.files) || typeof snapshot.image !== 'boolean') throw new Error('Invalid native clipboard snapshot');
        const files = snapshot.image ? [png] : snapshot.files.slice(0,20);
        const result = [];
        let remaining = maxBytes;
        for (const file of files) {
          if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Invalid clipboard file');
          const item = await attachment(file,remaining);
          if (item) {remaining -= item.size; result.push(item);}
        }
        return result;
      } finally {
        await rm(directory,{recursive:true,force:true});
      }
    },
    thumbnail:file=>native('image.thumbnail',file),
    setStartup:enabled=>native('app.setLoginItemSettings',enabled),
    openProjectWindow:(folder,profile,profileRoot)=>native('app.openProjectWindow',folder,profile,profileRoot),
    notify:body=>native('notification.show',body)
  };
}
