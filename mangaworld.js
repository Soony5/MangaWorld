const _pageCache = new Map();

async function _fetchPage(url) {
    if (_pageCache.has(url)) return _pageCache.get(url);
    const res = await soraFetch(url);
    if (!res) return '';
    const text = await res.text();
    _pageCache.set(url, text);
    setTimeout(() => _pageCache.delete(url), 60000);
    return text;
}

async function searchResults(keyword) {
    try {
        const response = await soraFetch(`https://www.mangaworld.mx/archive?keyword=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        const results = [];
        const regex = /href=(https:\/\/www\.mangaworld\.mx\/manga\/[^ \n>]+) title="([^"]+)"[^>]*><img src=([^\n >]+)/g;
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            if (!seen.has(href)) {
                seen.add(href);
                results.push({ title: match[2].trim(), href, image: match[3].trim() });
            }
        }
        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const html = await _fetchPage(url);
        let description = 'Nessuna descrizione';

        const divIdx = html.indexOf('id=noidungm');
        if (divIdx !== -1) {
            const start = html.indexOf('>', divIdx) + 1;
            const end = html.indexOf('</div>', start);
            if (start > 0 && end > start) {
                description = html.slice(start, end).trim();
            }
        } else {
            const metaIdx = html.indexOf('<meta name=description');
            if (metaIdx !== -1) {
                const slice = html.slice(metaIdx, metaIdx + 400);
                const m = slice.match(/content="([^"]+)"/);
                if (m) description = m[1].replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
            }
        }

        return JSON.stringify([{ description, aliases: '', airdate: '' }]);
    } catch (e) {
        return JSON.stringify([{ description: 'Error loading description', aliases: '', airdate: '' }]);
    }
}

async function extractChapters(url) {
    try {
        const html = await _fetchPage(url);

        const listStart = html.indexOf('id=chapterList');
        const section = listStart !== -1 ? html.slice(listStart, html.indexOf('<!--M/-->', listStart)) : html;

        const regex = /class=chap href=(https:\/\/www\.mangaworld\.mx\/manga\/[^?> "']+)[^>]*><span[^>]*>([^<]+)<\/span>/g;
        const chapters = [];
        const seen = new Set();
        let match;
        while ((match = regex.exec(section)) !== null) {
            const href = match[1].trim();
            if (!seen.has(href)) {
                seen.add(href);
                chapters.push({ href, title: match[2].trim() });
            }
        }

        chapters.reverse();
        return JSON.stringify(chapters.map((ch, i) => ({ ...ch, number: i + 1 })));
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const imgIdx = html.indexOf('cdn.mangaworld.mx/chapters/');
        if (imgIdx !== -1) {
            const imgSlice = html.slice(html.lastIndexOf('<img', imgIdx), imgIdx + 200);
            const srcM = imgSlice.match(/src=(?:'|")?(https:\/\/cdn\.mangaworld\.mx\/chapters\/[^"' >]+)/);
            if (srcM) {
                const base = srcM[1].slice(0, srcM[1].lastIndexOf('/') + 1);
                const pIdx = html.indexOf('"pages":');
                if (pIdx !== -1) {
                    const pSlice = html.slice(pIdx + 8, html.indexOf(']', pIdx) + 1);
                    try {
                        const pages = JSON.parse(pSlice);
                        return pages.map(p => `<img src='${base}${p}' style='max-width:100%;height:auto;display:block;margin:0 auto;'/>`).join('<br/>');
                    } catch (_) {}
                }
            }
        }

        const fallback = html.match(/<div id="page"[^>]*>([^<]*)<\/div>/);
        return fallback ? fallback[1].trim() : 'Nessun contenuto trovato.';
    } catch (e) {
        return 'Errore estrazione contenuto.';
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (_) {
            return null;
        }
    }
}
