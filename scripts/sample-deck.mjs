// Builds the sample deck used by the tests and the "Load sample" button.
// The PDF is a drawn stand-in for a real PowerPoint "Export as PDF" (hidden slides left out,
// as PowerPoint does by default), not an actual export.
import pptxgen from 'pptxgenjs';
import PDFDocument from 'pdfkit';

// 1x1 transparent PNG, enough to give the picture an alt text.
const PIXEL =
  'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const SAMPLE_SLIDES = [
  {
    title: 'Quarterly Product Update',
    bullets: ['Q3 highlights'],
    notes: "Welcome everyone. Today we'll cover three things: growth, pricing and the roadmap.",
  },
  {
    title: 'Growth',
    bullets: ['Active users up 32% to 48,000', 'Churn down to 2.1%', 'Two new enterprise customers'],
    notes: 'Growth was driven mostly by the new onboarding flow.',
  },
  {
    title: 'Pricing',
    table: [
      ['Plan', 'Price'],
      ['Free', '$0'],
      ['Pro', '$12'],
      ['Team', '$40'],
    ],
    notes: '',
  },
  {
    title: 'Roadmap',
    bullets: ['Mobile app beta in November'],
    chart: true,
    imageAlt: 'Illustration of a rocket launching',
    notes: 'Mobile is the biggest bet for next quarter.',
  },
  {
    title: 'Backup: raw numbers',
    bullets: ['Not shown in the exported PDF'],
    hidden: true,
    notes: 'Hidden slide.',
  },
];

export async function buildSamplePptx() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  // Real decks use title/body placeholders, so the sample does too.
  pptx.defineSlideMaster({
    title: 'SAMPLE',
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.3, w: 9, h: 0.9, fontSize: 32, bold: true }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 1.5, w: 5, h: 2.5, fontSize: 20 }, text: '' } },
    ],
  });
  for (const s of SAMPLE_SLIDES) {
    const slide = pptx.addSlide({ masterName: 'SAMPLE' });
    if (s.hidden) slide.hidden = true;
    slide.addText(s.title, { placeholder: 'title' });
    if (s.bullets) {
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { placeholder: 'body' },
      );
    }
    if (s.table) {
      slide.addTable(
        s.table.map((row) => row.map((text) => ({ text }))),
        { x: 0.7, y: 1.6, w: 5, fontSize: 18 },
      );
    }
    if (s.chart) {
      slide.addChart(pptx.charts.BAR, [{ name: 'Users', labels: ['Q1', 'Q2', 'Q3'], values: [20, 36, 48] }], {
        x: 5.2, y: 1.5, w: 4.3, h: 3,
      });
      slide.addImage({ data: PIXEL, x: 0.7, y: 4.2, w: 0.6, h: 0.6, altText: s.imageAlt });
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}

export async function buildSamplePdf() {
  const doc = new PDFDocument({ size: [960, 540], margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', resolve));
  for (const s of SAMPLE_SLIDES.filter((x) => !x.hidden)) {
    doc.addPage();
    doc.rect(0, 0, 960, 540).fill('#ffffff');
    doc.fillColor('#111111').fontSize(44).text(s.title, 60, 40);
    doc.fontSize(28);
    let y = 150;
    for (const b of s.bullets ?? []) {
      doc.text(`•  ${b}`, 80, y);
      y += 48;
    }
    for (const row of s.table ?? []) {
      doc.text(row[0], 80, y).text(row[1], 280, y);
      y += 48;
    }
    if (s.chart) {
      [[600, 120], [680, 200], [760, 280]].forEach(([x, h], i) => {
        doc.rect(x, 420 - h, 50, h).fill(['#4472c4', '#4472c4', '#4472c4'][i]);
      });
    }
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}
