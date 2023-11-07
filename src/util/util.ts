import path from 'path';
import fs from 'fs-extra';
import { Worksheet } from 'exceljs';
import { marked } from 'marked';

export function getVersion(): string {
    const packageJSONPath = path.join(__dirname, '..', '..', 'package.json');
    if (fs.existsSync(packageJSONPath)) {
        const igDataDictVersion = fs.readJSONSync(packageJSONPath)?.version;
        return `ig-summary tool - v${igDataDictVersion}`;
    }
    return 'unknown';
}

export function autosizeColumns(sheet: Worksheet) {
    // Based on https://stackoverflow.com/a/64097746
    if (!sheet.columns) return;
    sheet.columns.forEach(column => {
        let maxLength = 0;
        column['eachCell']({ includeEmpty: true }, cell => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        column.width = maxLength < 10 ? 10 : maxLength;
        column.alignment = { vertical: 'top', horizontal: 'left' };
    });
}

// Set long columns to a fixed with and text wrapping
export function setForColumnInTable(
    sheet: Worksheet,
    table: string,
    name: string,
    width: number
): void {
    if (!sheet.columns || !sheet.getTable(table)) return;

    const colNum =
        sheet
            .getTable(table)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - typescript does not like this but it works fine
            .table.columns.map(col => {
                return col.name;
            })
            .indexOf(name) + 1;
    sheet.getColumn(colNum).width = width;
    sheet.getColumn(colNum).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
}
export function setForColumn(sheet: Worksheet, colKey: number | string, width: number): void {
    if (!sheet.columns) return;
    const col = sheet.getColumn(colKey);
    col.width = width;
    col.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
}
export function resizeLongColumns(sheet: Worksheet, table: string): void {
    setForColumnInTable(sheet, table, 'Definition', 75);
    setForColumnInTable(sheet, table, 'Data Type', 30);
    setForColumnInTable(sheet, table, 'Value Set URI', 30);
}

export function setProfileElementsView(sheet: Worksheet): void {
    sheet.getRows(1, sheet.rowCount + 1).forEach(row => {
        row.font = { name: 'Helvetica' };
    });
    sheet.views = [
        {
            topLeftCell: 'D2',
            activeCell: 'A1',
            zoomScale: 130,
            state: 'frozen',
            xSplit: 3,
            ySplit: 1
        }
    ];
    sheet.getRow(1).font = { name: 'Helvetica', bold: true, color: { argb: 'FFFFFFFF' } };
}

export function setTableView(sheet: Worksheet): void {
    sheet.getRows(1, sheet.rowCount + 1).forEach(row => {
        row.font = { name: 'Helvetica' };
    });
    sheet.views = [
        {
            topLeftCell: 'A1',
            activeCell: 'A1',
            zoomScale: 130
        }
    ];
    sheet.getRow(1).font = { name: 'Helvetica', bold: true, color: { argb: 'FFFFFFFF' } };
}

export function verifyFileExists(path: string): boolean {
    try {
        if (fs.existsSync(path)) {
            return true;
        } else {
            return false;
        }
    } catch (err) {
        return false;
    }
}

export function markdownToExcel(md: string): any {
    const lexer = new marked.Lexer();
    const tokens = lexer.lex(md);

    const unsupportedSyntax = tokens
        .filter(x => {
            return !['paragraph', 'space', 'list'].includes(x.type);
        })
        .map(x => {
            return x.type;
        });

    if (unsupportedSyntax.length > 0) {
        throw `Unsupported Markdown syntax: ${unsupportedSyntax.join(', ')}`;
    }

    const output = [];
    for (const p of tokens) {
        if (p.type == 'space') {
            output.push({ text: '\n\n' });
            continue;
        }

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - typescript does not like `p.tokens` but it works fine
        if (p.tokens) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            for (const i in p.tokens) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const e = p.tokens[i];
                if (e.type == 'em') {
                    if (e.tokens && e.tokens[0].type == 'strong') {
                        output.push({
                            text: e.tokens[0].text,
                            font: { bold: true, italic: true, name: 'Helvetica', size: 11 }
                        });
                    } else {
                        output.push({
                            text: e.text,
                            font: { italic: true, name: 'Helvetica', size: 11 }
                        });
                    }
                } else if (e.type == 'strong') {
                    output.push({
                        text: e.text,
                        font: { bold: true, name: 'Helvetica', size: 11 }
                    });
                } else if (e.type == 'link') {
                    if (e.text == e.href) {
                        output.push({
                            text: `<${e.href}>`,
                            font: { name: 'Helvetica', size: 11 }
                        });
                    } else {
                        output.push({
                            text: `${e.text} <${e.href}>`,
                            font: { name: 'Helvetica', size: 11 }
                        });
                    }
                } else {
                    output.push({ text: e.text, font: { name: 'Helvetica', size: 11 } });
                }
            }
        }
    }

    // Fix quotes in output
    for (const i in output) {
        output[i].text = output[i].text
            .replaceAll('&quot;', '"')
            .replaceAll('&#39;', "'")
            .replaceAll('&gt;', '>')
            .replaceAll('&lt;', '<');
    }

    return { richText: output };
}
