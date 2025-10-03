#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse acceptance criteria from roadmap.md for each capability
 */

const roadmapPath = path.join(__dirname, '..', 'docs', 'master', 'roadmap.md');
const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');

// Parse roadmap by capability sections
function parseCapabilityAC(capabilityId) {
  // Find the capability section
  const capRegex = new RegExp(`####\\s+${capabilityId}\\s*$`, 'm');
  const match = roadmapContent.match(capRegex);

  if (!match) {
    console.warn(`Capability ${capabilityId} not found in roadmap`);
    return [];
  }

  const startIndex = match.index;

  // Find the end of this capability (next #### or end of file)
  const nextCapMatch = roadmapContent.slice(startIndex + 1).match(/^####\s+/m);
  const endIndex = nextCapMatch ? startIndex + 1 + nextCapMatch.index : roadmapContent.length;

  const capSection = roadmapContent.slice(startIndex, endIndex);

  // Extract Acceptance Criteria section
  const acMatch = capSection.match(/\*\*Acceptance Criteria\*\*:\s*([\s\S]*?)(?=\*\*|$)/);

  if (!acMatch) {
    console.warn(`No AC section found for ${capabilityId}`);
    return [];
  }

  const acText = acMatch[1];

  // Parse bullet points
  const bullets = acText.match(/- \[ \] (.+)/g);

  if (!bullets) {
    return [];
  }

  return bullets.map((bullet, idx) => {
    const text = bullet.replace(/^- \[ \] /, '').trim();
    return {
      id: `${capabilityId}-AC${String(idx + 1).padStart(2, '0')}`,
      text
    };
  });
}

// Test parsing
const testCapabilities = [
  'ATOMIC_FILE_WRITER',
  'MONOREPO_STRUCTURE',
  'SQLITE_SCHEMA',
  'VOICE_POLLING_ICLOUD'
];

console.log('=== PARSING ACCEPTANCE CRITERIA FROM ROADMAP ===\n');

testCapabilities.forEach(capId => {
  const ac = parseCapabilityAC(capId);
  console.log(`${capId}: ${ac.length} criteria`);
  ac.slice(0, 3).forEach(a => {
    console.log(`  [${a.id}] ${a.text.substring(0, 80)}${a.text.length > 80 ? '...' : ''}`);
  });
  console.log('');
});

// Export as module
export { parseCapabilityAC };
