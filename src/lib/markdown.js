/** Small dependency-free markdown renderer for notes (safe: escapes HTML first). */
function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|\W)\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
  );
  return out;
}
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let listType = null;
  let inTable = false;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        closeTable();
        out.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(raw));
      continue;
    }
    if (!line.trim()) {
      closeList();
      closeTable();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      closeTable();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeList();
      closeTable();
      out.push("<hr />");
      continue;
    }
    if (line.trim().startsWith("> ")) {
      closeList();
      closeTable();
      out.push(`<blockquote>${inline(line.trim().slice(2))}</blockquote>`);
      continue;
    }
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      closeTable();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      out.push(
        `<li style="list-style:none;margin-left:-1rem"><input type="checkbox" disabled${checked} />${inline(task[2])}</li>`,
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      closeTable();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      closeTable();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      const isDivider = cells.every((c) => /^:?-{2,}:?$/.test(c));
      if (isDivider) continue;
      closeList();
      if (!inTable) {
        out.push("<table><thead><tr>");
        out.push(cells.map((c) => `<th>${inline(c)}</th>`).join(""));
        out.push("</tr></thead><tbody>");
        inTable = true;
        continue;
      }
      out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      continue;
    }
    closeTable();
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) out.push("</code></pre>");
  closeList();
  closeTable();
  return out.join("\n");
}
export const SLASH_COMMANDS = [
  { label: "Heading 1", hint: "# ", insert: "# " },
  { label: "Heading 2", hint: "## ", insert: "## " },
  { label: "Heading 3", hint: "### ", insert: "### " },
  { label: "Bullet list", hint: "- item", insert: "- " },
  { label: "Numbered list", hint: "1. item", insert: "1. " },
  { label: "Checklist", hint: "- [ ] task", insert: "- [ ] " },
  { label: "Code block", hint: "```lang", insert: "```js\n\n```\n" },
  { label: "Quote", hint: "> quote", insert: "> " },
  { label: "Callout", hint: "> **Note**", insert: "> **Note** " },
  { label: "Table", hint: "3 columns", insert: "| A | B | C |\n| --- | --- | --- |\n|  |  |  |\n" },
  { label: "Divider", hint: "---", insert: "\n---\n" },
  { label: "Link", hint: "[text](url)", insert: "[text](https://)" },
  {
    label: "Collapsible",
    hint: "details",
    insert: "<details><summary>More</summary>\n\n\n\n</details>\n",
  },
];
