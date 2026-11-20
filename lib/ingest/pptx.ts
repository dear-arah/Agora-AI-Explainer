import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { IngestError, type ParsedDeck, type SlideContent } from './types';

// A .pptx is a zip of XML files. We read text and speaker notes straight from the XML, so this
// runs in the browser (the deck never leaves the user's machine) and in Node for the tests.

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false, // runs like "Hello " + "world" need their spaces
  parseTagValue: false,
  parseAttributeValue: false,
});

const tagOf = (n: XmlNode): string | undefined => Object.keys(n).find((k) => k !== ':@');
const kids = (n: XmlNode): XmlNode[] => {
  const t = tagOf(n);
  const v = t ? n[t] : undefined;
  return Array.isArray(v) ? (v as XmlNode[]) : [];
};
const attr = (n: XmlNode, name: string): string | undefined =>
  ((n[':@'] as Record<string, string> | undefined) ?? {})[`@_${name}`];
const find = (nodes: XmlNode[], tag: string) => nodes.find((n) => tagOf(n) === tag);
const findAll = (nodes: XmlNode[], tag: string) => nodes.filter((n) => tagOf(n) === tag);

/** Walk the whole subtree, depth first, in document order. */
function* walk(nodes: XmlNode[]): Generator<XmlNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(kids(n));
  }
}

const parseXml = (xml: string): XmlNode[] => parser.parse(xml) as XmlNode[];

/** Resolve a relationship target against the folder of the file that holds the relationship. */
function resolve(fromDir: string, target: string): string {
  const parts = (target.startsWith('/') ? target.slice(1) : `${fromDir}/${target}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

async function readXml(zip: JSZip, path: string): Promise<XmlNode[] | null> {
  const file = zip.file(path);
  return file ? parseXml(await file.async('string')) : null;
}

type Rels = Map<string, { type: string; target: string }>;

async function readRels(zip: JSZip, partPath: string): Promise<Rels> {
  const dir = partPath.split('/').slice(0, -1).join('/');
  const name = partPath.split('/').pop();
  const xml = await readXml(zip, `${dir}/_rels/${name}.rels`);
  const rels: Rels = new Map();
  const root = xml && find(xml, 'Relationships');
  for (const r of root ? findAll(kids(root), 'Relationship') : []) {
    const id = attr(r, 'Id');
    const target = attr(r, 'Target');
    if (id && target) rels.set(id, { type: attr(r, 'Type') ?? '', target: resolve(dir, target) });
  }
  return rels;
}

/** Text of one <a:p>: runs joined, line breaks as spaces, auto-fields (slide number, date) skipped. */
function paragraphText(p: XmlNode): string {
  let text = '';
  for (const n of kids(p)) {
    const tag = tagOf(n);
    if (tag === 'a:r') {
      const t = find(kids(n), 'a:t');
      const first = t ? kids(t)[0] : undefined;
      if (first && '#text' in first) text += String(first['#text']);
    } else if (tag === 'a:br') {
      text += ' ';
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

const PLACEHOLDERS_TO_SKIP = new Set(['sldNum', 'dt', 'ftr', 'hdr']);

function placeholderType(sp: XmlNode): string | undefined {
  const nv = find(kids(sp), 'p:nvSpPr');
  const nvPr = nv && find(kids(nv), 'p:nvPr');
  const ph = nvPr && find(kids(nvPr), 'p:ph');
  return ph ? (attr(ph, 'type') ?? 'body') : undefined;
}

interface Extracted {
  title: string | null;
  paragraphs: string[];
  imageAlts: string[];
}

/** Read the shapes of one slide's shape tree in reading order. */
function extractShapes(shapes: XmlNode[], out: Extracted): void {
  for (const n of shapes) {
    const tag = tagOf(n);
    if (tag === 'p:sp') {
      const ph = placeholderType(n);
      if (ph && PLACEHOLDERS_TO_SKIP.has(ph)) continue;
      const body = find(kids(n), 'p:txBody');
      const texts = (body ? findAll(kids(body), 'a:p') : []).map(paragraphText).filter(Boolean);
      if ((ph === 'title' || ph === 'ctrTitle') && out.title === null) {
        out.title = texts.join(' ') || null;
      } else {
        out.paragraphs.push(...texts);
      }
    } else if (tag === 'p:grpSp') {
      extractShapes(kids(n), out);
    } else if (tag === 'p:graphicFrame') {
      for (const row of [...walk(kids(n))].filter((x) => tagOf(x) === 'a:tr')) {
        const cells = findAll(kids(row), 'a:tc').map((tc) => {
          const body = find(kids(tc), 'a:txBody');
          return (body ? findAll(kids(body), 'a:p') : []).map(paragraphText).filter(Boolean).join(' ');
        });
        const line = cells.filter(Boolean).join(' | ');
        if (line) out.paragraphs.push(line);
      }
    } else if (tag === 'p:pic') {
      const nv = find(kids(n), 'p:nvPicPr');
      const c = nv && find(kids(nv), 'p:cNvPr');
      const alt = c && attr(c, 'descr');
      if (alt?.trim()) out.imageAlts.push(alt.trim());
    }
  }
}

function shapeTree(root: XmlNode[], rootTag: string): XmlNode[] {
  const top = find(root, rootTag);
  const csld = top && find(kids(top), 'p:cSld');
  const tree = csld && find(kids(csld), 'p:spTree');
  return tree ? kids(tree) : [];
}

function notesText(root: XmlNode[]): string {
  const paragraphs: string[] = [];
  for (const n of shapeTree(root, 'p:notes')) {
    if (tagOf(n) !== 'p:sp' || placeholderType(n) !== 'body') continue;
    const body = find(kids(n), 'p:txBody');
    paragraphs.push(...(body ? findAll(kids(body), 'a:p') : []).map(paragraphText));
  }
  return paragraphs.join('\n').trim();
}

export async function parsePptx(data: ArrayBuffer | Uint8Array): Promise<ParsedDeck> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new IngestError(
      "This doesn't look like a .pptx file. Old .ppt files are not supported: open it in PowerPoint and save as .pptx.",
    );
  }

  const presentation = await readXml(zip, 'ppt/presentation.xml');
  if (!presentation) throw new IngestError("This file is a zip but not a PowerPoint deck (no ppt/presentation.xml).");

  const root = find(presentation, 'p:presentation')!;
  const sldSz = find(kids(root), 'p:sldSz');
  const size = {
    width: Number(sldSz && attr(sldSz, 'cx')) || 9144000,
    height: Number(sldSz && attr(sldSz, 'cy')) || 5143500,
  };

  const rels = await readRels(zip, 'ppt/presentation.xml');
  const idList = find(kids(root), 'p:sldIdLst');
  const slideRefs = idList ? findAll(kids(idList), 'p:sldId') : [];

  const slides: SlideContent[] = [];
  for (const ref of slideRefs) {
    const rel = rels.get(attr(ref, 'r:id') ?? '');
    if (!rel) continue;
    const slideXml = await readXml(zip, rel.target);
    if (!slideXml) continue;

    const out: Extracted = { title: null, paragraphs: [], imageAlts: [] };
    extractShapes(shapeTree(slideXml, 'p:sld'), out);

    let notes = '';
    for (const r of (await readRels(zip, rel.target)).values()) {
      if (r.type.endsWith('/notesSlide')) {
        const notesXml = await readXml(zip, r.target);
        if (notesXml) notes = notesText(notesXml);
      }
    }

    const sld = find(slideXml, 'p:sld');
    slides.push({
      index: slides.length + 1,
      title: out.title,
      paragraphs: out.paragraphs,
      notes,
      imageAlts: out.imageAlts,
      hidden: sld ? attr(sld, 'show') === '0' : false,
    });
  }

  if (slides.length === 0) throw new IngestError('No slides found in this deck.');
  return { slides, size };
}

export const visibleSlides = (deck: ParsedDeck): SlideContent[] => deck.slides.filter((s) => !s.hidden);
