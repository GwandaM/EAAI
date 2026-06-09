#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  access,
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';

const DISCOVERY_ORIGIN = 'https://www.discovery.co.za';
const DEFAULT_OUT_DIR = 'data/discovery-pdfs';
const DEFAULT_USER_AGENT =
  'EAAI-Discovery-PDF-KB-Crawler/1.0 (+https://www.discovery.co.za; public product brochure retrieval)';

const DEFAULT_SEED_URLS = [
  '/',
  '/bank',
  '/bank/accounts',
  '/medical-aid',
  '/medical-aid/find-documents',
  '/more-health-cover/gap-cover-products',
  '/more-health-cover/flexicare',
  '/life-insurance',
  '/investments',
  '/car-and-home-insurance',
  '/vitality',
  '/travel',
  '/business',
];

const CRAWL_PATH_PREFIXES = [
  '/bank',
  '/medical-aid',
  '/more-health-cover',
  '/life-insurance',
  '/investments',
  '/invest',
  '/car-and-home-insurance',
  '/vitality',
  '/travel',
  '/business',
  '/portal/bank',
  '/portal/individual',
  '/corporate/corporate-and-employee-benefits',
];

const SKIP_PATH_PATTERNS = [
  /^\/login\b/i,
  /^\/logout\b/i,
  /^\/register\b/i,
  /^\/online-banking\b/i,
  /^\/auth\b/i,
  /^\/content\/login\b/i,
  /^\/portal\/log/i,
  /^\/site-map\b/i,
  /^\/careers\b/i,
  /^\/search\b/i,
];

const SKIP_QUERY_KEYS = new Set([
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'msockid',
]);

const PDF_KEYWORDS = [
  'brochure',
  'product suite',
  'product-suite',
  'product update',
  'discoverer',
  'guide',
  'plan guide',
  'plans',
  'benefit',
  'benefits',
  'premium',
  'premiums',
  'contribution',
  'contributions',
  'cover',
  'factsheet',
  'fact sheet',
  'fact-sheet',
  'fund',
  'funds',
  'fee',
  'fees',
  'pricing',
  'travel insurance',
  'medical aid',
  'gap cover',
  'flexicare',
  'life cover',
  'business assurance',
  'retirement funds',
  'group risk',
  'healthy company',
];

const PRODUCT_LABELS = [
  ['bank', /^\/bank\b|^\/portal\/bank\b/i],
  ['medical-aid', /^\/medical-aid\b/i],
  ['more-health-cover', /^\/more-health-cover\b/i],
  ['life-insurance', /^\/life-insurance\b/i],
  ['investments', /^\/invest(ments)?\b/i],
  ['car-and-home-insurance', /^\/car-and-home-insurance\b/i],
  ['vitality', /^\/vitality\b/i],
  ['travel', /^\/travel\b|^\/portal\/bank\/vitality-travel\b/i],
  ['business', /^\/business\b|^\/corporate\/corporate-and-employee-benefits\b/i],
];

function parseArgs(argv) {
  const args = {
    allPdfs: false,
    concurrency: 8,
    delayMs: 75,
    dryRun: false,
    force: false,
    includeSubdomains: true,
    maxDepth: 4,
    maxPages: 400,
    maxPdfs: Number.POSITIVE_INFINITY,
    outDir: DEFAULT_OUT_DIR,
    respectRobots: true,
    timeoutMs: 30000,
    userAgent: DEFAULT_USER_AGENT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === '--') continue;
    else if (arg === '--all-pdfs') args.allPdfs = true;
    else if (arg === '--brochure-filter') args.allPdfs = false;
    else if (arg === '--concurrency') args.concurrency = positiveInteger(nextValue(), arg);
    else if (arg === '--delay-ms') args.delayMs = positiveInteger(nextValue(), arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--max-depth') args.maxDepth = positiveInteger(nextValue(), arg);
    else if (arg === '--max-pages') args.maxPages = positiveInteger(nextValue(), arg);
    else if (arg === '--max-pdfs') args.maxPdfs = positiveInteger(nextValue(), arg);
    else if (arg === '--no-robots') args.respectRobots = false;
    else if (arg === '--no-subdomains') args.includeSubdomains = false;
    else if (arg === '--out') args.outDir = nextValue();
    else if (arg === '--seed') args.seedUrls = [...(args.seedUrls ?? []), nextValue()];
    else if (arg === '--timeout-ms') args.timeoutMs = positiveInteger(nextValue(), arg);
    else if (arg === '--user-agent') args.userAgent = nextValue();
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function positiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${flag} expects a positive integer`);
  }
  return number;
}

function printHelp() {
  console.log(`
Download public Discovery product PDF brochures for knowledge-base ingestion.

Usage:
  npm run download:discovery-pdfs -- [options]
  node scripts/download-discovery-pdfs.mjs [options]

Options:
  --out <dir>          Output directory. Default: ${DEFAULT_OUT_DIR}
  --all-pdfs           Download every public PDF discovered under product pages.
                       Default filters to brochure-like guides, products,
                       factsheets, benefits, premiums, and cover documents.
  --max-depth <n>      Maximum link depth from seed pages. Default: 4
  --max-pages <n>      Maximum HTML pages to crawl. Default: 400
  --max-pdfs <n>       Maximum PDFs to download; stops crawl early. Default: unlimited
  --concurrency <n>    Concurrent page/PDF fetches. Default: 8
  --delay-ms <n>       Delay before each request. Default: 75
  --dry-run            Crawl and report matching PDFs without writing files.
  --force              Redownload files already present in the manifest.
  --seed <url>         Add a seed URL. Can be passed more than once.
  --no-robots          Do not apply robots.txt rules.
  --no-subdomains      Do not download PDFs from Discovery subdomains.
  --timeout-ms <n>     Request timeout. Default: 30000
  --user-agent <ua>    Custom User-Agent header.
  -h, --help           Show this help.

Examples:
  npm run download:discovery-pdfs
  npm run download:discovery-pdfs -- --all-pdfs --out knowledge-base/discovery
  npm run download:discovery-pdfs -- --dry-run --max-pages 50
  npm run download:discovery-pdfs -- --max-pages 150 --max-depth 2
`);
}

class RobotsRules {
  constructor({ allows = [], disallows = [] } = {}) {
    this.allows = allows;
    this.disallows = disallows;
  }

  static allowAll() {
    return new RobotsRules();
  }

  allowsUrl(url) {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const longestAllow = longestMatchingRule(path, this.allows);
    const longestDisallow = longestMatchingRule(path, this.disallows);
    if (!longestDisallow) return true;
    if (!longestAllow) return false;
    return longestAllow.length >= longestDisallow.length;
  }
}

function longestMatchingRule(path, rules) {
  let match = '';
  for (const rule of rules) {
    if (matchesRobotsRule(path, rule) && rule.length > match.length) {
      match = rule;
    }
  }
  return match;
}

function matchesRobotsRule(path, rule) {
  if (!rule) return false;
  if (!rule.includes('*') && !rule.endsWith('$')) return path.startsWith(rule);

  let source = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  source = source.replaceAll('*', '.*');
  if (source.endsWith('$')) {
    source = source.slice(0, -1) + '$';
  } else {
    source += '.*';
  }
  return new RegExp(`^${source}`).test(path);
}

async function fetchRobotsRules(options) {
  if (!options.respectRobots) return RobotsRules.allowAll();

  const robotsUrl = new URL('/robots.txt', DISCOVERY_ORIGIN).href;
  try {
    const response = await fetchWithTimeout(robotsUrl, options, { accept: 'text/plain,*/*' });
    if (!response.ok) {
      console.warn(`robots.txt returned HTTP ${response.status}; continuing with allow-all rules.`);
      return RobotsRules.allowAll();
    }
    const text = await response.text();
    return parseRobotsTxt(text, 'EAAI-Discovery-PDF-KB-Crawler');
  } catch (error) {
    console.warn(`Could not fetch robots.txt (${error.message}); continuing with allow-all rules.`);
    return RobotsRules.allowAll();
  }
}

function parseRobotsTxt(text, userAgent) {
  const target = userAgent.toLowerCase();
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      if (!current || current.hasRules) {
        current = { agents: [], allows: [], disallows: [], hasRules: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if (key === 'allow') {
      current.allows.push(value);
      current.hasRules = true;
    } else if (key === 'disallow') {
      if (value) current.disallows.push(value);
      current.hasRules = true;
    }
  }

  const exact = groups.find((group) => group.agents.some((agent) => target.includes(agent)));
  const wildcard = groups.find((group) => group.agents.includes('*'));
  const selected = exact ?? wildcard;

  if (!selected) return RobotsRules.allowAll();
  return new RobotsRules({ allows: selected.allows, disallows: selected.disallows });
}

async function fetchWithTimeout(url, options, overrides = {}) {
  await sleep(options.delayMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        Accept: overrides.accept ?? 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
        'User-Agent': options.userAgent,
        ...overrides.headers,
      },
      method: overrides.method ?? 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canonicalUrl(value, base = DISCOVERY_ORIGIN) {
  const url = new URL(value, base);
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || SKIP_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  const sorted = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
  url.search = '';
  for (const [key, val] of sorted) url.searchParams.append(key, val);

  return url.href;
}

function isDiscoveryHost(hostname, includeSubdomains) {
  const host = hostname.toLowerCase();
  if (host === 'www.discovery.co.za' || host === 'discovery.co.za') return true;
  return includeSubdomains && host.endsWith('.discovery.co.za');
}

function canCrawlHtml(url, robotsRules) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'www.discovery.co.za') return false;
  if (SKIP_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname))) return false;
  if (parsed.pathname !== '/' && !CRAWL_PATH_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  return robotsRules.allowsUrl(parsed.href);
}

function canDownloadPdf(url, options, robotsRules) {
  const parsed = new URL(url);
  if (!isDiscoveryHost(parsed.hostname, options.includeSubdomains)) return false;
  return robotsRules.allowsUrl(parsed.href);
}

function hasPdfExtension(url) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function looksLikeBrochurePdf(candidate) {
  const haystack = normalizeText(
    `${candidate.url} ${candidate.text ?? ''} ${candidate.sourceUrl ?? ''}`,
  );
  return PDF_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function normalizeText(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractLinks(html, pageUrl) {
  const links = [];
  const seen = new Set();
  const push = (url, text, kind) => {
    try {
      const canonical = canonicalUrl(url, pageUrl);
      if (seen.has(`${kind}:${canonical}:${text}`)) return;
      seen.add(`${kind}:${canonical}:${text}`);
      links.push({ kind, text: normalizeText(text), url: canonical });
    } catch {
      // Ignore malformed or non-web URLs.
    }
  };

  const anchorPattern = /<a\b[^>]*?\bhref\s*=\s*(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    push(decodeHtmlAttribute(match[2]), match[3], 'anchor');
  }

  const attrPattern = /\b(?:href|src|data-href|data-url|data-src)\s*=\s*(['"])(.*?)\1/gi;
  while ((match = attrPattern.exec(html)) !== null) {
    push(decodeHtmlAttribute(match[2]), '', 'attribute');
  }

  const pdfUrlPattern = /https?:\/\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?/gi;
  while ((match = pdfUrlPattern.exec(html)) !== null) {
    push(match[0], '', 'inline-pdf-url');
  }

  return links.filter(({ url }) => {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  });
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function productTypeFor(url, fallbackUrl) {
  for (const source of [url, fallbackUrl]) {
    if (!source) continue;
    const parsed = new URL(source);
    const found = PRODUCT_LABELS.find(([, pattern]) => pattern.test(parsed.pathname));
    if (found) return found[0];
  }
  return 'other';
}

function filenameForPdf(pdfUrl, productType, usedFilenames) {
  const parsed = new URL(pdfUrl);
  let name = decodeURIComponent(basename(parsed.pathname));
  if (!name || !/\.pdf$/i.test(name)) {
    name = `discovery-${hashValue(pdfUrl).slice(0, 10)}.pdf`;
  }

  name = sanitizeFilename(name);
  const hash = hashValue(pdfUrl).slice(0, 10);
  let candidate = join('pdfs', productType, name);

  if (usedFilenames.has(candidate)) {
    const stem = name.replace(/\.pdf$/i, '');
    candidate = join('pdfs', productType, `${stem}-${hash}.pdf`);
  }

  usedFilenames.add(candidate);
  return candidate;
}

function sanitizeFilename(name) {
  return name
    .replace(/[^\w.+=@()-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
}

function hashValue(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadExistingManifest(outDir) {
  const manifestPath = join(outDir, 'manifest.json');
  if (!(await pathExists(manifestPath))) return [];

  const raw = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${manifestPath} must contain a JSON array`);
  }
  return parsed;
}

async function saveManifest(outDir, records) {
  const sorted = [...records].sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`);
}

function uniqueRecords(records) {
  const bySource = new Map();
  for (const record of records) bySource.set(record.sourceUrl, record);
  return [...bySource.values()];
}

async function downloadPdf(candidate, options, manifestRecords, usedFilenames) {
  const existing = manifestRecords.find((record) => record.sourceUrl === candidate.url);
  const productType = productTypeFor(candidate.sourceUrl, candidate.url);
  const file = existing?.file ?? filenameForPdf(candidate.url, productType, usedFilenames);
  const destination = join(options.outDir, file);

  if (existing && !options.force && (await pathExists(destination))) {
    return { skipped: true, reason: 'already in manifest', record: existing };
  }

  if (options.dryRun) {
    return {
      downloaded: false,
      record: {
        bytes: 0,
        contentType: null,
        discoveredOn: candidate.sourceUrl,
        downloadedAt: null,
        file,
        linkText: candidate.text,
        productType,
        sha256: null,
        sourceUrl: candidate.url,
      },
    };
  }

  await mkdir(dirname(destination), { recursive: true });
  const response = await fetchWithTimeout(candidate.url, options, {
    accept: 'application/pdf,*/*;q=0.8',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/pdf') && !hasPdfExtension(response.url)) {
    throw new Error(`not a PDF response (${contentType || 'no content-type'})`);
  }

  const tempPath = `${destination}.tmp`;
  const hash = createHash('sha256');
  let bytes = 0;
  const output = createWriteStream(tempPath);

  const countingStream = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      hash.update(chunk);
      controller.enqueue(chunk);
    },
  });

  await pipeline(response.body.pipeThrough(countingStream), output);
  await rename(tempPath, destination);

  const record = {
    bytes,
    contentType,
    discoveredOn: candidate.sourceUrl,
    downloadedAt: new Date().toISOString(),
    file,
    linkText: candidate.text,
    productType,
    sha256: hash.digest('hex'),
    sourceUrl: candidate.url,
  };

  await appendFile(join(options.outDir, 'manifest.jsonl'), `${JSON.stringify(record)}\n`);
  return { downloaded: true, record };
}

async function crawl(options) {
  if (!options.dryRun) {
    await mkdir(options.outDir, { recursive: true });
  }

  const robotsRules = await fetchRobotsRules(options);
  const queue = [];
  const queuedPages = new Set();
  const visitedPages = new Set();
  const pdfCandidates = new Map();
  const failedPages = [];
  const failedPdfs = [];
  const manifestRecords = await loadExistingManifest(options.outDir);
  const usedFilenames = new Set(manifestRecords.map((record) => record.file).filter(Boolean));

  const enqueuePage = (url, depth = 0) => {
    if (depth > options.maxDepth) return;
    const canonical = canonicalUrl(url);
    if (queuedPages.has(canonical) || visitedPages.has(canonical)) return;
    if (!canCrawlHtml(canonical, robotsRules)) return;
    queuedPages.add(canonical);
    queue.push({ depth, url: canonical });
  };

  for (const seed of [...DEFAULT_SEED_URLS, ...(options.seedUrls ?? [])]) enqueuePage(seed);

  let active = 0;
  let pagesCrawled = 0;
  let pagesRequested = 0;
  let stoppedByPdfLimit = false;
  let stoppedByLimit = false;

  const hasEnoughPdfCandidates = () => {
    if (!Number.isFinite(options.maxPdfs)) return false;
    let count = 0;
    for (const candidate of pdfCandidates.values()) {
      if (options.allPdfs || looksLikeBrochurePdf(candidate)) count += 1;
      if (count >= options.maxPdfs) return true;
    }
    return false;
  };

  async function worker() {
    while (queue.length > 0) {
      if (pagesRequested >= options.maxPages) {
        stoppedByLimit = true;
        break;
      }
      if (hasEnoughPdfCandidates()) {
        stoppedByPdfLimit = true;
        break;
      }

      const page = queue.shift();
      queuedPages.delete(page.url);
      if (!page || visitedPages.has(page.url)) continue;

      visitedPages.add(page.url);
      pagesRequested += 1;
      active += 1;
      try {
        const response = await fetchWithTimeout(page.url, options);
        const contentType = response.headers.get('content-type') ?? '';

        if (!response.ok) {
          failedPages.push({ error: `HTTP ${response.status}`, url: page.url });
          continue;
        }

        if (contentType.toLowerCase().includes('application/pdf') || hasPdfExtension(response.url)) {
          collectPdfCandidate(pdfCandidates, {
            sourceUrl: page.url,
            text: '',
            url: canonicalUrl(response.url),
          }, options, robotsRules);
          continue;
        }

        if (!contentType.toLowerCase().includes('text/html')) continue;

        const html = await response.text();
        pagesCrawled += 1;

        for (const link of extractLinks(html, page.url)) {
          const linkedUrl = canonicalUrl(link.url);
          if (hasPdfExtension(linkedUrl) || link.text.includes('pdf')) {
            collectPdfCandidate(pdfCandidates, {
              sourceUrl: page.url,
              text: link.text,
              url: linkedUrl,
            }, options, robotsRules);
          } else if (canCrawlHtml(linkedUrl, robotsRules)) {
            enqueuePage(linkedUrl, page.depth + 1);
          }
        }

        if (pagesCrawled % 25 === 0) {
          console.log(
            `crawled=${pagesCrawled} queued=${queue.length} pdfCandidates=${pdfCandidates.size} active=${active}`,
          );
        }
      } catch (error) {
        failedPages.push({ error: error.message, url: page.url });
      } finally {
        active -= 1;
      }
    }

    if (pagesRequested >= options.maxPages) stoppedByLimit = true;
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));

  const candidates = [...pdfCandidates.values()]
    .filter((candidate) => options.allPdfs || looksLikeBrochurePdf(candidate))
    .slice(0, options.maxPdfs);

  console.log(`Matched ${candidates.length} PDF${candidates.length === 1 ? '' : 's'} for download.`);

  const downloadedRecords = [];
  let pdfIndex = 0;

  async function pdfWorker() {
    while (pdfIndex < candidates.length) {
      const candidate = candidates[pdfIndex];
      pdfIndex += 1;

      try {
        const result = await downloadPdf(candidate, options, manifestRecords, usedFilenames);
        if (result.record && !result.skipped) {
          downloadedRecords.push(result.record);
          console.log(`${options.dryRun ? 'would download' : 'downloaded'} ${result.record.file}`);
        } else if (result.skipped) {
          console.log(`skipped ${candidate.url} (${result.reason})`);
        }
      } catch (error) {
        failedPdfs.push({ error: error.message, url: candidate.url, discoveredOn: candidate.sourceUrl });
        console.warn(`failed ${candidate.url}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => pdfWorker()));

  const combinedRecords = uniqueRecords([...manifestRecords, ...downloadedRecords]);
  if (!options.dryRun) await saveManifest(options.outDir, combinedRecords);

  const crawlReport = {
    completedAt: new Date().toISOString(),
    downloaded: downloadedRecords.length,
    dryRun: options.dryRun,
    failedPages,
    failedPdfs,
    matchedPdfs: candidates.length,
    outputDirectory: options.outDir,
    pagesCrawled,
    pagesRequested,
    pagesQueuedButNotCrawled: queue.length,
    stoppedByLimit,
    stoppedByPdfLimit,
    totalManifestRecords: combinedRecords.length,
  };

  if (!options.dryRun) {
    await writeFile(join(options.outDir, 'crawl-report.json'), `${JSON.stringify(crawlReport, null, 2)}\n`);
  }

  return crawlReport;
}

function collectPdfCandidate(pdfCandidates, candidate, options, robotsRules) {
  if (!canDownloadPdf(candidate.url, options, robotsRules)) return;
  const existing = pdfCandidates.get(candidate.url);
  if (!existing || candidate.text.length > existing.text.length) {
    pdfCandidates.set(candidate.url, candidate);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log(`Starting Discovery PDF crawl from ${DISCOVERY_ORIGIN}`);
  console.log(`Output: ${options.dryRun ? '(dry run)' : relative(process.cwd(), options.outDir) || options.outDir}`);
  console.log(`Filter: ${options.allPdfs ? 'all PDFs' : 'brochure/product-guide PDFs'}`);
  console.log(`Limits: maxPages=${options.maxPages} maxDepth=${options.maxDepth} concurrency=${options.concurrency}`);

  const report = await crawl(options);

  console.log('\nDone.');
  console.log(`Pages requested: ${report.pagesRequested}`);
  console.log(`HTML pages crawled: ${report.pagesCrawled}`);
  console.log(`Matched PDFs: ${report.matchedPdfs}`);
  console.log(`${options.dryRun ? 'Would download' : 'Downloaded'}: ${report.downloaded}`);
  if (report.stoppedByPdfLimit) console.log('Stopped because --max-pdfs was reached.');
  console.log(`Failed pages: ${report.failedPages.length}`);
  console.log(`Failed PDFs: ${report.failedPdfs.length}`);

  if (!options.dryRun) {
    console.log(`Manifest: ${join(options.outDir, 'manifest.json')}`);
    console.log(`Report: ${join(options.outDir, 'crawl-report.json')}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
