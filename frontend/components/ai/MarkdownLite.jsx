import { Fragment } from 'react';
import { cn } from '@/utils/cn';

// Minimal markdown renderer for AI chat responses — supports the subset the copilot
// engine actually emits (bold, `##` headings, `-` bullet lists, `1.` numbered lists,
// `| a | b |` tables) without pulling in a full markdown dependency.

const renderInline = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
};

const parseTableRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

const isTableSeparator = (line) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());

const parseBlocks = (text) => {
  const lines = (text ?? '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.trim().startsWith('|')) {
      const header = parseTableRow(line);
      i += 1;
      if (i < lines.length && isTableSeparator(lines[i])) i += 1;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^#{1,4}\s/.test(line)) {
      blocks.push({ type: 'heading', text: line.replace(/^#{1,4}\s/, '') });
      i += 1;
      continue;
    }

    if (/^[-*]\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^[-*]\s/.test(lines[i].trim()) && !/^\d+\.\s/.test(lines[i].trim()) && !lines[i].trim().startsWith('|') && !/^#{1,4}\s/.test(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', text: paraLines.join(' ') });
  }

  return blocks;
};

const MarkdownLite = ({ text, className }) => {
  const blocks = parseBlocks(text);

  return (
    <div className={cn('space-y-2.5 text-sm leading-relaxed', className)}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return <p key={idx} className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{renderInline(block.text)}</p>;
        }
        if (block.type === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-4 space-y-1">
              {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal pl-4 space-y-1">
              {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
            </ol>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={idx} className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    {block.header.map((h, i) => (
                      <th key={i} className="px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {block.rows.map((row, r) => (
                    <tr key={r} className="odd:bg-transparent even:bg-muted/25">
                      {row.map((cell, c) => (
                        <td key={c} className="px-2.5 py-1.5 whitespace-nowrap">{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={idx}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
};

export default MarkdownLite;
