/**
 * Utility script to patch an Overwolf game entry in GamesList.*.xml
 * to enforce Exclusive Mode and disable SmartMixMode.
 * 
 * Usage:
 *   node scripts/patch-overwolf-gamelist.js [gameId]
 * Default gameId: 221561 (Cult of the Lamb)
 */

const fs = require('fs');
const path = require('path');

const targetGameId = process.argv[2] || '221561';
const appData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const overwolfDir = path.join(appData, 'Overwolf');

if (!fs.existsSync(overwolfDir)) {
  console.error('[patch-gamelist] Overwolf directory not found at:', overwolfDir);
  process.exit(1);
}

// Find all GamesList.*.xml files (ignoring .bak)
const files = fs.readdirSync(overwolfDir).filter(f => /^GamesList\.\d+\.xml$/i.test(f));

if (files.length === 0) {
  console.error('[patch-gamelist] No GamesList.*.xml files found in Overwolf folder.');
  process.exit(1);
}

for (const file of files) {
  const fullPath = path.join(overwolfDir, file);
  console.log(`[patch-gamelist] Inspecting ${file}...`);
  let content = fs.readFileSync(fullPath, 'utf8');

  const idTag = `<ID>${targetGameId}</ID>`;
  const idx = content.indexOf(idTag);
  if (idx === -1) {
    console.log(`[patch-gamelist] Game ID ${targetGameId} not found in ${file}.`);
    continue;
  }

  const endTag = '</GameInfo>';
  const blockEnd = content.indexOf(endTag, idx);
  if (blockEnd === -1) {
    console.error(`[patch-gamelist] Malformed XML: could not find ${endTag} after ${idTag}`);
    continue;
  }

  const block = content.slice(idx, blockEnd);
  const patches = [];
  if (!block.includes('<ControlModes>')) {
    patches.push('    <ControlModes>NotAllowMixedMode</ControlModes>');
  }
  if (!block.includes('<Client_GameControlMode>')) {
    patches.push('    <Client_GameControlMode>MixedNotAvailable</Client_GameControlMode>');
  }
  if (!block.includes('<DisableSmartMixMode>')) {
    patches.push('    <DisableSmartMixMode>True</DisableSmartMixMode>');
  }

  if (patches.length === 0) {
    console.log(`[patch-gamelist] Game ${targetGameId} is already fully patched in ${file}.`);
    continue;
  }

  // Create backup if not exists
  const bakPath = fullPath + '.bak';
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(fullPath, bakPath);
    console.log(`[patch-gamelist] Created backup at ${bakPath}`);
  }

  const insertion = '\n' + patches.join('\n') + '\n  ';
  const updatedContent = content.slice(0, blockEnd) + insertion + content.slice(blockEnd);
  fs.writeFileSync(fullPath, updatedContent, 'utf8');
  console.log(`[patch-gamelist] Successfully applied ${patches.length} patch(es) to ${file} for Game ${targetGameId}.`);
}

console.log('[patch-gamelist] Done.');
