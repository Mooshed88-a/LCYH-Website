import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "content", "凌城烟火宣传文案.md");
const mediaDir = path.join(root, "assets", "media");
const outputDir = path.join(root, "intro");
const outputPath = path.join(outputDir, "index.html");

const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
const remotePattern = /^https?:\/\//i;

await mkdir(mediaDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const sourceMarkdown = await readFile(sourcePath, "utf8");
const { markdown, images } = await localizeImages(sourceMarkdown);
const page = renderPage(markdown, images);

await writeFile(outputPath, page, "utf8");

console.log(`Generated ${path.relative(root, outputPath)}`);
console.log(`Localized ${images.filter((image) => image.localized).length} image(s)`);

async function localizeImages(markdown) {
  let imageIndex = 0;
  const seen = new Map();
  const images = [];

  const rewritten = await replaceAsync(markdown, imagePattern, async (match, alt, rawSrc) => {
    imageIndex += 1;
    const src = rawSrc.trim();
    const record = { alt, original: src, localized: false, src };

    if (remotePattern.test(src)) {
      const cached = await cacheRemoteImage(src, imageIndex);
      if (cached) {
        record.localized = true;
        record.src = cached.relativeFromIntro;
      }
      images.push(record);
      return `![${alt}](${record.src})`;
    }

    const absolute = path.isAbsolute(src) ? src : path.resolve(path.dirname(sourcePath), src);
    if (!existsSync(absolute)) {
      images.push(record);
      return match;
    }

    const key = absolute.toLowerCase();
    let target = seen.get(key);
    if (!target) {
      target = await copyLocalImage(absolute, imageIndex);
      seen.set(key, target);
    }

    record.localized = true;
    record.src = target.relativeFromIntro;
    images.push(record);
    return `![${alt}](${record.src})`;
  });

  return { markdown: rewritten.replace(/\)(?=!\[)/g, ")\n"), images };
}

async function cacheRemoteImage(url, index) {
  const fallbackExt = extensionFromRemoteUrl(url) || ".png";
  const fallbackName = `${String(index).padStart(2, "0")}-remote-${hash(url)}${fallbackExt}`;
  const fallbackPath = path.join(mediaDir, fallbackName);
  if (existsSync(fallbackPath)) {
    return {
      absolute: fallbackPath,
      relativeFromIntro: `../assets/media/${fallbackName}`,
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; lcyh-static-site-builder/1.0)",
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    const ext = extensionFromContentType(type) || fallbackExt;
    const name = `${String(index).padStart(2, "0")}-remote-${hash(url)}${ext}`;
    const absolute = path.join(mediaDir, name);
    const data = Buffer.from(await response.arrayBuffer());
    await writeFile(absolute, data);
    return {
      absolute,
      relativeFromIntro: `../assets/media/${name}`,
    };
  } catch {
    return null;
  }
}

async function copyLocalImage(absolute, index) {
  const ext = path.extname(absolute) || ".png";
  const base = slugify(path.basename(absolute, ext)) || "image";
  const name = `${String(index).padStart(2, "0")}-${base}${ext.toLowerCase()}`;
  const target = path.join(mediaDir, name);
  await copyFile(absolute, target);
  return {
    absolute: target,
    relativeFromIntro: `../assets/media/${name}`,
  };
}

function renderPage(markdown, images) {
  const title = extractTitle(markdown) || "凌城烟火";
  const displayTitle = title
    .replace(/^✨\s*/, "")
    .replace(/\s*-\s*Minecraft\s*群组服务器\s*$/i, "");
  const rendered = markdownToHtml(markdown.replace(/^#\s+.+$/m, "").trim());
  const facts = extractFacts(markdown);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="凌城烟火 Minecraft 群组服务器介绍：新空岛、主服、监狱风云与福利活动。" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="../assets/css/site.css" />
  </head>
  <body class="intro-page">
    <header class="site-header">
      <p class="site-mark">凌城烟火</p>
      <nav class="site-nav" aria-label="页面导航">
        <a href="../index.html">主页</a>
        <a href="#intro-content">服务器介绍</a>
        <a href="#join">加入服务器</a>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">Minecraft 群组服务器</p>
          <h1 id="page-title">${escapeHtml(displayTitle)}</h1>
          <p>始于 2022 的多人服务器。这里收纳新空岛、主服、监狱风云和近期福利活动，方便新玩家快速了解玩法与入服信息。</p>
          <div class="hero-meta" aria-label="子服概览">
            <span>新空岛 · 26.1.2</span>
            <span>主服 · 1.20.4</span>
            <span>监狱 · 1.18.2</span>
          </div>
        </div>
      </section>

      <dl class="server-facts" aria-label="服务器基础信息">
        <div>
          <dt>服务器 IP</dt>
          <dd>${copyButton(facts.ip || "play.lcyh.top", "服务器 IP")}</dd>
        </div>
        <div>
          <dt>备用地址</dt>
          <dd>${copyButton(facts.backup || "play.lcyh.top:38873", "备用地址")}</dd>
        </div>
        <div>
          <dt>支持版本</dt>
          <dd>${escapeHtml(facts.support || "1.10.X - 26.2")}</dd>
        </div>
        <div>
          <dt>推荐版本</dt>
          <dd>${escapeHtml(facts.recommended || "26.1.2")}</dd>
        </div>
      </dl>

      <div class="content-shell" id="intro-content">
        <article class="prose">
${indent(rendered, 10)}
        </article>
      </div>
    </main>

    <footer class="site-footer">
      <p>凌城烟火 · Minecraft 群组服务器</p>
    </footer>
    <script>
      async function copyText(value) {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
          return;
        }

        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.top = "-1000px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }

      document.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-copy]");
        if (!target) return;

        try {
          await copyText(target.dataset.copy);
          target.dataset.copied = "true";
          window.setTimeout(() => {
            delete target.dataset.copied;
          }, 1300);
        } catch {
          target.dataset.copied = "failed";
          window.setTimeout(() => {
            delete target.dataset.copied;
          }, 1300);
        }
      });
    </script>
  </body>
</html>
`;
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 3);
      const text = inline(heading[2]);
      const id = heading[2].includes("加入服务器")
        ? "join"
        : heading[2].replace(/\s+/g, "-").replace(/[^\p{Letter}\p{Number}-]/gu, "");
      html.push(`<h${level}${id ? ` id="${escapeAttribute(id)}"` : ""}>${text}</h${level}>`);
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
    if (image) {
      flushParagraph();
      closeList();
      html.push(renderImage(image[1], image[2]));
      continue;
    }

    const quote = /^>\s*(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(unordered[1])}</li>`);
      continue;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}

function renderImage(alt, src) {
  const cleanAlt = alt.trim();
  return `<figure class="media-frame">
  <img src="${escapeAttribute(src)}" alt="${escapeAttribute(cleanAlt)}" />
</figure>`;
}

function inline(value) {
  return decorateCopyTargets(escapeHtml(value)
    .replace(/\n/g, "<br />")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" />`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
      return `<a href="${escapeAttribute(href.replace(/&amp;/g, "&"))}">${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>"));
}

function decorateCopyTargets(html) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      return part.replace(/play\.lcyh\.top:38873|play\.lcyh\.top|742356808/g, (value) => {
        const label = value === "742356808"
          ? "QQ 群号"
          : value.includes(":")
            ? "备用地址"
            : "服务器 IP";
        return copyButton(value, label);
      });
    })
    .join("");
}

function copyButton(value, label) {
  const safeValue = escapeAttribute(value);
  return `<button class="copy-button" type="button" data-copy="${safeValue}" aria-label="复制${escapeAttribute(label)}：${safeValue}">${escapeHtml(value)}</button>`;
}

function extractTitle(markdown) {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
}

function extractFacts(markdown) {
  return {
    ip: /服务器?\s*IP[：:]\s*([^\n]+)/i.exec(markdown)?.[1]?.replace(/\*\*/g, "").trim()
      || /\*\*IP[：:]\s*([^*]+)\*\*/i.exec(markdown)?.[1]?.trim(),
    backup: /备用[：:]\s*([^\n]+)/.exec(markdown)?.[1]?.trim(),
    support: /支持版本[：:]\s*([^\n]+)/.exec(markdown)?.[1]?.trim(),
    recommended: /推荐版本[：:]\s*([^\n]+)/.exec(markdown)?.[1]?.replace(/\*\*/g, "").trim(),
  };
}

function extensionFromContentType(type) {
  if (type.includes("jpeg")) return ".jpg";
  if (type.includes("png")) return ".png";
  if (type.includes("gif")) return ".gif";
  if (type.includes("webp")) return ".webp";
  return "";
}

function extensionFromRemoteUrl(src) {
  try {
    const url = new URL(src);
    const queryPath = url.searchParams.get("id");
    return queryPath ? path.extname(queryPath) : path.extname(url.pathname);
  } catch {
    return "";
  }
}

function hash(value) {
  let acc = 0;
  for (let index = 0; index < value.length; index += 1) {
    acc = (acc * 31 + value.charCodeAt(index)) >>> 0;
  }
  return acc.toString(36);
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function indent(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

async function replaceAsync(value, pattern, replacer) {
  const parts = [];
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    parts.push(value.slice(lastIndex, match.index));
    parts.push(await replacer(...match));
    lastIndex = match.index + match[0].length;
  }
  parts.push(value.slice(lastIndex));
  return parts.join("");
}
