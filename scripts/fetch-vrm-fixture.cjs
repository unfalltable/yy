const fs = require('node:fs/promises');
(async () => {
  const url =
    'https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm';
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('HTTP ' + r.status);
  const data = Buffer.from(await r.arrayBuffer());
  await fs.mkdir('.tools/fixtures', { recursive: true });
  await fs.writeFile('.tools/fixtures/sample.vrm', data);
  console.log(
    'Official pixiv VRM fixture downloaded (' + data.length + ' bytes), test-only; not bundled',
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
