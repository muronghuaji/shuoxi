import type { Chapter, Work } from './types'
import { createZip, type ZipEntry } from './zip'

const encoder = new TextEncoder()

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function textParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function chapterTitle(chapter: Chapter, index: number): string {
  const title = chapter.title.trim()
  if (/^第.+[章回节卷]/.test(title)) return title
  return `第 ${index + 1} 章 ${title || '未命名章节'}`
}

function chapterParagraphs(title: string, content: string, headingStyle = ''): string {
  return [
    `<w:p><w:pPr>${headingStyle}</w:pPr><w:r><w:t xml:space="preserve">${xml(title)}</w:t></w:r></w:p>`,
    ...textParagraphs(content).map(
      (paragraph) =>
        `<w:p><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${xml(paragraph)}</w:t></w:r></w:p>`,
    ),
  ].join('')
}

export function buildDocx(work: Work, chapters: Chapter[]): Uint8Array {
  const body = [
    `<w:p><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">${xml(work.title)}</w:t></w:r></w:p>`,
    work.synopsis
      ? `<w:p><w:pPr><w:spacing w:after="360"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${xml(work.synopsis)}</w:t></w:r></w:p>`
      : '',
    ...chapters.map((chapter, index) =>
      chapterParagraphs(chapterTitle(chapter, index), chapter.content, '<w:spacing w:before="360" w:after="180"/>'),
    ),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
  ].join('')
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rels) },
    { name: 'word/document.xml', data: encoder.encode(document) },
  ]
  return createZip(entries)
}

function xhtml(title: string, body: string, lang = 'zh-CN'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>${body}</body>
</html>`
}

export function buildEpub(work: Work, chapters: Chapter[], mapSvg?: string): Uint8Array {
  const chapterFiles = chapters.map((chapter, index) => ({
    name: `chapter-${String(index + 1).padStart(4, '0')}.xhtml`,
    title: chapterTitle(chapter, index),
    content: chapter.content,
  }))
  const navItems = [
    ...chapterFiles.map(
      (chapter) =>
        `<li><a href="${chapter.name}">${xml(chapter.title)}</a></li>`,
    ),
    ...(mapSvg ? ['<li><a href="map.xhtml">地图</a></li>'] : []),
  ].join('')
  const manifestItems = [
    ...chapterFiles.map(
      (chapter, index) =>
        `<item id="chapter-${index + 1}" href="${chapter.name}" media-type="application/xhtml+xml"/>`,
    ),
    ...(mapSvg
      ? ['<item id="map" href="map.xhtml" media-type="application/xhtml+xml"/>']
      : []),
  ].join('')
  const spineItems = [
    ...chapterFiles.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`),
    ...(mapSvg ? ['<itemref idref="map"/>'] : []),
  ].join('')
  const identifier = `urn:shuoxi:${work.id.replace(/[^a-z0-9-]/gi, '') || 'work'}`
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${xml(identifier)}</dc:identifier>
<dc:title>${xml(work.title)}</dc:title>
<dc:language>zh-CN</dc:language>
<dc:description>${xml(work.synopsis || work.theme || '')}</dc:description>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="styles.css" media-type="text/css"/>
${manifestItems}
</manifest>
<spine toc="ncx">${spineItems}</spine>
</package>`
  const nav = xhtml(
    '目录',
    `<nav epub:type="toc" id="toc" xmlns:epub="http://www.idpf.org/2007/ops"><h1>目录</h1><ol>${navItems}</ol></nav>`,
  )
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${xml(identifier)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${xml(work.title)}</text></docTitle>
<navMap>${chapterFiles
    .map(
      (chapter, index) =>
        `<navPoint id="navPoint-${index + 1}" playOrder="${index + 1}"><navLabel><text>${xml(chapter.title)}</text></navLabel><content src="${chapter.name}"/></navPoint>`,
    )
    .join('')}</navMap>
</ncx>`
  const css = `body { font-family: serif; line-height: 1.85; margin: 5%; color: #222; }
h1 { font-size: 1.6em; margin: 2em 0 1em; page-break-before: always; }
h1:first-child { page-break-before: avoid; }
p { text-indent: 2em; margin: 0.55em 0; }
svg { max-width: 100%; height: auto; }
`
  const entries: ZipEntry[] = [
    { name: 'mimetype', data: encoder.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: encoder.encode(container) },
    { name: 'OEBPS/content.opf', data: encoder.encode(contentOpf) },
    { name: 'OEBPS/nav.xhtml', data: encoder.encode(nav) },
    { name: 'OEBPS/toc.ncx', data: encoder.encode(ncx) },
    { name: 'OEBPS/styles.css', data: encoder.encode(css) },
    ...chapterFiles.map((chapter) => ({
      name: `OEBPS/${chapter.name}`,
      data: encoder.encode(
        xhtml(
          chapter.title,
          `<h1>${xml(chapter.title)}</h1>${textParagraphs(chapter.content)
            .map((paragraph) => `<p>${xml(paragraph)}</p>`)
            .join('')}`,
        ),
      ),
    })),
    ...(mapSvg
      ? [
          {
            name: 'OEBPS/map.xhtml',
            data: encoder.encode(
              xhtml('地图', `<h1>地图</h1>${mapSvg}`),
            ),
          },
        ]
      : []),
  ]
  return createZip(entries)
}
