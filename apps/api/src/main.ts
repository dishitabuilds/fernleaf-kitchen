import { createApplication } from './bootstrap';
import { readConfig } from './config';

async function main(): Promise<void> {
  const config = readConfig();
  const app = await createApplication(config);
  await app.listen(config.port, '0.0.0.0');
}

main().catch(() => {
  // Do not echo connection strings or credentials in startup diagnostics.
  console.error('API startup failed. Check environment configuration and PostgreSQL connectivity.');
  process.exitCode = 1;
});
