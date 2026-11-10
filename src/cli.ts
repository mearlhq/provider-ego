#!/usr/bin/env node
import { EgoBridge } from './bridge.js';

const [operation, rawSpace, flag, rawKeep, ...extra] = process.argv.slice(2);
if (!['handoff', 'resume', 'finish', 'list'].includes(operation) ||
  (operation !== 'list' && (!/^\d+$/.test(rawSpace ?? '') || !Number.isSafeInteger(Number(rawSpace)))) ||
  (flag !== undefined && (operation !== 'finish' || flag !== '--keep' || rawKeep === undefined)) || extra.length) {
  console.error('Usage: mearl-ego list | handoff SPACE_ID | resume SPACE_ID | finish SPACE_ID [--keep p1,p2]');
  process.exitCode = 1;
} else {
  const keep = rawKeep ? rawKeep.split(',') : [];
  if (keep.some(label => !/^p[1-9]\d*$/.test(label))) throw new Error('Keep entries must be Ego Page labels such as p1,p2');
  const bridge = new EgoBridge();
  try { console.log(JSON.stringify(await bridge.request(operation, { spaceId: Number(rawSpace), keep }), null, 2)); }
  finally { bridge.close(); }
}
