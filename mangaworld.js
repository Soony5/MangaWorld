// ============================================================
//  MangaWorld.mx — Modulo Sora/Sulfur
//  Tipo: manga (reader di immagini)
//
//  STRUTTURA URLs:
//    Ricerca:   https://www.mangaworld.mx/archive?keyword=QUERY
//    Manga:     https://www.mangaworld.mx/manga/{id}/{slug}/
//    Capitolo:  https://www.mangaworld.mx/manga/{id}/{slug}/read/chapter-{N}/1
//    Immagini:  https://cdn.mangaworld.mx/...
// ============================================================

// -------------------------------------------------------------------
// soraFetch — wrapper compatibile Sora (fetchv2 + fallback fetch)
// -------------------------------------------------------------------
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

// -------------------------------------------------------------------
// searchResults — cerca manga per keyword
// Input:  keyword (string)
// Output: JSON array [ { title, image, href }, ... ]
// -------------------------------------------------------------------
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://www.mangaworld.mx/archive?keyword=${encodedKeyword}`);
        const html = await response.text();

        const results = [];

        // Struttura HTML MangaWorld archivio:
        // <div class="entry">
        //   <a href="/manga/ID/slug/">
        //     <img ... data-src="https://cdn.mangaworld.mx/...">
        //     <div class="content"><div class="title">TITOLO</div></div>
        //   </a>
        // </div>
        const entryRegex = /<div[^>]+class="[^"]*entry[^"]*"[\s\S]*?<a[^>]+href="(\/manga\/[^"]+)"[\s\S]*?data-src="([^"]+)"[\s\S]*?class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/g;

        let match;
        while ((match = entryRegex.exec(html)) !== null) {
            const href = 'https://www.mangaworld.mx' + match[1].replace(/\/$/, '') + '/';
            const image = match[2].startsWith('//') ? 'https:' + match[2] : match[2];
            const title = match[3].trim();
            results.push({ title, image, href });
        }

        // Fallback: regex alternativo
        if (results.length === 0) {
            const altRegex = /<a[^>]+href="(\/manga\/[^"?#]+)"[^>]*>[\s\S]*?(?:data-src|src)="(https:\/\/cdn\.mangaworld\.mx\/[^"]+)"[\s\S]*?<\/a>/g;
            const titleRegex = /<div[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/g;

            const hrefs = [];
            const images = [];
            const titles = [];

            let m;
            while ((m = altRegex.exec(html)) !== null) {
                hrefs.push('https://www.mangaworld.mx' + m[1].replace(/\/$/, '') + '/');
                images.push(m[2]);
            }
            while ((m = titleRegex.exec(html)) !== null) {
                const t = m[1].trim();
                if (t.length > 0 && t.length < 200) titles.push(t);
            }

            for (let i = 0; i < hrefs.length && i < titles.length; i++) {
                results.push({ title: titles[i], image: images[i] || '', href: hrefs[i] });
            }
        }

        console.log('searchResults:', results.length, 'risultati trovati');
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

// -------------------------------------------------------------------
// extractDetails — ottieni dettagli di un manga
// Input:  url pagina manga
// Output: JSON array [ { description, aliases, airdate } ]
//         (array come da documentazione Sora per novels/manga)
// -------------------------------------------------------------------
async function extractDetails(url) {
    try {
        const mangaUrl = url.endsWith('/') ? url : url + '/';
        const response = await soraFetch(mangaUrl);
        const html = await response.text();

        // Descrizione / trama
        let description = 'Nessuna descrizione disponibile.';
        const descMatch = html.match(/class="[^"]*description[^"]*"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
            || html.match(/class="[^"]*info-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = descMatch[1]
                .replace(/<[^>]+>/g, '')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Titoli alternativi
        let aliases = '';
        const altMatch = html.match(/Titoli alternativi[^<]*<\/[^>]+>\s*([^<]{2,})/i);
        if (altMatch) aliases = altMatch[1].trim();

        // Autore
        let author = 'Sconosciuto';
        const authorMatch = html.match(/Autore[^<]*<\/[^>]+>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
        if (authorMatch) author = authorMatch[1].trim();

        // Stato
        let status = 'Sconosciuto';
        const statusMatch = html.match(/Stato[^<]*<\/[^>]+>[\s\S]*?<a[^>]*>\s*([^<]+)\s*<\/a>/i);
        if (statusMatch) status = statusMatch[1].trim();

        // Generi
        const genreMatches = [...html.matchAll(/archive\?genre=[^"]+">([^<]+)<\/a>/gi)];
        const genres = genreMatches.length > 0
            ? genreMatches.map(m => m[1].trim()).join(', ')
            : 'Sconosciuti';

        // Tipo (manga/manhwa/manhua/ecc.)
        let tipo = '';
        const tipoMatch = html.match(/archive\?type=[^"]+">([^<]+)<\/a>/i);
        if (tipoMatch) tipo = tipoMatch[1].trim();

        // Anno
        let anno = '';
        const annoMatch = html.match(/Anno[^<]*<\/[^>]+>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
        if (annoMatch) anno = annoMatch[1].trim();

        const aliasesText = [
            aliases ? `Titoli alternativi: ${aliases}` : '',
            `Autore: ${author}`,
            `Stato: ${status}`,
            `Generi: ${genres}`,
            tipo ? `Tipo: ${tipo}` : '',
            anno ? `Anno: ${anno}` : '',
        ].filter(Boolean).join('\n');

        const transformedResults = [{
            description,
            aliases: aliasesText,
            airdate: anno || ''
        }];

        console.log('extractDetails:', transformedResults);
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Errore nel caricamento dei dettagli.',
            aliases: 'N/A',
            airdate: ''
        }]);
    }
}

// -------------------------------------------------------------------
// extractChapters — elenca i capitoli di un manga
// Input:  url pagina manga
// Output: JSON array [ { href, number, title }, ... ] ordine crescente
// -------------------------------------------------------------------
async function extractChapters(url) {
    try {
        const mangaUrl = url.endsWith('/') ? url : url + '/';
        const response = await soraFetch(mangaUrl);
        const html = await response.text();

        const chapters = [];
        const seen = new Set();

        // Struttura MangaWorld: href="/manga/ID/slug/read/chapter-N/1"
        // Supporta anche numeri decimali: chapter-1.5
        const chapterRegex = /href="(\/manga\/[^"]+\/read\/chapter-([\d.]+)\/1)"/gi;

        let match;
        while ((match = chapterRegex.exec(html)) !== null) {
            const href = 'https://www.mangaworld.mx' + match[1];
            const numRaw = match[2];
            const number = parseFloat(numRaw);

            if (!seen.has(href)) {
                seen.add(href);
                chapters.push({
                    href,
                    number: Number.isInteger(number) ? parseInt(numRaw) : number,
                    title: `Capitolo ${numRaw}`
                });
            }
        }

        // Fallback: link senza /1 finale
        if (chapters.length === 0) {
            const altRegex = /href="(\/manga\/[^"]+\/read\/chapter-([\d.]+)[^"]*)"/gi;
            while ((match = altRegex.exec(html)) !== null) {
                // Normalizza sempre a pagina /1
                const rawPath = match[1].replace(/\/\d+$/, '') + '/1';
                const href = 'https://www.mangaworld.mx' + rawPath;
                const numRaw = match[2];
                const number = parseFloat(numRaw);

                if (!seen.has(href)) {
                    seen.add(href);
                    chapters.push({
                        href,
                        number: Number.isInteger(number) ? parseInt(numRaw) : number,
                        title: `Capitolo ${numRaw}`
                    });
                }
            }
        }

        // Ordina per numero crescente (dal più vecchio al più nuovo)
        chapters.sort((a, b) => a.number - b.number);

        console.log(`extractChapters: ${chapters.length} capitoli trovati`);
        return JSON.stringify(chapters);
    } catch (error) {
        console.log('Fetch error in extractChapters: ' + error);
        return JSON.stringify([]);
    }
}

// -------------------------------------------------------------------
// extractText — ottieni le immagini di un capitolo
// Input:  url del capitolo (es. .../read/chapter-1/1)
// Output: stringa HTML con i tag <img> di tutte le pagine del capitolo
//
// NOTA: MangaWorld è un reader di immagini. extractText restituisce
//       le pagine come HTML, che Sora visualizza nel suo manga viewer.
// -------------------------------------------------------------------
async function extractText(url) {
    try {
        // Punta sempre alla pagina 1 del capitolo
        const chapterUrl = url.replace(/\/\d+$/, '/1');
        const response = await soraFetch(chapterUrl);
        const html = await response.text();

        const pages = [];
        const seen = new Set();

        // Le pagine del capitolo sono <img> con src/data-src su cdn.mangaworld.mx
        const imgRegex = /(?:src|data-src)="(https:\/\/cdn\.mangaworld\.mx\/[^"?]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;

        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            const src = match[1];
            // Escludi immagini di sistema (cover, avatar, icone, loghi)
            if (
                !seen.has(src) &&
                !src.includes('/public/') &&
                !src.includes('/assets/') &&
                !src.includes('avatar') &&
                !src.includes('icon') &&
                !src.includes('logo') &&
                !src.includes('banner')
            ) {
                seen.add(src);
                pages.push(src);
            }
        }

        // Fallback più permissivo
        if (pages.length === 0) {
            const fallbackRegex = /"(https:\/\/cdn\.mangaworld\.mx\/[^"?]+\.(?:jpg|jpeg|png|webp))"/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                const src = match[1];
                if (!seen.has(src)) {
                    seen.add(src);
                    pages.push(src);
                }
            }
        }

        if (pages.length === 0) {
            console.log('extractText: nessuna pagina trovata per', chapterUrl);
            return '<p>Nessuna pagina trovata per questo capitolo.</p>';
        }

        // Restituisci le pagine come HTML — Sora le visualizza nel viewer manga
        const content = pages
            .map((src, i) =>
                `<img src="${src}" alt="Pagina ${i + 1}" style="width:100%;display:block;margin-bottom:2px;" referrerpolicy="no-referrer" />`
            )
            .join('\n');

        console.log(`extractText: ${pages.length} pagine estratte`);
        return content;
    } catch (error) {
        console.log('Fetch error in extractText: ' + error);
        return '<p>Errore nel caricamento delle pagine.</p>';
    }
}
