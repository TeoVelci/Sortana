const assert = require('assert');

let items = [];

const getOrCreateFolder = (name, parentId, key) => {
    const existing = items.find(i => i.parentId === parentId && i.name === name);
    if (existing) return existing.id;
    const folder = { id: Math.random().toString(), name, parentId, type: 'folder' };
    items.push(folder);
    return folder.id;
};

// 1. User uploads file
const rootFolderId = getOrCreateFolder('Files test 6', 'root', 'ROOT|Files test 6');
const cameraFolderId = getOrCreateFolder('Analyzing Camera...', rootFolderId, 'ROOT|Analyzing Camera...');
const dateFolderId = getOrCreateFolder('2025-07-03', cameraFolderId, 'ROOT|Analyzing Camera...|2025-07-03');

const video = { id: 'v1', name: 'C0260.MP4', parentId: dateFolderId, type: 'file' };
items.push(video);

console.log('Before AI:', items);

// 2. AI finishes
const task = { id: 'v1', rootFolderId, useSmartSort: true };
const friendlyCamera = 'Sony A7 IV';
const dateStr = '2025-07-03';

const newCameraFolderId = getOrCreateFolder(friendlyCamera, task.rootFolderId, `ROOT|${friendlyCamera}`);
const newParentId = getOrCreateFolder(dateStr, newCameraFolderId, `ROOT|${friendlyCamera}|${dateStr}`);

const item = items.find(i => i.id === task.id);
let updates = { make: 'Sony', model: 'ILCE-7M4' };

if (newParentId !== item.parentId) {
    updates.parentId = newParentId;
}

items = items.map(i => i.id === task.id ? { ...i, ...updates } : i);

console.log('After AI:', items);
console.log('Video parent:', items.find(i => i.id === 'v1').parentId);
console.log('Expected parent:', newParentId);

