import { writeFile, mkdir } from 'node:fs/promises';
import { buildSamplePptx, buildSamplePdf } from './sample-deck.mjs';

await mkdir('public/samples', { recursive: true });
await writeFile('public/samples/sample.pptx', await buildSamplePptx());
await writeFile('public/samples/sample.pdf', await buildSamplePdf());
console.log('Wrote public/samples/sample.pptx and sample.pdf');
