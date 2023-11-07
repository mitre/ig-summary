import { markdownToExcel } from '../../src/util/util';

describe('markdownToExcel', () => {
    test('should parse plain text', () => {
        expect(markdownToExcel('test input')).toStrictEqual({
            richText: [
                {
                    text: 'test input',
                    font: { name: 'Helvetica', size: 11 }
                }
            ]
        });
    });

    test('should not use smart quotes', () => {
        // eslint-disable-next-line quotes
        expect(markdownToExcel(`"test" 'input'`)).toStrictEqual({
            richText: [
                {
                    // eslint-disable-next-line quotes
                    text: `"test" 'input'`,
                    font: { name: 'Helvetica', size: 11 }
                }
            ]
        });
    });

    test('should parse bold text', () => {
        expect(markdownToExcel('test **bold** input')).toStrictEqual({
            richText: [
                { text: 'test ', font: { name: 'Helvetica', size: 11 } },
                { text: 'bold', font: { bold: true, name: 'Helvetica', size: 11 } },
                { text: ' input', font: { name: 'Helvetica', size: 11 } }
            ]
        });
    });

    test('should parse italic text', () => {
        expect(markdownToExcel('test *italic* input')).toStrictEqual({
            richText: [
                { text: 'test ', font: { name: 'Helvetica', size: 11 } },
                { text: 'italic', font: { italic: true, name: 'Helvetica', size: 11 } },
                { text: ' input', font: { name: 'Helvetica', size: 11 } }
            ]
        });
    });

    test('should parse bold italic text', () => {
        expect(markdownToExcel('test ***bold italic*** input')).toStrictEqual({
            richText: [
                { text: 'test ', font: { name: 'Helvetica', size: 11 } },
                {
                    text: 'bold italic',
                    font: { italic: true, bold: true, name: 'Helvetica', size: 11 }
                },
                { text: ' input', font: { name: 'Helvetica', size: 11 } }
            ]
        });
    });

    test('should parse text with multiple paragraphs', () => {
        expect(markdownToExcel('test\n\nparagraph\n\ninput')).toStrictEqual({
            richText: [
                { text: 'test', font: { name: 'Helvetica', size: 11 } },
                { text: '\n\n' },
                { text: 'paragraph', font: { name: 'Helvetica', size: 11 } },
                { text: '\n\n' },
                { text: 'input', font: { name: 'Helvetica', size: 11 } }
            ]
        });
    });

    test('should parse hyperlink text', () => {
        expect(markdownToExcel('test [hyperlink](http://example.com) input')).toStrictEqual({
            richText: [
                { text: 'test ', font: { name: 'Helvetica', size: 11 } },
                { text: 'hyperlink <http://example.com>', font: { name: 'Helvetica', size: 11 } },
                { text: ' input', font: { name: 'Helvetica', size: 11 } }
            ]
        });
    });
});
