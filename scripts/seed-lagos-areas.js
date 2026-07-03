#!/usr/bin/env node
/**
 * Seed the 20 Lagos service areas (Washermann coverage plan) through the API.
 *
 * Idempotent: areas are matched by name (case-insensitive) — existing areas are
 * left untouched (locations/fees are NOT overwritten), missing ones are created.
 * Adjacency runs as a second pass once all areas exist, resolved name → id.
 *
 * Works against any environment:
 *   API_URL=http://localhost:3009 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-lagos-areas.js
 *   node scripts/seed-lagos-areas.js --dry-run          # print the plan, write nothing
 *   node scripts/seed-lagos-areas.js --adjacency-only   # only (re)apply adjacency links
 *
 * Coordinates: verified against OSM/Nominatim where possible; towns marked
 * "verify" resolved poorly in geocoders — their circles are best-estimates and
 * should be nudged on the map in Admin → Areas → Edit towns. Radii are generous
 * enough (1–4 km) to absorb ±1 km of drift; the coverage-gaps report will show
 * where real demand falls outside the circles after launch.
 */

const API_URL   = process.env.API_URL   || 'http://localhost:3009';
const EMAIL     = process.env.ADMIN_EMAIL;
const PASSWORD  = process.env.ADMIN_PASSWORD;
const DRY_RUN   = process.argv.includes('--dry-run');
const ADJ_ONLY  = process.argv.includes('--adjacency-only');
const BASE      = `${API_URL.replace(/\/$/, '')}/api/v1`;

const L = (name, lat, lng, r) => ({ name, centerLat: lat, centerLng: lng, radiusKm: r });

// ─── The 20 Washermann Service Areas ─────────────────────────────────────────
const AREAS = [
  {
    name: 'Lekki Core', state: 'Lagos', lga: 'Eti-Osa',
    description: 'Phase 1 launch zone. High demand, high income. Est. 15-20 WashReps.',
    transportFeeWP: 90, targetUsers: 800,
    adjacent: ['Victoria Island & Ikoyi', 'Ajah Corridor'],
    locations: [
      L('Lekki Phase 1', 6.4448, 3.4729, 2.5),
      L('Lekki Phase 2', 6.4460, 3.5540, 2.5),      // verify
      L('Ikate', 6.4360, 3.4870, 1.5),
      L('Osapa London', 6.4390, 3.5090, 1.5),        // verify
      L('Chevron', 6.4430, 3.5310, 2),               // verify
      L('Agungi', 6.4420, 3.5190, 1.5),              // verify
    ],
  },
  {
    name: 'Ajah Corridor', state: 'Lagos', lga: 'Eti-Osa',
    description: 'Phase 1 launch zone. Est. 15-18 WashReps.',
    transportFeeWP: 100, targetUsers: 700,
    adjacent: ['Lekki Core', 'Ibeju-Lekki Growth Zone'],
    locations: [
      L('Ajah', 6.4667, 3.5725, 2.5),
      L('Sangotedo', 6.4700, 3.6300, 2.5),
      L('Abraham Adesanya', 6.4696, 3.5843, 1.5),
      L('Ado Road', 6.4720, 3.5850, 1.5),            // verify
      L('Badore', 6.4870, 3.5940, 2),                // verify
      L('Langbasa', 6.4780, 3.5880, 1.5),            // verify
      L('Olokonla', 6.4640, 3.6410, 1.5),            // verify
    ],
  },
  {
    name: 'Ibeju-Lekki Growth Zone', state: 'Lagos', lga: 'Ibeju-Lekki',
    description: 'Phase 3 expansion. Growth corridor along Lekki-Epe Expressway. Est. 8-12 WashReps.',
    transportFeeWP: 130, targetUsers: 350,
    adjacent: ['Ajah Corridor', 'Epe Region', 'Lekki Core'],
    locations: [
      L('Awoyaya', 6.4697, 3.7046, 2.5),
      L('Lakowe', 6.4673, 3.7318, 2.5),
      L('Bogije', 6.4750, 3.7550, 2),                // verify
      L('Elemoro', 6.4800, 3.7700, 2),               // verify
      L('Abijo', 6.4690, 3.6870, 2),                 // verify
    ],
  },
  {
    name: 'Victoria Island & Ikoyi', state: 'Lagos', lga: 'Eti-Osa',
    description: 'Phase 1 launch zone. Premium corporate + residential. Est. 10-15 WashReps.',
    transportFeeWP: 90, targetUsers: 600,
    adjacent: ['Lekki Core', 'Yaba Tech Belt', 'Apapa & Marine'],
    locations: [
      L('Victoria Island', 6.4281, 3.4219, 3),
      L('Oniru', 6.4330, 3.4450, 1.5),               // verify
      L('Ikoyi', 6.4520, 3.4340, 2.5),
      L('Banana Island', 6.4630, 3.4480, 1),
    ],
  },
  {
    name: 'Surulere', state: 'Lagos', lga: 'Surulere',
    description: 'Phase 1 launch zone. Dense mainland residential. Est. 12-15 WashReps.',
    transportFeeWP: 90, targetUsers: 700,
    adjacent: ['Yaba Tech Belt', 'Mushin / Oshodi', 'Apapa & Marine'],
    locations: [
      L('Aguda', 6.4930, 3.3480, 1.5),               // verify
      L('Bode Thomas', 6.4870, 3.3620, 1.5),
      L('Adeniran Ogunsanya', 6.4890, 3.3560, 1.2),
      L('Ojuelegba', 6.5100, 3.3660, 1.5),
      L('Iponri', 6.4830, 3.3700, 1.2),
    ],
  },
  {
    name: 'Yaba Tech Belt', state: 'Lagos', lga: 'Lagos Mainland',
    description: 'Phase 1 launch zone. Students + young professionals (UNILAG, tech cluster). Est. 10-12 WashReps.',
    transportFeeWP: 90, targetUsers: 600,
    adjacent: ['Surulere', 'Mainland Central', 'Victoria Island & Ikoyi'],
    locations: [
      L('Yaba', 6.5095, 3.3711, 2),
      L('Sabo', 6.5070, 3.3790, 1.2),                // verify
      L('Akoka', 6.5220, 3.3890, 1.5),
      L('Alagomeji', 6.4990, 3.3760, 1),             // verify
      L('Jibowu', 6.5150, 3.3660, 1),
      L('University of Lagos Area', 6.5158, 3.3898, 1.5),
    ],
  },
  {
    name: 'Mainland Central', state: 'Lagos', lga: 'Kosofe / Shomolu',
    description: 'Phase 1 launch zone. Est. 15-20 WashReps.',
    transportFeeWP: 90, targetUsers: 800,
    adjacent: ['Ogudu / Ojota Axis', 'Ikeja Core', 'Yaba Tech Belt', 'Mushin / Oshodi'],
    locations: [
      L('Gbagada', 6.5480, 3.3880, 2.5),
      L('Anthony', 6.5610, 3.3680, 1.5),
      L('Maryland', 6.5700, 3.3660, 1.5),
      L('Mende', 6.5750, 3.3740, 1.2),
      L('Ilupeju', 6.5560, 3.3560, 2),
    ],
  },
  {
    name: 'Ikeja Core', state: 'Lagos', lga: 'Ikeja',
    description: 'Phase 1 launch zone. Commercial capital. Est. 15-20 WashReps.',
    transportFeeWP: 90, targetUsers: 800,
    adjacent: ['Agege / Ogba', 'Magodo & Omole', 'Mainland Central', 'Mushin / Oshodi'],
    locations: [
      L('Ikeja GRA', 6.5810, 3.3510, 2),
      L('Ikeja', 6.6018, 3.3515, 2),
      L('Opebi', 6.5900, 3.3620, 1.5),
      L('Allen', 6.6000, 3.3560, 1.2),
      L('Computer Village', 6.5940, 3.3420, 1),
      L('Alausa', 6.6180, 3.3560, 1.5),
    ],
  },
  {
    name: 'Magodo & Omole', state: 'Lagos', lga: 'Kosofe / Ikeja',
    description: 'Phase 2 scale zone. Gated estates. Est. 8-12 WashReps.',
    transportFeeWP: 110, targetUsers: 450,
    adjacent: ['Ikeja Core', 'Ogudu / Ojota Axis', 'Agege / Ogba'],
    locations: [
      L('Magodo Phase 1', 6.6300, 3.3930, 1.5),      // verify
      L('Magodo Phase 2', 6.6100, 3.3830, 1.5),      // verify
      L('Omole Phase 1', 6.6350, 3.3600, 1.5),
      L('Omole Phase 2', 6.6480, 3.3720, 1.5),
    ],
  },
  {
    name: 'Ogudu / Ojota Axis', state: 'Lagos', lga: 'Kosofe',
    description: 'Phase 2 scale zone. Est. 8-12 WashReps.',
    transportFeeWP: 110, targetUsers: 450,
    adjacent: ['Mainland Central', 'Magodo & Omole', 'Ikorodu Core'],
    locations: [
      L('Ogudu', 6.5750, 3.3950, 2),
      L('Ojota', 6.5870, 3.3830, 1.5),
      L('Ketu', 6.5960, 3.3890, 1.5),
    ],
  },
  {
    name: 'Festac / Amuwo', state: 'Lagos', lga: 'Amuwo-Odofin',
    description: 'Phase 2 scale zone. Est. 15-20 WashReps.',
    transportFeeWP: 110, targetUsers: 700,
    adjacent: ['Isolo Corridor', 'Apapa & Marine', 'Badagry Region'],
    locations: [
      L('Festac Town', 6.4660, 3.2830, 3),
      L('Amuwo Odofin', 6.4471, 3.2663, 2.5),
      L('Apple Junction', 6.4560, 3.3050, 1.5),
      L('Satellite Town', 6.4560, 3.2340, 2.5),      // verify
    ],
  },
  {
    name: 'Isolo Corridor', state: 'Lagos', lga: 'Oshodi-Isolo',
    description: 'Phase 2 scale zone. Est. 15-18 WashReps.',
    transportFeeWP: 110, targetUsers: 700,
    adjacent: ['Mushin / Oshodi', 'Alimosho Mega Zone', 'Festac / Amuwo'],
    locations: [
      L('Isolo', 6.5333, 3.3213, 2),
      L('Ajao Estate', 6.5500, 3.3290, 1.5),
      L('Okota', 6.5100, 3.3200, 2),
      L('Ago Palace', 6.5080, 3.3060, 2),            // verify
    ],
  },
  {
    name: 'Mushin / Oshodi', state: 'Lagos', lga: 'Mushin / Oshodi-Isolo',
    description: 'Phase 2 scale zone. Very high foot traffic. Est. 12-15 WashReps.',
    transportFeeWP: 90, targetUsers: 600,
    adjacent: ['Isolo Corridor', 'Surulere', 'Ikeja Core', 'Mainland Central'],
    locations: [
      L('Mushin', 6.5270, 3.3540, 2),
      L('Oshodi', 6.5566, 3.3513, 2),
      L('Ladipo', 6.5450, 3.3450, 1.2),
      L('Ilasamaja', 6.5230, 3.3350, 1.5),           // verify
    ],
  },
  {
    name: 'Agege / Ogba', state: 'Lagos', lga: 'Agege / Ifako-Ijaiye',
    description: 'Phase 3 expansion. Est. 12-15 WashReps.',
    transportFeeWP: 110, targetUsers: 550,
    adjacent: ['Ikeja Core', 'Alimosho Mega Zone', 'Magodo & Omole'],
    locations: [
      L('Agege', 6.6210, 3.3200, 2.5),
      L('Ogba', 6.6230, 3.3450, 2),
      L('Ifako', 6.6470, 3.3280, 2),                 // verify
      L('Pen Cinema', 6.6350, 3.3180, 1.2),          // verify
    ],
  },
  {
    name: 'Alimosho Mega Zone', state: 'Lagos', lga: 'Alimosho',
    description: 'Phase 2 scale zone. Highest population concentration in Lagos - launch strong here. Est. 25-35 WashReps.',
    transportFeeWP: 110, targetUsers: 1200,
    adjacent: ['Agege / Ogba', 'Isolo Corridor', 'Ikeja Core'],
    locations: [
      L('Egbeda', 6.5960, 3.2890, 2.5),
      L('Idimu', 6.5722, 3.2570, 2.5),
      L('Ikotun', 6.5540, 3.2610, 2.5),
      L('Akowonjo', 6.6060, 3.3040, 2),
      L('Ipaja', 6.6140, 3.2580, 2.5),               // verify
      L('Ayobo', 6.6030, 3.2340, 2.5),               // verify
      L('Command', 6.6350, 3.2600, 2),               // verify
    ],
  },
  {
    name: 'Apapa & Marine', state: 'Lagos', lga: 'Apapa',
    description: 'Phase 3 expansion. Port district; residential pockets. Est. 5-8 WashReps.',
    transportFeeWP: 110, targetUsers: 250,
    adjacent: ['Surulere', 'Festac / Amuwo', 'Victoria Island & Ikoyi'],
    locations: [
      L('Apapa GRA', 6.4400, 3.3640, 1.5),           // verify
      L('Apapa', 6.4489, 3.3590, 2),
      L('Tincan', 6.4330, 3.3400, 2),
      L('Kirikiri Residential', 6.4550, 3.3120, 2),
    ],
  },
  {
    name: 'Ikorodu Core', state: 'Lagos', lga: 'Ikorodu',
    description: 'Phase 3 expansion. Est. 15-20 WashReps.',
    transportFeeWP: 130, targetUsers: 600,
    adjacent: ['Ikorodu Expansion Belt', 'Ogudu / Ojota Axis'],
    locations: [
      L('Ikorodu Town', 6.6190, 3.5100, 3),
      L('Agric', 6.6256, 3.4863, 2),
      L('Igbogbo', 6.5913, 3.5171, 2.5),
      L('Ebute', 6.6060, 3.4900, 2),
    ],
  },
  {
    name: 'Ikorodu Expansion Belt', state: 'Lagos', lga: 'Ikorodu',
    description: 'Phase 3 expansion. Est. 8-10 WashReps.',
    transportFeeWP: 130, targetUsers: 350,
    adjacent: ['Ikorodu Core', 'Epe Region'],
    locations: [
      L('Imota', 6.6680, 3.6640, 3),
      L('Ijede', 6.5720, 3.6010, 2.5),
      L('Odogunyan', 6.6620, 3.5140, 2.5),
      L('Owode-Ibeshe', 6.5534, 3.4737, 3),          // verify
    ],
  },
  {
    name: 'Epe Region', state: 'Lagos', lga: 'Epe',
    description: 'Phase 3 expansion. Outskirts. Est. 5-8 WashReps.',
    transportFeeWP: 160, targetUsers: 250,
    adjacent: ['Ibeju-Lekki Growth Zone', 'Ikorodu Expansion Belt'],
    locations: [
      L('Epe', 6.5840, 3.9840, 4),
      L('Ejinrin', 6.6070, 4.0450, 3),               // verify
      L('Poka', 6.6214, 3.9835, 2.5),
    ],
  },
  {
    name: 'Badagry Region', state: 'Lagos', lga: 'Badagry',
    description: 'Phase 3 expansion. Outskirts. Est. 5-8 WashReps.',
    transportFeeWP: 160, targetUsers: 250,
    adjacent: ['Festac / Amuwo'],
    locations: [
      L('Badagry', 6.4393, 2.9060, 4),
      L('Ajara', 6.4333, 2.9000, 2.5),
      L('Topo', 6.4200, 2.9200, 2.5),
    ],
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

async function api(path, options = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(`${options.method || 'GET'} ${path} → ${res.status}: ${body.message || JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.');
    process.exit(1);
  }
  console.log(`Target: ${BASE}${DRY_RUN ? '  (DRY RUN — nothing will be written)' : ''}`);

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD, source: 'admin' }),
  });
  const token = login.data.accessToken;

  const existing = await api('/areas?limit=100', {}, token);
  const byName = new Map(existing.data.map((a) => [a.name.trim().toLowerCase(), a]));
  console.log(`Existing areas on target: ${existing.data.length}`);

  // Pass 1 — create missing areas (with their towns)
  let created = 0, skipped = 0;
  if (!ADJ_ONLY) {
    for (const area of AREAS) {
      if (byName.has(area.name.toLowerCase())) {
        console.log(`  = exists, skipping: ${area.name}`);
        skipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  + would create: ${area.name} (${area.locations.length} towns, fee ${area.transportFeeWP} WP)`);
        created++;
        continue;
      }
      const { adjacent, ...payload } = area;
      const res = await api('/areas', { method: 'POST', body: JSON.stringify(payload) }, token);
      byName.set(area.name.toLowerCase(), res.data);
      console.log(`  + created: ${area.name} (${res.data.locations?.length ?? 0} towns)`);
      created++;
    }
  }

  // Pass 2 — adjacency (name → id), only for areas whose adjacency is empty or --adjacency-only
  let linked = 0;
  for (const area of AREAS) {
    const row = byName.get(area.name.toLowerCase());
    if (!row) { console.warn(`  ! missing on target, cannot link: ${area.name}`); continue; }
    const wantIds = area.adjacent
      .map((n) => byName.get(n.toLowerCase())?.id)
      .filter(Boolean);
    if (wantIds.length !== area.adjacent.length) {
      console.warn(`  ! ${area.name}: some adjacent areas not found on target`);
    }
    const currentIds = row.adjacentAreaIds || [];
    if (!ADJ_ONLY && currentIds.length > 0) { continue; } // don't clobber manual edits
    if (JSON.stringify(currentIds) === JSON.stringify(wantIds)) continue;
    if (DRY_RUN) {
      console.log(`  ~ would link ${area.name} → [${area.adjacent.join(', ')}]`);
      linked++;
      continue;
    }
    await api(`/areas/${row.id}`, { method: 'PATCH', body: JSON.stringify({ adjacentAreaIds: wantIds }) }, token);
    console.log(`  ~ linked ${area.name} → [${area.adjacent.join(', ')}]`);
    linked++;
  }

  console.log(`\nDone. created=${created} skipped=${skipped} adjacency-updated=${linked}`);
  if (!DRY_RUN && created > 0) {
    console.log('Reminder: towns marked "verify" in this script should be pin-checked in Admin → Areas → Edit towns.');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
