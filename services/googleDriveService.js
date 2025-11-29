const { google } = require('googleapis');
const fs = require('fs');

function createDriveClient() {
  try {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    console.log('Google Drive Client Creation:', {
      keyFile: keyFile,
      keyFileExists: keyFile ? fs.existsSync(keyFile) : false,
      USE_GOOGLE_DRIVE: process.env.USE_GOOGLE_DRIVE
    });
    
    if (!keyFile || !fs.existsSync(keyFile)) {
      console.warn('GOOGLE_APPLICATION_CREDENTIALS missing or file not found');
      return null;
    }
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    return google.drive({ version: 'v3', auth });
  } catch (e) {
    console.error('Drive init failed:', e.message);
    return null;
  }
}

async function ensurePublic(drive, fileId) {
  await drive.permissions.create({ 
    fileId, 
    requestBody: { type: 'anyone', role: 'reader' },
    supportsAllDrives: true
  });
}

async function getOrCreateFolder(drive, name, parentId) {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : '');
  const r = await drive.files.list({ 
    q, 
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  if (r.data.files?.length) return r.data.files[0].id;
  const created = await drive.files.create({ 
    resource: { 
      name, 
      mimeType: 'application/vnd.google-apps.folder', 
      parents: parentId ? [parentId] : undefined 
    }, 
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

function folderFor(category, docType) {
  if (category === 'employee') {
    const map = {
      photograph: 'Employee-Photos',
      tenthMarksheet: 'Employee-Documents/Education',
      twelfthMarksheet: 'Employee-Documents/Education',
      bachelorDegree: 'Employee-Documents/Education',
      postgraduateDegree: 'Employee-Documents/Education',
      aadharCard: 'Employee-Documents/Identity',
      panCard: 'Employee-Documents/Identity',
      pcc: 'Employee-Documents/Identity',
      resume: 'Employee-Documents/Resume',
      offerLetter: 'Employee-Documents/Employment'
    };
    return map[docType] || 'Employee-Documents/Other';
  }
  return 'CRM-Documents';
}

module.exports = {
  async upload(localPath, fileName, mimeType, category = 'general', docType = '') {
    const drive = createDriveClient();
    if (!drive) throw new Error('Google Drive not initialized');
    const root = process.env.GOOGLE_DRIVE_FOLDER_ID || undefined;

    const fullFolder = folderFor(category, docType);
    const parts = fullFolder.split('/');
    let parent = root;
    for (const p of parts) {
      // eslint-disable-next-line no-await-in-loop
      parent = await getOrCreateFolder(drive, p, parent);
    }

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: parent ? [parent] : undefined },
      media: { mimeType, body: fs.createReadStream(localPath) },
      fields: 'id,name,webViewLink,webContentLink',
      supportsAllDrives: true
    });
    await ensurePublic(drive, res.data.id);
    return {
      fileId: res.data.id,
      fileName: res.data.name,
      url: `https://drive.google.com/file/d/${res.data.id}/view`,
      webViewLink: res.data.webViewLink,
      webContentLink: res.data.webContentLink
    };
  },
  async delete(fileId) {
    const drive = createDriveClient();
    if (!drive) return false;
    await drive.files.delete({ fileId });
    return true;
  }
}; 