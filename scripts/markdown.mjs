// A small GitHub-flavored Markdown renderer for the synced project documents.
// It covers the syntax those documents use: ATX and setext headings, paragraphs,
// emphasis, code spans and fences, links, lists, block quotes, tables and rules.
// Raw HTML is escaped, except anchors (<a id>), images and a few inline tags.

const asciiPunctuation = /[!-/:-@[-`{-~]/;
const fenceOpen = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*?)[ \t]*$/;
const fenceClose = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const atxHeading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const thematicBreak = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const quoteLine = /^ {0,3}> ?(.*)$/;
const setextUnderline = /^ {0,3}(=+|-+)[ \t]*$/;
const tableDelimiter = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const htmlBlockStart = /^ {0,3}(?:<(?:a|img|br|p|div|details|summary|picture)\b|<!--)/i;
const anchorTag = /^<a\s+(?:id|name)\s*=\s*"([^"]+)"\s*>\s*<\/a>/i;
const allowedInlineTags = new Set(["kbd", "sub", "sup"]);

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Escapes text but keeps character references that are already valid.
function escapeText(text) {
  return text
    .replace(/&(?!#\d{1,7};|#x[0-9a-f]{1,6};|[a-z][a-z0-9]{1,31};)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

export function plainText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ""));
}

// Matches GitHub's heading anchors (github-slugger), including -1, -2 suffixes for repeats.
// reserve() records an id used by a raw <a id> anchor so a later heading doesn't repeat it.
export function createSlugger() {
  const occurrences = new Map();
  const slug = (text) => {
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    let candidate = base;
    while (occurrences.has(candidate)) {
      occurrences.set(base, (occurrences.get(base) ?? 0) + 1);
      candidate = `${base}-${occurrences.get(base)}`;
    }
    occurrences.set(candidate, 0);
    return candidate;
  };
  slug.reserve = (id) => {
    if (!occurrences.has(id)) occurrences.set(id, 0);
  };
  return slug;
}

const isBlank = (line) => /^[ \t]*$/.test(line);
const indentOf = (line) => /^ */.exec(line)[0].length;
const stripIndent = (line, count) => line.replace(new RegExp(`^ {0,${count}}`), "");
const expandLeadingTabs = (line) => line.replace(/^[ \t]+/, (lead) => lead.replace(/\t/g, "    "));

function listMarker(line) {
  const match = /^( {0,3})([-*+]|(\d{1,9})([.)]))([ \t]+|$)(.*)$/.exec(line);
  if (!match) return null;
  const [, lead, marker, number, delimiter, spaces, rest] = match;
  const padding = rest === "" || spaces.length > 4 ? 1 : spaces.length;
  return {
    indent: lead.length,
    ordered: number !== undefined,
    start: number === undefined ? null : Number(number),
    kind: number === undefined ? marker : delimiter,
    contentIndent: lead.length + marker.length + padding,
    content: " ".repeat(Math.max(0, spaces.length - padding)) + rest,
  };
}

function interruptsParagraph(line) {
  if (openFence(line)) return true;
  if (atxHeading.test(line) || thematicBreak.test(line) || quoteLine.test(line)) return true;
  if (/^ {0,3}<(?:p|div|details|summary)\b/i.test(line)) return true;
  const marker = listMarker(line);
  return Boolean(marker && marker.content.trim() !== "" && (!marker.ordered || marker.start === 1));
}

function openFence(line) {
  const match = fenceOpen.exec(line);
  if (!match || !/^ {0,3}(`{3,}|~{3,})/.test(line)) return null;
  if (match[2][0] === "`" && match[3].includes("`")) return null;
  return { indent: match[1].length, fence: match[2], info: match[3] };
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells = [];
  let current = "";
  for (let index = 0; index < row.length; index += 1) {
    if (row[index] === "\\" && row[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (row[index] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += row[index];
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length || !lines[index].includes("|")) return false;
  if (!tableDelimiter.test(lines[index + 1]) || !lines[index + 1].includes("-")) return false;
  return splitRow(lines[index]).length === splitRow(lines[index + 1]).length;
}

// Parses lines into blocks. Each block records the [start, end) line range it consumed,
// so list items can tell blank-line-separated (loose) children from tight ones.
export function parseBlocks(lines) {
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const start = index;
    if (isBlank(line)) {
      index += 1;
      continue;
    }
    const fence = openFence(line);
    if (fence) {
      const body = [];
      index += 1;
      while (index < lines.length) {
        const close = fenceClose.exec(lines[index]);
        if (close && close[1][0] === fence.fence[0] && close[1].length >= fence.fence.length) {
          index += 1;
          break;
        }
        body.push(stripIndent(lines[index], fence.indent));
        index += 1;
      }
      blocks.push({ type: "code", lang: fence.info.split(/\s+/)[0].toLowerCase(), text: body.join("\n"), start, end: index });
      continue;
    }
    const heading = atxHeading.exec(line);
    if (heading) {
      const text = (heading[2] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim();
      blocks.push({ type: "heading", level: heading[1].length, text, start, end: index + 1 });
      index += 1;
      continue;
    }
    if (thematicBreak.test(line)) {
      blocks.push({ type: "hr", start, end: index + 1 });
      index += 1;
      continue;
    }
    if (quoteLine.test(line)) {
      const inner = [];
      while (index < lines.length && !isBlank(lines[index])) {
        const quoted = quoteLine.exec(lines[index]);
        if (quoted) inner.push(quoted[1]);
        else if (inner.length && !interruptsParagraph(lines[index])) inner.push(lines[index]);
        else break;
        index += 1;
      }
      blocks.push({ type: "quote", children: parseBlocks(inner), start, end: index });
      continue;
    }
    if (listMarker(line)) {
      const [list, next] = parseList(lines, index);
      blocks.push({ ...list, start, end: next });
      index = next;
      continue;
    }
    if (isTableStart(lines, index)) {
      const header = splitRow(line);
      const align = splitRow(lines[index + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : left ? "left" : "";
      });
      const rows = [];
      index += 2;
      while (index < lines.length && !isBlank(lines[index]) && !interruptsParagraph(lines[index])) {
        const cells = splitRow(lines[index]);
        rows.push(header.map((_, column) => cells[column] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", header, align, rows, start, end: index });
      continue;
    }
    if (htmlBlockStart.test(line)) {
      const html = [];
      while (index < lines.length && !isBlank(lines[index])) html.push(lines[index++]);
      blocks.push({ type: "html", text: html.join("\n"), start, end: index });
      continue;
    }
    if (indentOf(line) >= 4) {
      const body = [];
      while (index < lines.length && (isBlank(lines[index]) || indentOf(lines[index]) >= 4)) body.push(lines[index++].slice(4));
      while (body.length && isBlank(body.at(-1))) {
        body.pop();
        index -= 1;
      }
      blocks.push({ type: "code", lang: "", text: body.join("\n"), start, end: index });
      continue;
    }
    const paragraph = [line.replace(/^[ \t]+/, "")];
    index += 1;
    let setext = 0;
    while (index < lines.length && !isBlank(lines[index])) {
      const underline = setextUnderline.exec(lines[index]);
      if (underline) {
        setext = underline[1][0] === "=" ? 1 : 2;
        index += 1;
        break;
      }
      if (interruptsParagraph(lines[index])) break;
      paragraph.push(lines[index].replace(/^[ \t]+/, ""));
      index += 1;
    }
    const text = paragraph.join("\n");
    blocks.push(setext ? { type: "heading", level: setext, text: text.trim(), start, end: index } : { type: "paragraph", text, start, end: index });
  }
  return blocks;
}

function parseList(lines, startIndex) {
  const first = listMarker(lines[startIndex]);
  const list = { type: "list", ordered: first.ordered, number: first.start, items: [], loose: false };
  let marker = first;
  let index = startIndex;
  for (;;) {
    const itemLines = [marker.content];
    let fence = openFence(marker.content);
    let lastWasText = !fence && marker.content.trim() !== "";
    let next = index + 1;
    while (next < lines.length) {
      const line = lines[next];
      if (isBlank(line)) {
        let ahead = next;
        while (ahead < lines.length && isBlank(lines[ahead])) ahead += 1;
        if (ahead < lines.length && indentOf(lines[ahead]) >= marker.contentIndent) {
          while (next < ahead) {
            itemLines.push("");
            next += 1;
          }
          lastWasText = false;
          continue;
        }
        break;
      }
      if (indentOf(line) >= marker.contentIndent) {
        const content = stripIndent(line, marker.contentIndent);
        itemLines.push(content);
        if (fence) {
          const close = fenceClose.exec(content);
          if (close && close[1][0] === fence.fence[0] && close[1].length >= fence.fence.length) fence = null;
          lastWasText = false;
        } else {
          fence = openFence(content);
          lastWasText = !fence && !interruptsParagraph(content);
        }
        next += 1;
        continue;
      }
      if (fence || listMarker(line) || !lastWasText || interruptsParagraph(line)) break;
      itemLines.push(line.replace(/^[ \t]+/, ""));
      next += 1;
    }
    const children = parseBlocks(itemLines);
    if (children.some((child, position) => position > 0 && child.start > children[position - 1].end)) list.loose = true;
    list.items.push({ children });

    let ahead = next;
    while (ahead < lines.length && isBlank(lines[ahead])) ahead += 1;
    const sibling = ahead < lines.length ? listMarker(lines[ahead]) : null;
    const sameList = sibling && sibling.ordered === first.ordered && sibling.kind === first.kind && !thematicBreak.test(lines[ahead]);
    if (!sameList || sibling.indent >= marker.contentIndent) return [list, next];
    if (ahead > next) list.loose = true;
    marker = sibling;
    index = ahead;
  }
}

function findBacktickClose(text, from, length) {
  const pattern = /`+/g;
  pattern.lastIndex = from;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match[0].length === length) return match.index;
  }
  return -1;
}

// Parses [text](destination "title") starting at the opening bracket.
function parseLink(text, open) {
  let depth = 0;
  let close = -1;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      index += 1;
    } else if (character === "`") {
      const run = /^`+/.exec(text.slice(index))[0].length;
      const end = findBacktickClose(text, index + run, run);
      index = end < 0 ? index + run - 1 : end + run - 1;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close < 0 || text[close + 1] !== "(") return null;
  let index = close + 2;
  while (/[ \t\n]/.test(text[index] ?? "")) index += 1;
  let href = "";
  if (text[index] === "<") {
    const end = text.indexOf(">", index);
    if (end < 0) return null;
    href = text.slice(index + 1, end);
    index = end + 1;
  } else {
    let parens = 0;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (character === "\\" && asciiPunctuation.test(text[index + 1] ?? "")) {
        href += text[index + 1];
        index += 1;
      } else if (/[ \t\n]/.test(character)) {
        break;
      } else if (character === "(") {
        parens += 1;
        href += character;
      } else if (character === ")") {
        if (parens === 0) break;
        parens -= 1;
        href += character;
      } else {
        href += character;
      }
    }
  }
  while (/[ \t\n]/.test(text[index] ?? "")) index += 1;
  let title = "";
  const quote = { '"': '"', "'": "'", "(": ")" }[text[index]];
  if (quote) {
    const end = text.indexOf(quote, index + 1);
    if (end < 0) return null;
    title = text.slice(index + 1, end);
    index = end + 1;
    while (/[ \t\n]/.test(text[index] ?? "")) index += 1;
  }
  if (text[index] !== ")") return null;
  return { label: text.slice(open + 1, close), href, title, end: index + 1 };
}

function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    values[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values;
}

function renderImage(src, alt, size, context) {
  const width = /^\d+$/.test(size.width ?? "") ? ` width="${size.width}"` : "";
  const height = /^\d+$/.test(size.height ?? "") ? ` height="${size.height}"` : "";
  return `<img src="${escapeHtml(context.resolveImage(src))}" alt="${escapeHtml(alt)}"${width}${height} loading="lazy">`;
}

function sanitizeTag(tag, context) {
  const match = /^<(\/?)([a-z][a-z0-9]*)\b[^<>]*>$/i.exec(tag);
  if (!match) return null;
  const [, closing, rawName] = match;
  const name = rawName.toLowerCase();
  if (name === "br" && !closing) return "<br>";
  if (allowedInlineTags.has(name)) return `<${closing}${name}>`;
  if (name === "img" && !closing) {
    const values = attributes(tag);
    if (!values.src) return null;
    return renderImage(values.src, values.alt ?? "", values, context);
  }
  return null;
}

function emphasize(html) {
  return html
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, "$1<strong>$2</strong>")
    .replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_])_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
}

export function renderInline(source, context) {
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  let text = "";
  for (let index = 0; index < source.length;) {
    const character = source[index];
    const rest = source.slice(index);
    if (character === "\\") {
      const next = source[index + 1];
      if (next === "\n") {
        text += hold("<br>\n");
        index += 2;
        continue;
      }
      if (next && asciiPunctuation.test(next)) {
        text += hold(escapeHtml(next));
        index += 2;
        continue;
      }
    }
    if (character === "`") {
      const run = /^`+/.exec(rest)[0].length;
      const close = findBacktickClose(source, index + run, run);
      if (close >= 0) {
        let code = source.slice(index + run, close).replace(/\n/g, " ");
        if (code.length >= 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
        text += hold(`<code>${escapeHtml(code)}</code>`);
        index = close + run;
        continue;
      }
      text += "`".repeat(run);
      index += run;
      continue;
    }
    if (character === "!" && source[index + 1] === "[") {
      const image = parseLink(source, index + 1);
      if (image) {
        text += hold(renderImage(image.href, plainText(renderInline(image.label, context)), {}, context));
        index = image.end;
        continue;
      }
    }
    if (character === "[") {
      const link = parseLink(source, index);
      if (link) {
        const title = link.title ? ` title="${escapeHtml(link.title)}"` : "";
        text += hold(`<a href="${escapeHtml(context.resolveLink(link.href))}"${title}>${renderInline(link.label, context)}</a>`);
        index = link.end;
        continue;
      }
    }
    if (character === "<") {
      const autolink = /^<((?:https?|mailto):[^\s<>]*)>/i.exec(rest);
      if (autolink) {
        text += hold(`<a href="${escapeHtml(context.resolveLink(autolink[1]))}">${escapeHtml(autolink[1])}</a>`);
        index += autolink[0].length;
        continue;
      }
      const anchor = anchorTag.exec(rest);
      if (anchor) {
        context.anchors?.push(anchor[1]);
        context.slug?.reserve(anchor[1]);
        text += hold(`<span id="${escapeHtml(anchor[1])}"></span>`);
        index += anchor[0].length;
        continue;
      }
      const tag = /^<\/?[a-z][a-z0-9]*\b[^<>]*>/i.exec(rest);
      const safe = tag && sanitizeTag(tag[0], context);
      if (safe) {
        text += hold(safe);
        index += tag[0].length;
        continue;
      }
    }
    text += character;
    index += 1;
  }
  const html = emphasize(escapeText(text).replace(/ {2,}\n/g, "<br>\n"));
  return html.replace(/\u0000(\d+)\u0000/g, (_, position) => held[Number(position)]);
}

function renderBlocks(blocks, context, tight = false) {
  return blocks.map((block) => renderBlock(block, context, tight)).join("\n");
}

function renderBlock(block, context, tight) {
  switch (block.type) {
    case "heading": {
      const inner = renderInline(block.text, context);
      const text = plainText(inner).trim();
      const id = context.slug(text);
      context.headings.push({ level: block.level, id, text, html: inner });
      if (block.level <= 3) context.section = text;
      return `<h${block.level} id="${escapeHtml(id)}">${inner}</h${block.level}>`;
    }
    case "paragraph": {
      const inner = renderInline(block.text, context);
      return tight ? inner : `<p>${inner}</p>`;
    }
    case "code": {
      const language = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      const pre = `<pre tabindex="0"><code${language}>${escapeHtml(block.text)}</code></pre>`;
      if (block.lang !== "mermaid") return pre;
      const source = context.sourceUrl ? ` <a href="${escapeHtml(context.sourceUrl)}">View it rendered on GitHub</a>.` : "";
      return `<figure class="diagram">\n${pre}\n<figcaption>Diagram source (Mermaid).${source}</figcaption>\n</figure>`;
    }
    case "hr":
      return "<hr>";
    case "quote":
      return `<blockquote>\n${renderBlocks(block.children, context)}\n</blockquote>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start = block.ordered && block.number !== 1 ? ` start="${block.number}"` : "";
      const items = block.items.map((item) => `<li>${renderBlocks(item.children, context, !block.loose)}</li>`);
      return `<${tag}${start}>\n${items.join("\n")}\n</${tag}>`;
    }
    case "table": {
      const alignment = (column) => (block.align[column] ? ` class="align-${block.align[column]}"` : "");
      const head = block.header.map((cell, column) => `<th scope="col"${alignment(column)}>${renderInline(cell, context)}</th>`).join("");
      const rows = block.rows.map((row) => `<tr>${row.map((cell, column) => `<td${alignment(column)}>${renderInline(cell, context)}</td>`).join("")}</tr>`);
      const label = escapeHtml(`${context.section || context.title || "Document"} table`);
      return `<div class="table-scroll" role="group" aria-label="${label}" tabindex="0">\n<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>\n</div>`;
    }
    case "html": {
      const inner = renderInline(block.text, context).trim();
      return /^(?:<span id="[^"]*"><\/span>\s*)+$/.test(inner) ? inner : `<p>${inner}</p>`;
    }
    default:
      throw new Error(`Unknown block type ${block.type}`);
  }
}

// Renders a document. The first level-1 heading becomes the title and is returned separately;
// HTML-only blocks before it (such as a README logo) are dropped because the page header shows the logo.
export function renderMarkdown(markdown, options = {}) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n").map(expandLeadingTabs);
  let blocks = parseBlocks(lines);
  const context = {
    resolveLink: options.resolveLink ?? ((href) => href),
    resolveImage: options.resolveImage ?? ((src) => src),
    sourceUrl: options.sourceUrl,
    slug: createSlugger(),
    headings: [],
    anchors: [],
    section: "",
    title: "",
  };
  const titleIndex = blocks.findIndex((block) => block.type === "heading" && block.level === 1);
  let title = null;
  if (titleIndex >= 0 && blocks.slice(0, titleIndex).every((block) => block.type === "html")) {
    const block = blocks[titleIndex];
    const html = renderInline(block.text, context);
    const text = plainText(html).trim();
    title = { html, text, id: context.slug(text) };
    context.title = text;
    blocks = blocks.slice(titleIndex + 1);
  }
  const html = renderBlocks(blocks, context);
  const firstParagraph = blocks.find((block) => block.type === "paragraph");
  const summary = firstParagraph ? plainText(renderInline(firstParagraph.text, { ...context, headings: [], anchors: [] })).replace(/\s+/g, " ").trim() : "";
  return { title, html, headings: context.headings, anchors: context.anchors, summary };
}
