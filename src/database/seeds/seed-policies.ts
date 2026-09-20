/**
 * CLI seeder — same action as the admin "Seed policies" button, for headless runs.
 * Reads the bundled .docx in ./policy-docx and creates + publishes each as a policy.
 * Idempotent: keys that already exist are skipped.
 *
 * Run with:  npm run seed:policies
 * Requires the API env (DB + Redis) and the policy tables (`npm run migration:run`).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PoliciesService } from '../../modules/policies/policies.service';

// Valid-UUID sentinel recorded as the publisher for CLI-seeded versions.
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const svc = app.get(PoliciesService);
  const result = await svc.seedInitial(SYSTEM_USER);
  console.log(`Seeded: ${result.seeded.length ? result.seeded.join(', ') : '(none)'}`);
  console.log(`Skipped (already existed): ${result.skipped.length ? result.skipped.join(', ') : '(none)'}`);
  await app.close();
}

run().catch((err) => {
  console.error('Policy seed failed:', err);
  process.exit(1);
});
