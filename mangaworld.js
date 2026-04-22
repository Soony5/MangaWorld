async function searchResults(keyword) {
    try {
        const response = await soraFetch(`https://www.mangaworld.mx/archive?keyword=${encodeURIComponent(keyword)}`);
        const html = await response.text();

        const results = [];
        // Matches HTML like: href=https://www.mangaworld.mx/manga/123/name title="Manga Title"><img src=https://cdn...
        const regex = /href=(https:\/\/www\.mangaworld\.mx\/manga\/[^ \n>]+) title="([^"]+)"[^>]*><img src=([^\n >]+)/g;

        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            if(!seen.has(href)) {
                seen.add(href);
                results.push({
                    title: match[2].trim(),
                    href: href,
                    image: match[3].trim()
                });
            }
        }
        
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        let description = 'Nessuna descrizione';
        const descMatch = htmlText.match(/<meta name=description content="([^"]+)">/);
        if (descMatch) {
            description = descMatch[1]
                .replace(/&quot;/g, '"')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .trim();
        }

        const transformedResults = [{
            description,
            aliases: '',
            airdate: ''
        }];

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: '',
            airdate: ''
        }]);
    }
}

async function extractChapters(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();
        
        const chapters = [];
        // Regex ottimizzata (senza [\\s\\S]*? che causava blocchi e lentezza)
        const regex = /class=chap href=(https:\/\/www\.mangaworld\.mx\/manga\/[^/]+\/[^/]+\/read\/[^ >"']+)[^>]*>(?:<[^>]+>)*([^<]+)<\/span>/g;
        
        let match;
        const seen = new Set();
        while ((match = regex.exec(htmlText)) !== null) {
            let href = match[1].trim();
            // remove trailing quotes if any
            if(href.endsWith('"') || href.endsWith("'")) href = href.slice(0, -1);
            
            if(!seen.has(href)) {
                seen.add(href);
                chapters.push({
                    href: href,
                    title: match[2].trim()
                });
            }
        }
        
        // MangaWorld lists chapters from newest to oldest usually, reverse for oldest to newest.
        chapters.reverse();
        
        const numberedChapters = chapters.map((ch, i) => ({
            ...ch,
            number: i + 1
        }));
        
        return JSON.stringify(numberedChapters);
    } catch (error) {
        console.log('Fetch error in extractChapters: ' + error);
        return JSON.stringify([]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        let content = "Nessun contenuto trovato.";
        
        // Find the base URL of the chapter images
        const imgMatch = htmlText.match(/<img[^>]*src=(?:'|")?(https:\/\/cdn\.mangaworld\.mx\/chapters\/[^" ']+)(?:'|")?/);
        if (imgMatch) {
            let firstImgUrl = imgMatch[1];
            let baseUrl = firstImgUrl.substring(0, firstImgUrl.lastIndexOf('/') + 1);

            // Find the pages array in JSON format
            const pagesMatch = htmlText.match(/"pages":\[(.*?)\]/);
            if (pagesMatch) {
                try {
                    // Extract pages properly
                    const pagesStr = "[" + pagesMatch[1] + "]";
                    const pages = JSON.parse(pagesStr);
                    
                    let htmlBuilder = [];
                    for(let i=0; i<pages.length; i++) {
                        let page = pages[i];
                        htmlBuilder.push("<img src='" + baseUrl + page + "' style='max-width: 100%; height: auto; display: block; margin: 0 auto;' />");
                    }
                    content = htmlBuilder.join("<br/>");
                } catch(e) {
                    // fallback if JSON.parse fails
                    console.log("JSON Parse error for pages array: " + e);
                }
            } else {
                 // Try another regex if pages array form is different
                 const pagesSimple = htmlText.match(/"pages":(\[[^\]]+\])/);
                 if(pagesSimple) {
                     const pages = JSON.parse(pagesSimple[1]);
                     let htmlBuilder = [];
                     for(let i=0; i<pages.length; i++) {
                        let page = pages[i];
                        htmlBuilder.push("<img src='" + baseUrl + page + "' style='max-width: 100%; height: auto; display: block; margin: 0 auto;' />");
                     }
                     content = htmlBuilder.join("<br/>");
                 }
            }
        } else {
            // Wait, what if Mangaworld DOES have text Light Novels and they put them in <div id="page"> ?
            // Let's have a fallback text extractor
            const contentInner = htmlText.match(/<div id="page"[^>]*>([^<]*)<\/div>/);
            if(contentInner) {
                 content = contentInner[1].trim();
            }
        }

        return content;
    } catch (error) {
        console.log("Fetch error in extractText: " + error);
        return "Errore estrazione contenuto.";
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
