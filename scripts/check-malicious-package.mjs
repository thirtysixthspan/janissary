#!/usr/bin/env node
// Gate that stands between a package-update playbook and `npm install`/`npm update`.
//
//   ./scripts/run.mjs check-malicious-package <pkg>[@version] ...   check install targets
//   ./scripts/run.mjs check-malicious-package --audit               scan package-lock.json
//
// Exit codes:
//   0  clean      — safe to install
//   1  usage or data error
//   2  BLOCKED    — an exact known-malicious version; never install
//   3  QUARANTINED — package/scope belongs to a compromised account, but this
//                    specific version is not a known-bad one. Still refuse:
//                    these campaigns propagate by publishing fresh versions.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(repoRoot, 'security', 'known-malicious-packages.json');

const EXIT = { CLEAN: 0, ERROR: 1, BLOCKED: 2, QUARANTINED: 3 };

function loadCampaigns() {
  try {
    const parsed = JSON.parse(readFileSync(dataPath, 'utf8'));
    if (!Array.isArray(parsed.campaigns)) throw new Error('missing "campaigns" array');
    return parsed.campaigns;
  } catch (error) {
    console.error(`check-malicious-package: cannot read ${dataPath}: ${error.message}`);
    console.error('Refusing to report "clean" without the list. Treat this as a failed check.');
    process.exit(EXIT.ERROR);
  }
}

// "@scope/name@1.2.3" -> { name: "@scope/name", version: "1.2.3" }
function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, version: null };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) || null };
}

function scopeOf(name) {
  return name.startsWith('@') ? name.slice(0, name.indexOf('/')) : null;
}

function classify(name, version, campaigns) {
  for (const campaign of campaigns) {
    const known = campaign.packages?.[name];

    if (known && version && known.includes(version)) {
      return { status: 'blocked', campaign, detail: `${name}@${version} is a known-malicious release` };
    }
    if (known && !version) {
      return {
        status: 'quarantined',
        campaign,
        detail: `${name} has known-malicious releases (${known.join(', ')}) and no version was given`,
      };
    }
    if (known) {
      return {
        status: 'quarantined',
        campaign,
        detail: `${name} has known-malicious releases (${known.join(', ')}); ${version} is not among them but the account was compromised`,
      };
    }

    if (campaign.quarantinePackages?.includes(name)) {
      return {
        status: 'quarantined',
        campaign,
        detail: `${name} is published by an account compromised in this campaign`,
      };
    }

    const scope = scopeOf(name);
    const quarantined = [
      ...(campaign.quarantineScopes ?? []),
      ...(campaign.additionalAffectedScopes?.scopes ?? []),
    ];
    if (scope && quarantined.includes(scope)) {
      return { status: 'quarantined', campaign, detail: `scope ${scope} was compromised in this campaign` };
    }
  }
  return { status: 'clean' };
}

function report(spec, result) {
  if (result.status === 'clean') {
    console.log(`OK          ${spec}`);
    return;
  }
  const label = result.status === 'blocked' ? 'BLOCKED' : 'QUARANTINED';
  console.error(`${label.padEnd(11)} ${spec}`);
  console.error(`            ${result.detail}`);
  console.error(`            campaign: ${result.campaign.id} (disclosed ${result.campaign.disclosed})`);
  const sources = result.campaign.sources ?? [];
  for (const source of sources) console.error(`            ${source}`);
}

function checkSpecs(specs, campaigns) {
  let worst = EXIT.CLEAN;

  for (const spec of specs) {
    const { name, version } = parseSpec(spec);
    const result = classify(name, version, campaigns);
    report(spec, result);
    if (result.status === 'blocked') worst = EXIT.BLOCKED;
    else if (result.status === 'quarantined' && worst !== EXIT.BLOCKED) worst = EXIT.QUARANTINED;
  }

  if (worst === EXIT.CLEAN) {
    console.log('\nNo known-malicious packages among the install targets. Safe to proceed.');
  } else {
    console.error('\nDO NOT INSTALL. Skip this package and pick the next candidate.');
  }
  return worst;
}

function auditLockfile(campaigns) {
  let lock;
  try {
    lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  } catch (error) {
    console.error(`check-malicious-package: cannot read package-lock.json: ${error.message}`);
    return EXIT.ERROR;
  }

  const blocked = [];
  const quarantined = [];

  const lockEntries = Object.entries(lock.packages ?? {});

  for (const [treePath, entry] of lockEntries) {
    if (!treePath.includes('node_modules/') || !entry.version) continue;
    const name = treePath.slice(treePath.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const result = classify(name, entry.version, campaigns);
    if (result.status === 'blocked') blocked.push({ name, version: entry.version, treePath, result });
    else if (result.status === 'quarantined') quarantined.push({ name, version: entry.version });
  }

  if (quarantined.length > 0) {
    console.log(`Packages from compromised accounts, at versions not known to be malicious (${quarantined.length}):`);
    for (const item of quarantined) console.log(`  ${item.name}@${item.version}`);
    console.log('');
  }

  if (blocked.length === 0) {
    console.log('AUDIT CLEAN — no known-malicious version is installed.');
    return EXIT.CLEAN;
  }

  console.error(`AUDIT FAILED — ${blocked.length} known-malicious version(s) installed:`);
  for (const item of blocked) {
    console.error(`  ${item.name}@${item.version}  (${item.treePath})`);
    console.error(`    campaign: ${item.result.campaign.id}`);
  }
  console.error('\nTreat this host as compromised. Follow the remediation order in the campaign sources.');
  return EXIT.BLOCKED;
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('usage: check-malicious-package <pkg>[@version] ...');
  console.error('       check-malicious-package --audit');
  process.exit(EXIT.ERROR);
}

const campaigns = loadCampaigns();
process.exit(args[0] === '--audit' ? auditLockfile(campaigns) : checkSpecs(args, campaigns));
